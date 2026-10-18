// Category, origin and display brand for catalog rows. Categories come from product-name keywords because
// the feed's own category columns are not guaranteed in every configured feed. Order matters: the first
// matching rule wins (e.g. "lip sleeping mask" is 립, "sun cushion" is 선케어, "mask fit cushion" is 베이스메이크업, "hand cream" is 헤어·바디).
export const CATEGORIES = ['세트', '선케어', '클렌징', '토너·패드', '에센스·세럼', '크림·로션', '마스크팩', '립', '베이스메이크업', '아이메이크업', '헤어·바디', '기타'];

const RULES = [
  ['세트', /\b(set|sets|kit|bundle|duo|trio|gift)\b/],
  ['헤어·바디', /\b(shampoo|conditioner|hair|scalp|body|hand cream|hand wash|foot|deodorant|tooth|toothpaste|mouth|bath|soap)\b/],
  ['선케어', /\b(sun|spf\d*|uv|sunscreen|sunblock)\b/],
  ['립', /\b(lip|lips|overlip|tint|gloss|lipstick|rouge|velvet)\b/],
  ['클렌징', /\b(cleans\w*|cleanser|foam|micellar|micelle|remover|removing|scrub|peeling|exfoliat\w*)\b/],
  ['베이스메이크업', /\b(cushion|foundation|bb|cc|concealer|primer|base|powder|pact|setting|blush|blusher|cheek|highlighter|contour)\b/],
  ['마스크팩', /\b(mask|masks|sheet|patch|patches|pack)\b/],
  ['아이메이크업', /\b(eyeshadow|shadow|palette|mascara|eyeliner|liner|brow|brows|eyebrow|eyebrows|lash|lashes|eyelashes|eyes)\b/],
  ['토너·패드', /\b(toner|toners|pad|pads|skin booster|mist)\b/],
  ['에센스·세럼', /\b(serum|ampoule|ampule|essence|concentrate|shot|booster)\b/],
  ['크림·로션', /\b(cream|creme|lotion|emulsion|moisturi[sz]er|gel|balm|oil)\b/]
];

export function categoryOf(name) {
  // "Cream - 50ml (2ea) Set" is a multipack of one product, so it is categorised as that product.
  const n = String(name ?? '').toLowerCase().replace(/\(\s*\d+\s*ea\s*\)\s*set\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ');
  return RULES.find(([, re]) => re.test(n))?.[0] ?? '기타';
}

// origin: 'KR' (listed in Alimi), 'other' (not Korean → excluded), null (retailer bundle → excluded).
export function makeBrandInfo(brands) {
  const nonKorean = new Set(brands.nonKorean.map(b => b.toLowerCase()));
  const hidden = new Set(brands.hidden.map(b => b.toLowerCase()));
  const ko = new Map(Object.entries(brands.korean).map(([k, v]) => [k.toLowerCase(), v]));
  return brand => {
    const key = String(brand ?? '').trim().toLowerCase();
    return {origin: hidden.has(key) ? null : nonKorean.has(key) ? 'other' : 'KR', brandKo: ko.get(key) ?? null};
  };
}
