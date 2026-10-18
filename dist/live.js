// Live price data from Supabase (public read-only API). The publishable key is designed to ship in clients;
// row-level security limits it to SELECT on public price tables.
export const SUPABASE_URL = 'https://mqsnshnlfwsgabrsmqsz.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CJjQ-l5ev-D4OH0Na0gFoQ_szunygff';
export const OFFERS_QUERY = '/rest/v1/offers?select=external_id,retailer,currency,url,affiliate_url,image_url,' +
  'products(slug,brand,name,size),offer_current(amount_minor,delivery_minor,availability,changed_at,last_success_at),' +
  'price_observations(observed_at,amount_minor,availability)&active=eq.true&order=external_id';

const DAY = 86400000;
const minor = n => n == null ? null : n / 100;
export const categoryOf = name => /cushion|tint|gloss|pudding/i.test(name) ? '메이크업' : /oil|cleans/i.test(name) ? '클렌징' : '스킨케어';

// Converts API rows (or the bundled snapshot, which stores the same rows) into view models.
export function toProducts(rows) {
  return rows.filter(r => r.products && r.offer_current).map(r => ({
    id: r.products.slug,
    sku: r.external_id,
    brand: r.products.brand,
    name: r.products.name,
    size: r.products.size ?? '',
    category: categoryOf(r.products.name),
    retailer: r.retailer,
    currency: r.currency,
    url: r.url,
    affiliateUrl: r.affiliate_url,
    imageUrl: r.image_url,
    price: minor(r.offer_current.amount_minor),
    delivery: minor(r.offer_current.delivery_minor),
    availability: r.offer_current.availability,
    changedAt: r.offer_current.changed_at,
    checkedAt: r.offer_current.last_success_at,
    history: [...(r.price_observations || [])]
      .sort((a, b) => a.observed_at.localeCompare(b.observed_at))
      .map(o => ({at: o.observed_at, price: minor(o.amount_minor), availability: o.availability}))
  })).sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
}

export async function loadProducts(fetchImpl = fetch, snapshotUrl = './live-snapshot.json') {
  try {
    const res = await fetchImpl(SUPABASE_URL + OFFERS_QUERY, {headers: {apikey: SUPABASE_PUBLISHABLE_KEY}, signal: AbortSignal.timeout(10000)});
    if (!res.ok) throw Error('HTTP ' + res.status);
    return {products: toProducts(await res.json()), source: 'live'};
  } catch {
    const res = await fetchImpl(snapshotUrl);
    const snap = await res.json();
    return {products: toProducts(snap.rows), source: 'snapshot', exportedAt: snap.exportedAt};
  }
}

// Catalog layer search (whole official feed, current price only). Query is reduced to safe characters
// before it is placed in the PostgREST filter.
export const catalogQuery = q => q.replace(/[^\p{L}\p{N} &'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
export function catalogSearchUrl(q, limit = 30) {
  const term = catalogQuery(q);
  if (term.length < 2) return null;
  const like = `"*${term.replace(/"/g, '')}*"`;
  const params = new URLSearchParams({
    select: 'retailer,market,sku,brand,name,price_minor,currency,availability,image_url',
    active: 'eq.true', or: `(brand.ilike.${like},name.ilike.${like})`, order: 'brand,name', limit: String(limit)
  });
  return SUPABASE_URL + '/rest/v1/catalog_items?' + params;
}
export async function searchCatalog(q, fetchImpl = fetch) {
  const url = catalogSearchUrl(q);
  if (!url) return [];
  const res = await fetchImpl(url, {headers: {apikey: SUPABASE_PUBLISHABLE_KEY}, signal: AbortSignal.timeout(10000)});
  if (!res.ok) throw Error('HTTP ' + res.status);
  return (await res.json()).map(c => ({...c, price: c.price_minor / 100}));
}
// Moves a catalog item into the tracking layer; returns the tracked product id (slug).
export async function requestTracking(item, fetchImpl = fetch) {
  const res = await fetchImpl(SUPABASE_URL + '/rest/v1/rpc/request_tracking', {method: 'POST',
    headers: {apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({p_retailer: item.retailer, p_market: item.market, p_sku: item.sku})});
  if (!res.ok) throw Error('HTTP ' + res.status);
  return res.json();
}

export const search = (products, q, category = '전체') => {
  const needle = q.trim().toLowerCase();
  return products.filter(p => (category === '전체' || p.category === category) && `${p.brand} ${p.name}`.toLowerCase().includes(needle));
};

// Price in effect on each day = last observation at or before that day. History is change-only,
// so days without a new row carry the previous price forward. Days before the first observation are empty.
// Days are Korean calendar days (collection runs 07:30 KST).
const KST = 9 * 3600000;
export function dailySeries(p, days, now = new Date()) {
  const k = new Date(now.getTime() + KST);
  const start = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = start - i * DAY, dayEnd = day + DAY - KST;
    const last = p.history.filter(h => Date.parse(h.at) < dayEnd).at(-1);
    out.push({day: new Date(day).toISOString().slice(0, 10), price: last ? last.price : null});
  }
  return out;
}

export function stats(series) {
  const v = series.map(s => s.price).filter(x => x != null);
  if (!v.length) return null;
  return {min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length, days: v.length};
}

export const trackedDays = (p, now = new Date()) => p.history.length ? Math.floor((now - Date.parse(p.history[0].at)) / DAY) + 1 : 0;
export const usd = n => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(n);
export const alertState = (target, current) => target == null ? '미설정' : current <= target ? '목표가 도달' : '기다리는 중';

export function parseTarget(raw) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(raw))) return null;
  const n = Number(raw);
  return n >= 0.01 && n <= 10000 ? n : null;
}

const KEY = 'alimi-live-v1';
export function readState(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY));
    return {
      favorites: Array.isArray(v?.favorites) ? v.favorites.filter(x => typeof x === 'string') : [],
      targets: Object.fromEntries(Object.entries(v?.targets || {}).filter(([, n]) => parseTarget(n) !== null))
    };
  } catch { return {favorites: [], targets: {}}; }
}
export function writeState(storage, state) { storage.setItem(KEY, JSON.stringify(state)); }
export function toggleFavorite(s, id) { s.favorites = s.favorites.includes(id) ? s.favorites.filter(x => x !== id) : [...s.favorites, id]; return s; }
