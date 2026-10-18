import {t} from './i18n.js';
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
export async function renderProductInfo(box, item, fetchImpl = fetch) {
  box.innerHTML = productInfoHTML(item);
  try {
    contents ??= fetchImpl('./product-content.json').then(r => { if (!r.ok) throw Error('content'); return r.json(); }).catch(() => ({items:[]}));
    const data = await contents;
    if (box.isConnected) box.innerHTML = productInfoHTML(item, approvedCopy(data.items ?? [], item));
  } catch { /* category guidance remains useful without licensed copy */ }
}
