// Server-only diagnostic aggregates. Never return device IDs or raw event properties.
const URL_BASE = 'https://mqsnshnlfwsgabrsmqsz.supabase.co';
const TEST_DEVICE = '00000000-0000-4000-8000-000000000001';
export async function readMetrics({env = process.env, fetchImpl = fetch, now = new Date(), serviceRegion = 'all'} = {}) {
  const base = {generatedAt: now.toISOString(), days: 7, unit: 'devices', transactions: 'unconnected', funnel: 'unmeasured', serviceRegion: ['kr','us'].includes(serviceRegion) ? serviceRegion : 'all'};
  const key = env.SUPABASE_SECRET_KEY;
  if (!key) return {...base, state: 'unconnected', metrics: null};
  const params = new URLSearchParams({select: 'id,received_at,device_id,name,app_version,props',
    received_at: 'gte.' + new Date(+now - 7 * 86400000).toISOString(), order: 'received_at.desc,id.desc', limit: '1000'});
  try {
    const headers = {apikey: key, Prefer: 'count=exact'};
    if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
    const response = await fetchImpl(URL_BASE + '/rest/v1/app_events?' + params, {
      headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return {...base, state: response.status === 401 || response.status === 403 ? 'denied' : 'unavailable', metrics: null};
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(r => !r || !r.id || typeof r.device_id !== 'string' || typeof r.name !== 'string' || !Number.isFinite(Date.parse(r.received_at)))) throw Error('invalid response');
    const totalText = response.headers.get('content-range')?.split('/')[1];
    const total = totalText && /^\d+$/.test(totalText) ? Number(totalText) : null;
    // Never render a capped sample as the full population.
    if (total === null || total > rows.length) return {...base, state: 'partial', metrics: null};
    const clean = [...new Map(rows.filter(r => r.device_id !== TEST_DEVICE && r.app_version !== 'verify' && +new Date(r.received_at) <= +now).map(r => [r.id, r])).values()];
    const unknownRegion = clean.filter(r=>!['kr','us'].includes(r.props?.service_region)).length;
    const scoped = base.serviceRegion === 'all' ? clean : clean.filter(r=>r.props?.service_region === base.serviceRegion);
    const count = name => new Set(scoped.filter(r => r.name === name).map(r => r.device_id)).size;
    return {...base, state: scoped.length ? 'received' : 'no_data', unknownRegionEvents: unknownRegion, lastEventAt: scoped[0]?.received_at ?? null,
      metrics: scoped.length ? {community: count('community_open'), rooms: count('chat_open'), detail: count('product_view'), merchant: count('merchant_click'), saved: count('wishlist_add')} : null};
  } catch { return {...base, state: 'unavailable', metrics: null}; }
}
