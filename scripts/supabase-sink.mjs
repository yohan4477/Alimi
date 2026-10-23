// Writes normalized feed data to Supabase with the service-role key (server-side only).
// Skipped when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent, so local runs stay file-only.
export const toMinor = amount => Math.round(amount * 100);

function client({url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl = fetch} = {}) {
  if (!url || !key) return null;
  const base = new URL(url);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co')) throw Error('Unexpected Supabase URL');
  const headers = {apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'};
  return async (path, init = {}) => {
    const signal = AbortSignal.timeout(30000);
    let res, text;
    try {
      res = await fetchImpl(new URL(path, base), {...init, headers: {...headers, ...init.headers}, redirect: 'error', signal});
      if (res.ok) text = await res.text();
    } catch (cause) {
      // Never propagate upstream messages, URLs, headers or response bodies.
      const failureKind = signal.aborted || cause?.name === 'TimeoutError' ? 'timeout' : 'transport';
      throw Object.assign(Error('Supabase request failed (' + failureKind + ')'), {failureKind});
    }
    if (!res.ok) throw Object.assign(Error('Supabase HTTP ' + res.status), {failureKind: 'http', httpStatus: res.status});
    try { return text ? JSON.parse(text) : null; }
    catch { throw Object.assign(Error('Supabase response invalid'), {failureKind: 'response'}); }
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
  let acknowledgedRows = 0;
  const totalBatches = Math.ceil(items.length / batch);
  const diagnose = (error, stage, batchIndex) => {
    const diagnostics = {stage, batchIndex, totalBatches, acknowledgedRows,
      failureKind: error.failureKind ?? 'unknown', failedRequestOutcome: 'unknown'};
    if (Number.isInteger(error.httpStatus)) diagnostics.httpStatus = error.httpStatus;
    // Acknowledged rows are NOT a committed-row count: the failed request may have committed.
    return Object.assign(Error('Supabase catalog write failed: ' + JSON.stringify(diagnostics)), {diagnostics});
  };
  for (let i = 0; i < items.length; i += batch) {
    const rows = items.slice(i, i + batch);
    try {
      await call('/rest/v1/catalog_items?on_conflict=retailer,market,sku', {method: 'POST',
        headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify(rows)});
    } catch (error) { throw diagnose(error, 'upsert', Math.floor(i / batch) + 1); }
    acknowledgedRows += rows.length;
  }
  const stale = new URLSearchParams({retailer: 'eq.' + items[0].retailer, market: 'eq.' + items[0].market, seen_at: 'lt.' + seenAt, active: 'eq.true'});
  try {
    await call('/rest/v1/catalog_items?' + stale, {method: 'PATCH', headers: {Prefer: 'return=minimal'}, body: JSON.stringify({active: false})});
  } catch (error) { throw diagnose(error, 'deactivate', null); }
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
