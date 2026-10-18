import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCsv} from './stylevana-feed.mjs';
import {registerOffer, sinkObservation} from './supabase-sink.mjs';

const money = /^\d+(\.\d{1,2})?$/;

// Matches each catalog entry to exactly one official feed row. Identity = merchant SKU + EAN + brand,
// because shades of one product share a URL. Returns per-item status; never throws for a single bad row.
export function matchCatalog(rows, catalog, observedAt = new Date().toISOString()) {
  if (!Number.isFinite(Date.parse(observedAt))) throw Error('Invalid collection time');
  return catalog.products.map(item => {
    const hits = rows.filter(r => r.merchant_product_id === item.sku && r.data_feed_id === catalog.feedId && r.merchant_id === catalog.merchantId);
    if (hits.length !== 1) return {slug: item.slug, status: hits.length ? 'ambiguous' : 'missing'};
    const r = hits[0];
    if (r.ean !== item.ean || r.brand_name !== item.feedBrand || r.currency !== catalog.currency) return {slug: item.slug, status: 'identity_mismatch'};
    if (!money.test(r.search_price) || Number(r.search_price) <= 0 || Number(r.search_price) > 10000) return {slug: item.slug, status: 'invalid_price'};
    let page, tracking, image;
    try { page = new URL(r.merchant_deep_link); tracking = new URL(r.aw_deep_link); image = new URL(r.merchant_image_url); }
    catch { return {slug: item.slug, status: 'invalid_link'}; }
    if (page.origin !== 'https://www.stylevana.com' || tracking.origin !== 'https://www.awin1.com' || tracking.pathname !== '/pclick.php' ||
      tracking.searchParams.get('m') !== catalog.merchantId || tracking.searchParams.get('p') !== r.aw_product_id ||
      image.protocol !== 'https:' || !image.hostname.endsWith('.stylevana.com')) return {slug: item.slug, status: 'invalid_link'};
    const amount = Number(r.search_price);
    const reportedDelivery = money.test(r.delivery_cost) ? Number(r.delivery_cost) : null;
    const availability = r.in_stock === '1' ? 'in_stock' : r.in_stock === '0' ? 'out_of_stock' : 'unknown';
    return {slug: item.slug, status: 'ok', product: item, offer: {
      url: page.origin + page.pathname, affiliateUrl: tracking.href, imageUrl: image.href, ean: r.ean
    }, observation: {
      retailer: catalog.retailer, market: catalog.market, merchantProductId: item.sku, observedAt, method: 'awin_feed',
      amount, reportedDelivery, availability,
      fingerprint: createHash('sha256').update(JSON.stringify({amount, availability, reportedDelivery, awProductId: r.aw_product_id})).digest('hex')
    }};
  });
}

export async function runCatalog(inputPath, root, options = {}) {
  const bytes = await readFile(inputPath);
  const rows = parseCsv((bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes).toString('utf8'));
  const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog.json'), 'utf8'));
  const results = matchCatalog(rows, catalog, options.observedAt);
  const summary = [];
  for (const r of results) {
    if (r.status !== 'ok') { summary.push({slug: r.slug, status: r.status}); continue; }
    try {
      const reg = await registerOffer(catalog, r.product, r.offer, options);
      if (reg.skipped) { summary.push({slug: r.slug, status: 'ok', amount: r.observation.amount, db: 'skipped'}); continue; }
      const {changed} = await sinkObservation(r.observation, options);
      summary.push({slug: r.slug, status: 'ok', amount: r.observation.amount, db: changed ? 'changed' : 'unchanged'});
    } catch (e) { summary.push({slug: r.slug, status: 'db_error', error: e.message}); }
  }
  return {sourceRows: rows.length, matched: results.filter(r => r.status === 'ok').length, total: results.length, items: summary};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const input = process.argv[2] ?? resolve(root, '.private/stylevana.csv.gz');
    const result = await runCatalog(input, root);
    console.log(JSON.stringify(result, null, 1));
    // Surface partial failures in CI without blocking the items that did succeed.
    if (result.items.some(i => i.status !== 'ok')) process.exitCode = 1;
  } catch (e) { console.error('Catalog import failed: ' + (e.message.includes('https:') ? 'details suppressed' : e.message)); process.exitCode = 1; }
}
