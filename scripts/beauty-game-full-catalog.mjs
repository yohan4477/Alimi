// Builds web/beauty-play/catalog-full.json: every active, in-stock US catalog product from a Korean brand in the game's six kinds,
// one entry per product family with its shades/sizes as options. The hand-matched game products stay as they are
// and their SKUs are left out here. Reads the public catalog (publishable key), writes nothing to the database.
import {writeFile, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {makeBrandInfo} from './catalog-taxonomy.mjs';

const SUPABASE_URL = 'https://mqsnshnlfwsgabrsmqsz.supabase.co';
const KEY = 'sb_publishable_CJjQ-l5ev-D4OH0Na0gFoQ_szunygff';
const FIELDS = 'sku,brand,brand_ko,name,base_name,category,family_key,size_label,option_label,image_url,url,availability';
const word = re => name => re.test(String(name).toLowerCase().replace(/[^a-z0-9 ]+/g, ' '));

// Catalog category → game kind. The first rule that matches wins; anything else is not offered in the game.
export const KIND_RULES = [
  ['립', 'lip', () => true],
  ['선케어', 'sun', () => true],
  ['크림·로션', 'cream', () => true],
  ['헤어·바디', 'hair', word(/\b(hair|shampoo|conditioner|scalp)\b/)],
  ['베이스메이크업', 'powder', name => word(/\b(powder|pact|setting)\b/)(name) && !word(/\b(highlight\w*|contour\w*|blush\w*|cheek)\b/)(name)],
  ['베이스메이크업', 'base', word(/\b(cushion|foundation|bb|cc|concealer|primer|base)\b/)]
];
// Tools and accessories share keywords with products (a cushion puff, a hair tie) but are not something to apply.
const notAProduct = word(/\b(puff|puffs|tie|ties|brush|brushes|sponge|sponges|pin|pins|clip|clips|comb|towel|cap|mirror|pouch|case|band|scrunchie|roller|dryer|iron|wash|set)\b/);
export function gameKind(row) {
  if (notAProduct(row.name)) return null;
  return KIND_RULES.find(([category, , test]) => category === row.category && test(row.name))?.[1] ?? null;
}

// Retailer tags such as "[Deal]" or "[STYLEVANA Exclusive]" lead some names; a base name that is only the brand or one
// short word ("Oil", "RIAH") says nothing, so the full feed name is used instead.
const untagged = text => String(text ?? '').replace(/^(\s*\[+[^\]]*\]+)+\s*/, '').trim();
export function displayName(row) {
  const base = untagged(row.base_name);
  const telling = base.includes(' ') || base.length >= 8;
  return telling && base.toLowerCase() !== String(row.brand).toLowerCase() ? base : untagged(row.name) || row.name;
}

export function buildFullCatalog(rows, knownSkus = new Set(), brandInfo = () => ({origin: 'KR'})) {
  const families = new Map();
  for (const row of rows) {
    const kind = row.availability === 'in_stock' && gameKind(row);
    if (!kind || !row.image_url || !row.url || brandInfo(row.brand).origin !== 'KR') continue;
    const key = row.family_key || row.brand + '|' + row.name;
    if (!families.has(key)) families.set(key, {kind, rows: []});
    families.get(key).rows.push(row);
  }
  const out = [];
  for (const {kind, rows: family} of families.values()) {
    if (family.some(r => knownSkus.has(r.sku))) continue;
    family.sort((a, b) => Number(a.sku) - Number(b.sku));
    const first = family[0], shaded = family.some(r => r.option_label);
    const options = family.map(r => ({id: r.sku, label: r.option_label || r.size_label || '기본 구성', image: r.image_url}));
    out.push({id: first.sku, brand: first.brand, ...(first.brand_ko ? {brandKo: first.brand_ko} : {}), name: displayName(first), image: first.image_url, url: first.url,
      category: kind, optionKind: shaded ? 'shade' : 'size', position: 999, options});
  }
  return out.sort((a, b) => a.category.localeCompare(b.category) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
}

async function fetchRows(fetchImpl = fetch) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({select: FIELDS, active: 'eq.true', market: 'eq.US', category: 'in.(립,선케어,크림·로션,헤어·바디,베이스메이크업)', order: 'sku', limit: '1000', offset: String(offset)});
    const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/catalog_items?${params}`, {headers: {apikey: KEY}});
    if (!res.ok) throw Error(`catalog_items ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('../web/beauty-play/', import.meta.url);
  const read = async name => JSON.parse(await readFile(new URL(name, dir), 'utf8'));
  const core = [...(await read('product-data.json')).products, ...await read('scenario-products.json')];
  const known = new Set(core.flatMap(p => [p.id, ...(p.options || []).map(o => o.id)]));
  const brands = JSON.parse(await readFile(new URL('../data/brands.json', import.meta.url), 'utf8'));
  const products = buildFullCatalog(await fetchRows(), known, makeBrandInfo(brands));
  await writeFile(new URL('catalog-full.json', dir), JSON.stringify(products) + '\n');
  const counts = {};
  for (const p of products) counts[p.category] = (counts[p.category] || 0) + 1;
  console.log(products.length, 'products', counts);
}
