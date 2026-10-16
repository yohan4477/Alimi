// Manual public-page observation. Never mix these USD values with KRW fixtures.
export const observedProductId = '2';
import {priceObservations} from './observed-data.js';
import {stylevanaFeed} from './stylevana-data.js';
// Official feed and manual evidence retain their own method and collection dates.
export const observedHistory = [...priceObservations, ...stylevanaFeed.history].sort((a,b)=>a.observedOn.localeCompare(b.observedOn)||(a.observedAt||'').localeCompare(b.observedAt||''));
export const observedPrice = observedHistory.at(-1);
export const hasOfficialFeed = observedPrice.method === 'awin_feed';
export const alternativeProductPage = {
  retailer: 'iHerb', amount: null,
  url: 'https://www.iherb.com/pr/cosrx-advanced-snail-96-mucin-power-essence-3-38-fl-oz-100-ml/77208'
};
export const usd = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(value);
export function parseUsdTarget(raw) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(raw))) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0.01 && n <= 10000 ? n : null;
}
export function readUsdTarget(storage) {
  try { return parseUsdTarget(storage.getItem('alimi-observed-us-cosrx-target-v1')); }
  catch { return null; }
}


