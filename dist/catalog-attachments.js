import {manualOffers} from './manual-offers.js';
import {amount, money} from './region.js';
import {t} from './i18n.js';

// Local owner links are browse/save/buy entries, not registered server catalog references.
// Match their stable identity as well as provenance so restored reference-only drafts stay blocked.
export function canAttachCatalogItem(item) {
  return Boolean(item && item.source !== 'owner_supplied' && !manualOffers.some(local =>
    ['retailer', 'market', 'sku'].every(key => String(item[key] ?? '').trim() === local[key])));
}
export function requireServerCatalogItem(item) {
  if (item != null && !canAttachCatalogItem(item)) throw Error('chat:item');
  return item;
}
export function catalogItemPrice(item) {
  const code = item.currency ?? (item.market === 'KR' ? 'KRW' : 'USD');
  if (!['USD', 'KRW'].includes(code) || !Number.isFinite(item.price_minor) || item.price_minor <= 0) return t('price.atRetailer');
  return money(amount(item.price_minor, code), code);
}
