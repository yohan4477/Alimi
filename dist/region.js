// Service market is independent of UI language. Never infer a country from language or IP.
export const REGIONS = ['kr', 'us'];
export const normalizeRegion = value => REGIONS.includes(String(value).toLowerCase()) ? String(value).toLowerCase() : null;
export function resolveRegion({pathname = '', search = '', storage} = {}) {
  const path = normalizeRegion(pathname.split('/')[1]);
  const query = normalizeRegion(new URLSearchParams(search).get('region'));
  let saved; try { saved = normalizeRegion(storage?.getItem('seoulbeauty-region')); } catch {}
  return path || query || saved || 'us';
}
let storage; try { storage = globalThis.localStorage; } catch {}
export const region = resolveRegion({pathname: globalThis.location?.pathname, search: globalThis.location?.search, storage});
try { storage?.setItem('seoulbeauty-region', region); } catch {}
export const market = region.toUpperCase();
export const currency = region === 'kr' ? 'KRW' : 'USD';
export const defaultLanguage = region === 'kr' ? 'ko' : 'en';
export function inRegion(row, selected = region) {
  // Existing unclassified rooms belong to the original US pilot, never silently to Korea.
  return (normalizeRegion(row.service_region) || 'us') === selected;
}
export function inMarket(row, selected = region) {
  const m = normalizeRegion(row.market);
  return (m || (row.currency === 'KRW' ? 'kr' : row.currency === 'USD' ? 'us' : null)) === selected;
}
export function regionURL(selected, href = globalThis.location?.href) {
  if (!normalizeRegion(selected)) throw Error('Invalid service region');
  const u = new URL(href); u.pathname = '/' + selected; u.hash = '';
  // A manual market switch opens its home, rather than carrying a room from another market.
  for (const k of ['room', 'product', 'post', 'productRooms', 'region']) u.searchParams.delete(k);
  // Picking a market resets the UI to its language (US → English, KR → Korean); the user can switch back.
  u.searchParams.set('lang', selected === 'kr' ? 'ko' : 'en');
  return u;
}
export function languageURL(language, href = globalThis.location?.href) {
  const u = new URL(href); u.searchParams.set('lang', language === 'ko' ? 'ko' : 'en'); return u;
}
export const amount = (n, code=currency) => n == null ? null : n / (code==='KRW'?1:100);
export const money = (n, code = currency) => new Intl.NumberFormat(code === 'KRW' ? 'ko-KR' : 'en-US', {style:'currency',currency:code}).format(n);
