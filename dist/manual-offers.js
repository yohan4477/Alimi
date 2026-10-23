// Merchant links supplied by the site owner. No inferred price, stock, size or sales rank.
export const manualOffers = [{
  family_key: 'senka-perfect-whip-fa', sku: 'owner-senka-perfect-whip-fa',
  retailer: '쿠팡', market: 'KR', currency: 'KRW', brand: 'SENKA', brand_ko: '센카',
  name: '퍼펙트 휩 페이셜 워시 FA 클렌징폼', base_name: '퍼펙트 휩 페이셜 워시 FA 클렌징폼',
  category: '클렌징', price_minor: null, availability: 'unknown', image_url: null,
  url: 'https://link.coupang.com/a/h0aXItmfiS', affiliate_url: 'https://link.coupang.com/a/h0aXItmfiS',
  size_label: null, option_label: null, unit: null, unit_price_minor: null,
  source: 'owner_supplied', supplied_at: '2026-10-20', popularity_rank: null
}];
export function manualCatalog(selectedMarket, {query = '', category = null, brand = null} = {}) {
  const q = query.trim().toLowerCase();
  return manualOffers.filter(p => p.market === selectedMarket &&
    (!category || category === '전체' || p.category === category) && (!brand || p.brand === brand) &&
    (!q || `${p.brand} ${p.brand_ko} ${p.name}`.toLowerCase().includes(q)));
}
