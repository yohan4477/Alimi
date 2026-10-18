// Writes a normalized feed observation to Supabase via the service-role-only RPC.
// Skipped when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent, so local runs stay file-only.
export const toMinor = amount => Math.round(amount * 100);

export async function sinkObservation(row, {url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl = fetch} = {}) {
  if (!url || !key) return {skipped: true};
  const base = new URL(url);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co')) throw Error('Unexpected Supabase URL');
  const headers = {apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'};
  const call = async (path, init) => {
    let res;
    try { res = await fetchImpl(new URL(path, base), {...init, headers, redirect: 'error', signal: AbortSignal.timeout(30000)}); }
    catch { throw Error('Supabase request failed'); }
    if (!res.ok) throw Error('Supabase HTTP ' + res.status);
    return res.json();
  };
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
