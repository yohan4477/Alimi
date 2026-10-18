// Splits a catalog name into product family + variant so different sizes / shades of the same product can be
// shown as one card with size chips, and compared by unit price. Feed names look like
//   "Heartleaf Pore Control Cleansing Oil - 200ml"
//   "Mask Fit Red Cushion - 18g - 21C Cool Ivory"
//   "Juicy Lasting Tint - #22 Pomelo Skin - 5.5g"
//   "PDRN Pink One Day Serum - 1.5ml*10pcs"
//   "Advanced Snail 92 All In One Cream (3ea) Set"
// Segments are separated by " - "; the first segment is the product, a segment that is a quantity is the
// size, everything else is the option (shade, scent, type).
const UNITS = {ml: 'ml', g: 'g', gr: 'g', oz: 'oz', pcs: 'pcs', pc: 'pcs', ea: 'pcs', sheets: 'pcs', sheet: 'pcs', pads: 'pcs', pad: 'pcs', patches: 'pcs', sticks: 'pcs', capsules: 'pcs', tablets: 'pcs'};
const SIZE = /^(\d+(?:\.\d+)?)\s*(ml|g|gr|oz|pcs|pc|ea|sheets?|pads?|patches|sticks|capsules|tablets)\b(?:\s*[*x×]\s*(\d+)\s*(?:pcs|pc|ea|sheets?|pads?|patches|sticks)?)?(?:\s*\(\s*\d+\s*(?:pcs|ea)\s*\))?$/i;
const PACK = /\s*\(\s*(\d+)\s*ea\s*\)\s*set\s*$/i;
// "20ea*19g": count first, then the size of one piece.
const COUNT_FIRST = /^(\d+)\s*(?:ea|pcs|sheets?)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*(ml|g)$/i;
// Mixed bundles ("A (1ea) + B (1ea) Set", "10ml & 5ml Set") have no single comparable quantity.
const MIXED = /\(\s*\d+\s*ea\s*\)\s*[+&]|\s[+&]\s.*\bset\b/i;

export function parseVariant(name) {
  let rest = String(name ?? '').trim();
  let pack = 1;
  const mixed = MIXED.test(rest);
  const pm = !mixed && rest.match(PACK);
  if (pm) { pack = Number(pm[1]); rest = rest.slice(0, pm.index).trim(); }
  const parts = rest.split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
  const base = parts.shift() ?? rest;
  let size = null;
  const options = [];
  for (const part of parts) {
    const m = !size && part.match(SIZE);
    const c = !size && !m && part.match(COUNT_FIRST);
    if (m) size = {value: Number(m[1]), unit: UNITS[m[2].toLowerCase()], count: m[3] ? Number(m[3]) : 1, label: part};
    else if (c) size = {value: Number(c[2]), unit: c[3].toLowerCase(), count: Number(c[1]), label: part};
    else options.push(part);
  }
  const quantity = size && !mixed ? size.value * size.count * pack : null;
  return {
    base, size, pack, mixed, option: options.join(' · ') || null,
    sizeLabel: [size?.label, pack > 1 ? `×${pack}` : null].filter(Boolean).join(' ') || null,
    unit: size?.unit ?? null, quantity
  };
}

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim();
export const familyKey = (brand, name) => norm(brand) + '|' + norm(parseVariant(name).base);

// Price per 10ml / 10g / 1oz / 1pc in minor units, or null when the quantity is unknown.
export function unitPriceMinor(priceMinor, variant) {
  if (!variant.quantity) return null;
  const per = variant.unit === 'ml' || variant.unit === 'g' ? 10 : 1;
  return Math.round((priceMinor / variant.quantity) * per);
}
export const unitLabel = unit => (unit === 'ml' || unit === 'g' ? '10' + unit : unit === 'pcs' ? 'pc' : unit);
