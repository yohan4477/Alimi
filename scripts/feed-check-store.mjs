// Service-only feed health ledger. Never return credentials or request URLs in errors.
export function feedCheckStore({url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl = fetch} = {}) {
  if (!url || !key) throw Error('Supabase feed-check credentials are required');
  const base = new URL(url);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co')) throw Error('Unexpected Supabase endpoint');
  return async (path, init = {}) => {
    let res;
    try { res = await fetchImpl(new URL(path, base), {...init, headers: {apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...init.headers}, redirect: 'error', signal: AbortSignal.timeout(30000)}); }
    catch { throw Error('Feed-check ledger request failed'); }
    if (!res.ok) throw Error('Feed-check ledger HTTP ' + res.status);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}
