import {t} from './i18n.js';
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from './live.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let contents;
export const safeSource = raw => { try {const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;} catch {return null;} };
// Only explicitly licensed affiliate descriptions are published. Category guidance is our own text.
export function approvedCopy(rows, item) {
  return rows.find(r => r.retailer === item.retailer && r.sku === item.sku && r.market === (item.market ?? 'US') &&
    r.permissionReference?.trim() && r.description?.trim() && safeSource(r.sourceUrl));
}
export function productInfoHTML(item, copy = null) {
  const category = item.category ?? '기타', known = t('about.type.' + category), source = safeSource(copy?.sourceUrl ?? item.url);
  return `<section class="product-description"><h2>${esc(t('about.title'))}</h2><p>${esc(known.startsWith('about.type.') ? t('about.type.기타') : known)}</p>${copy ? `<h3>${esc(t('about.official'))}</h3><p class="official-copy">${esc(copy.description)}</p>` : `<small>${esc(t('about.general'))}</small>`}${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(t('about.source'))}</a>` : ''}</section>`;
}
// Retailer description stored with the catalog row; usable only when its permission basis is recorded.
export function catalogCopy(row, item) {
  return row?.description?.trim() && row.description_permission?.trim() && safeSource(row.url ?? item.url)
    ? {retailer: item.retailer, market: item.market ?? 'US', sku: item.sku, description: row.description, sourceUrl: row.url ?? item.url, permissionReference: row.description_permission} : null;
}
export async function renderProductInfo(box, item, fetchImpl = fetch) {
  box.innerHTML = productInfoHTML(item);
  try {
    contents ??= fetchImpl('./product-content.json').then(r => { if (!r.ok) throw Error('content'); return r.json(); }).catch(() => ({items:[]}));
    let copy = approvedCopy((await contents).items ?? [], item);
    if (!copy && item.sku) {
      const params = new URLSearchParams({select: 'url,description,description_permission', sku: 'eq.' + item.sku, retailer: 'eq.' + item.retailer, limit: '1'});
      const res = await fetchImpl(SUPABASE_URL + '/rest/v1/catalog_items?' + params, {headers: {apikey: SUPABASE_PUBLISHABLE_KEY}});
      if (res.ok) copy = catalogCopy((await res.json())[0], item);
    }
    if (box.isConnected) box.innerHTML = productInfoHTML(item, copy);
  } catch { /* category guidance remains useful without licensed copy */ }
}
