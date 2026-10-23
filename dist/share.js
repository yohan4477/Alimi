import {isSyntheticTarget,isSyntheticProductTarget} from './public-routes.js';
// Share a room or product (journey reference 3-3): the system share sheet when there is one, otherwise
// copy the link. Links are plain web URLs (?room= / ?product=) that open the same screen; no tracking params.
import {region, normalizeRegion} from './region.js';
import {t} from './i18n.js';

export function shareUrl(params, href = globalThis.location?.href ?? '') {
  const u = new URL(href);
  const selected=normalizeRegion(u.pathname.split('/')[1]) || normalizeRegion(u.searchParams.get('region')) || region;
  if (!selected) throw Error('A service market is required to share');
  const language = u.searchParams.get('lang');
  u.pathname='/live'; u.search = new URLSearchParams(params).toString(); u.hash = '';
  u.searchParams.set('region', selected);
  if (language === 'ko' || language === 'en') u.searchParams.set('lang', language);
  u.searchParams.delete('demo');
  return u.href;
}
export async function share({title, url}, toast = () => {}, nav = globalThis.navigator) {
  if (nav?.share) {
    try { await nav.share({title, text: title, url}); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  try { await nav.clipboard.writeText(url); toast(t('share.copied')); return 'copied'; }
  catch { toast(`${t('share.failed')} ${url}`); return 'failed'; }
}
// What a shared link asks to open on arrival.
export function sharedTarget(search = globalThis.location?.search ?? '') {
  const q = new URLSearchParams(search), room = q.get('room'), product = q.get('product');
  if (isSyntheticTarget(room) || isSyntheticProductTarget(product)) return null;
  if (room && /^[a-z0-9-]{2,64}$/.test(room)) return {room};
  if (product && product.length <= 200) return {product};
  return null;
}
