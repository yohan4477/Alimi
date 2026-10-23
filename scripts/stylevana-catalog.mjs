import {contentGrant} from '../dist/content-rights.js';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCsv} from './stylevana-feed.mjs';
import {registerOffer, sinkObservation, upsertCatalog, listOffers} from './supabase-sink.mjs';
import {categoryOf, makeBrandInfo} from './catalog-taxonomy.mjs';
import {parseVariant, familyKey, unitPriceMinor} from './catalog-variants.mjs';

const money = /^\d+(\.\d{1,2})?$/;

// Matches each catalog entry to exactly one official feed row. Identity = merchant SKU + EAN + brand,
// because shades of one product share a URL. Returns per-item status; never throws for a single bad row.
export function matchCatalog(rows, catalog, observedAt = new Date().toISOString()) {
  if (!Number.isFinite(Date.parse(observedAt))) throw Error('Invalid collection time');
  return catalog.products.map(item => {
    const hits = rows.filter(r => r.merchant_product_id === item.sku && r.data_feed_id === catalog.feedId && r.merchant_id === catalog.merchantId);
    if (hits.length !== 1) return {slug: item.slug, status: hits.length ? 'ambiguous' : 'missing'};
    const r = hits[0];
    if ((item.ean && r.ean !== item.ean) || (item.feedBrand && r.brand_name !== item.feedBrand) || r.currency !== catalog.currency) return {slug: item.slug, status: 'identity_mismatch'};
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

// Retailer description as plain text: scripts/styles dropped, tags removed, common entities decoded.
export function descriptionText(value) {
  return String(value ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li)>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0, 6000);
}
const describe = (permission, raw) => {
  const text = permission ? descriptionText(raw).slice(0, 2000).trim() : '';
  return text.length >= 20 ? {description: text, description_permission: permission} : {description: null, description_permission: null};
};

// Catalog layer: every valid merchant SKU, including all brand origins, bundles and deal listings.
// EAN identifies a product, not a retailer offer: keep distinct SKUs even when they share an EAN.
export function buildCatalogItems(rows, catalog, seenAt, brandInfo = () => ({origin: 'KR', brandKo: null})) {
  // Descriptions are published only when catalog.json records the permission basis for them.
  const grant = contentGrant(catalog.descriptionPermission, {retailer: catalog.retailer, market: catalog.market});
  const permission = grant ? JSON.stringify(grant) : null;
  const valid = [];
  for (const r of rows) {
    if (r.data_feed_id !== catalog.feedId || r.merchant_id !== catalog.merchantId || r.currency !== catalog.currency) continue;
    if (!/^[A-Za-z0-9-]{1,40}$/.test(r.merchant_product_id) || !r.product_name) continue;
    // Missing brand metadata must not hide an otherwise valid merchant SKU.
    const brandName = String(r.brand_name ?? '').trim();
    const brand = brandInfo(brandName);
    if (!money.test(r.search_price) || Number(r.search_price) <= 0 || Number(r.search_price) > 10000) continue;
    let page, tracking, image = null;
    try { page = new URL(r.merchant_deep_link); tracking = new URL(r.aw_deep_link); if (r.merchant_image_url) image = new URL(r.merchant_image_url); } catch { continue; }
    if (page.origin !== 'https://www.stylevana.com' || tracking.origin !== 'https://www.awin1.com' || tracking.searchParams.get('m') !== catalog.merchantId) continue;
    if (image && (image.protocol !== 'https:' || !image.hostname.endsWith('.stylevana.com'))) image = null;
    const deal = /^\s*\[deal\]/i.test(r.product_name);
    let name = r.product_name.replace(/^\s*\[deal\]\s*/i, '').trim();
    const prefix = brandName.toLowerCase();
    if (prefix && name.toLowerCase().startsWith(prefix)) name = name.slice(prefix.length).replace(/^\s*-\s*/, '').trim() || name;
    const variant = parseVariant(name), priceMinor = Math.round(Number(r.search_price) * 100);
    valid.push({deal, item: {
      retailer: catalog.retailer, market: catalog.market, sku: r.merchant_product_id, currency: r.currency, ean: r.ean || null,
      brand: brandName, brand_ko: brand.brandKo, name: deal ? '[Deal] ' + name : name, category: categoryOf(name), price_minor: priceMinor,
      family_key: familyKey(brandName, name), base_name: variant.base, size_label: variant.sizeLabel, option_label: variant.option,
      unit: variant.unit, quantity: variant.quantity, unit_price_minor: unitPriceMinor(priceMinor, variant),
      delivery_minor: money.test(r.delivery_cost) ? Math.round(Number(r.delivery_cost) * 100) : null,
      availability: r.in_stock === '1' ? 'in_stock' : r.in_stock === '0' ? 'out_of_stock' : 'unknown',
      url: page.origin + page.pathname, affiliate_url: tracking.href, image_url: image?.href ?? null, seen_at: seenAt, active: true,
      ...describe(permission, r.description)
    }});
  }
  const seen = new Set();
  return valid.map(v => v.item).filter(i => !seen.has(i.sku) && seen.add(i.sku));
}

export async function runCatalog(inputPath, root, options = {}) {
  const bytes = await readFile(inputPath);
  const rows = parseCsv((bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes).toString('utf8'));
  console.log('feed columns: ' + Object.keys(rows[0] ?? {}).join(', ')); // names only, never values
  const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog.json'), 'utf8'));
  const brandInfo = makeBrandInfo(JSON.parse(await readFile(resolve(root, 'data/brands.json'), 'utf8')));
  catalog.products = catalog.products.map(p => ({...p, category: categoryOf(p.name), brandKo: brandInfo(p.feedBrand).brandKo,
    familyKey: familyKey(p.feedBrand, p.name), sizeLabel: p.size ?? null}));
  const observedAt = options.observedAt ?? new Date().toISOString();
  // Tracking layer = curated catalog.json + offers users asked to track (request_tracking).
  const curated = new Set(catalog.products.map(p => p.sku));
  const extra = ((await listOffers(catalog.retailer, catalog.market, options)) ?? [])
    .filter(o => !curated.has(o.external_id)).map(o => ({slug: 'sku-' + o.external_id, sku: o.external_id, ean: o.ean, tracked: true}));
  const results = matchCatalog(rows, {...catalog, products: [...catalog.products, ...extra]}, observedAt);
  const summary = [];
  for (const r of results) {
    // User-requested offers can disappear from the feed; report them without failing the run.
    if (r.status !== 'ok') { summary.push({slug: r.slug, status: r.status, ...(extra.some(e => e.slug === r.slug) && {tracked: true})}); continue; }
    try {
      const reg = r.product.tracked ? {skipped: false} : await registerOffer(catalog, r.product, r.offer, options);
      if (reg.skipped) { summary.push({slug: r.slug, status: 'ok', amount: r.observation.amount, db: 'skipped'}); continue; }
      const {changed} = await sinkObservation(r.observation, options);
      summary.push({slug: r.slug, status: 'ok', amount: r.observation.amount, db: changed ? 'changed' : 'unchanged'});
    } catch (e) { summary.push({slug: r.slug, status: 'db_error', error: e.message}); }
  }
  const items = buildCatalogItems(rows, catalog, observedAt, brandInfo);
  let catalogLayer;
  try { const c = await upsertCatalog(items, observedAt, options); catalogLayer = {items: items.length, db: c.skipped ? 'skipped' : 'upserted'}; }
  catch (e) { catalogLayer = {items: items.length, db: 'db_error', error: e.message}; }
  return {sourceRows: rows.length, matched: results.filter(r => r.status === 'ok').length, total: results.length, items: summary, catalogLayer};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const input = process.argv[2] ?? resolve(root, '.private/stylevana.csv.gz');
    const result = await runCatalog(input, root);
    console.log(JSON.stringify(result, null, 1));
    // Surface partial failures in CI without blocking the items that did succeed.
    if (result.items.some(i => i.status !== 'ok' && !i.tracked) || result.catalogLayer.db === 'db_error') process.exitCode = 1;
  } catch (e) { console.error('Catalog import failed: ' + (e.message.includes('https:') ? 'details suppressed' : e.message)); process.exitCode = 1; }
}
