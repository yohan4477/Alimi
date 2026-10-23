import {marketDecision,currentMarket} from './market-preference.js';
// Explicit market choice is independent of UI language. Only the trusted KR hint can suggest a first-visit market.
export const REGIONS = ['kr', 'us'];
export const normalizeRegion = value => REGIONS.includes(String(value).toLowerCase()) ? String(value).toLowerCase() : null;
export function resolveRegion(options={}) { return marketDecision(options).region; }
let storage; try { storage = globalThis.localStorage; } catch {}
export const region = currentMarket() || resolveRegion({pathname:globalThis.location?.pathname,search:globalThis.location?.search,storage});
export const market = region?.toUpperCase()||null;
export const currency = region === 'kr' ? 'KRW' : region === 'us' ? 'USD' : null;
export const defaultLanguage = region === 'kr' ? 'ko' : 'en';
export function inRegion(row, selected = region) {
  // Existing unclassified rooms belong to the original US pilot, never silently to Korea.
  return (normalizeRegion(row.service_region) || 'us') === selected;
}
export function inMarket(row, selected = region) {
  if (!normalizeRegion(selected)) return false;
  const m = normalizeRegion(row.market);
  return (m || (row.currency === 'KRW' ? 'kr' : row.currency === 'USD' ? 'us' : null)) === selected;
}
export function regionURL(selected, href = globalThis.location?.href) {
  if (!normalizeRegion(selected)) throw Error('Invalid service region');
  const u = new URL(href); u.pathname = '/live'; u.hash = '';
  // A manual market switch opens its home, rather than carrying a room from another market.
  for (const k of ['room', 'product', 'post', 'productRooms', 'region']) u.searchParams.delete(k);
  u.searchParams.set('region', normalizeRegion(selected));
  // Keep language independent from the service market.
  return u;
}
export function languageURL(language, href = globalThis.location?.href) {
  const u = new URL(href); u.searchParams.set('lang', language === 'ko' ? 'ko' : 'en'); return u;
}
export const amount = (n, code=currency) => n == null ? null : n / (code==='KRW'?1:100);
export const money = (n, code = currency) => new Intl.NumberFormat(code === 'KRW' ? 'ko-KR' : 'en-US', {style:'currency',currency:code}).format(n);
