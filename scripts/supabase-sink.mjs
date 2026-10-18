// Writes normalized feed data to Supabase with the service-role key (server-side only).
// Skipped when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent, so local runs stay file-only.
export const toMinor = amount => Math.round(amount * 100);

function client({url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl = fetch} = {}) {
  if (!url || !key) return null;
  const base = new URL(url);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co')) throw Error('Unexpected Supabase URL');
  const headers = {apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'};
  return async (path, init = {}) => {
    let res;
    try { res = await fetchImpl(new URL(path, base), {...init, headers: {...headers, ...init.headers}, redirect: 'error', signal: AbortSignal.timeout(30000)}); }
    catch { throw Error('Supabase request failed'); }
    if (!res.ok) throw Error('Supabase HTTP ' + res.status);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

// Upserts the catalog product and its offer so data/catalog.json stays the source of truth.
export async function registerOffer(catalog, product, offer, options) {
  const call = client(options);
  if (!call) return {skipped: true};
  const upsert = {Prefer: 'resolution=merge-duplicates,return=representation'};
  const [p] = await call('/rest/v1/products?on_conflict=slug', {method: 'POST', headers: upsert, body: JSON.stringify({
    slug: product.slug, brand: product.brand, name: product.option ? `${product.name} ${product.option}` : product.name, size: product.size,
    category: product.category ?? null, brand_ko: product.brandKo ?? null,
    family_key: product.familyKey ?? null, size_label: product.sizeLabel ?? null
  })});
  const [o] = await call('/rest/v1/offers?on_conflict=retailer,market,external_id', {method: 'POST', headers: upsert, body: JSON.stringify({
    product_id: p.id, retailer: catalog.retailer, market: catalog.market, currency: catalog.currency, external_id: product.sku,
    ean: offer.ean, url: offer.url, affiliate_url: offer.affiliateUrl, image_url: offer.imageUrl, active: true
  })});
  return {skipped: false, offerId: o.id};
}

// Catalog layer: upsert the whole feed in batches, then hide items that were not in this feed.
export async function upsertCatalog(items, seenAt, options, batch = 500) {
  const call = client(options);
  if (!call) return {skipped: true};
  if (!items.length) throw Error('Empty catalog; refusing to deactivate everything');
  for (let i = 0; i < items.length; i += batch) {
    await call('/rest/v1/catalog_items?on_conflict=retailer,market,sku', {method: 'POST',
      headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify(items.slice(i, i + batch))});
  }
  const stale = new URLSearchParams({retailer: 'eq.' + items[0].retailer, market: 'eq.' + items[0].market, seen_at: 'lt.' + seenAt, active: 'eq.true'});
  await call('/rest/v1/catalog_items?' + stale, {method: 'PATCH', headers: {Prefer: 'return=minimal'}, body: JSON.stringify({active: false})});
  return {skipped: false, upserted: items.length};
}

// Offers in the tracking layer (curated + user-requested) for one retailer/market.
export async function listOffers(retailer, market, options) {
  const call = client(options);
  if (!call) return null;
  const q = new URLSearchParams({select: 'external_id,ean', retailer: 'eq.' + retailer, market: 'eq.' + market, active: 'eq.true'});
  return call('/rest/v1/offers?' + q, {method: 'GET'});
}

export async function sinkObservation(row, options) {
  const call = client(options);
  if (!call) return {skipped: true};
  const q = new URLSearchParams({select: 'id', retailer: 'eq.' + row.retailer, market: 'eq.' + row.market, external_id: 'eq.' + row.merchantProductId});
  const offers = await call('/rest/v1/offers?' + q, {method: 'GET'});
  if (offers.length !== 1) throw Error('Offer not registered in Supabase');
  const changed = await call('/rest/v1/rpc/ingest_observation', {method: 'POST', body: JSON.stringify({
    p_offer_id: offers[0].id, p_observed_at: row.observedAt, p_amount_minor: toMinor(row.amount),
    p_delivery_minor: row.reportedDelivery == null ? null : toMinor(row.reportedDelivery),
    p_availability: row.availability, p_fingerprint: row.fingerprint, p_source: row.method
  })});
  return {skipped: false, changed};
}

if (process.argv[1]?.endsWith('supabase-sink.mjs')) {
  const {readFile} = await import('node:fs/promises');
  try {
    const {latest} = JSON.parse(await readFile(process.argv[2] ?? 'data/stylevana-us.json', 'utf8'));
    console.log(JSON.stringify(await sinkObservation(latest)));
  } catch (e) { console.error('Supabase sink failed: ' + e.message); process.exitCode = 1; }
}
