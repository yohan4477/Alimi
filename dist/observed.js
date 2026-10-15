// Manual public-page observation. Never mix these USD values with KRW fixtures.
export const observedProductId = '2';
export const observedPrice = {
  currency: 'USD', market: 'US', amount: 17.50, observedOn: '2026-10-15',
  retailer: 'Stylevana US', size: '100ml', quantity: 1,
  shipping: null, tax: null, availability: 'unknown',
  url: 'https://www.stylevana.com/en_US/cosrx-advanced-snail-96-mucin-power-essence-100ml10777.html'
};
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
