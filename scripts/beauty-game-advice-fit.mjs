// Builds web/beauty-play/advice-fit.json: for advice options that share a product kind
// (e.g. Mona's three lip directions), the products whose names match that direction.
// The game shows these first so each direction leads to a visibly different list.
// Names are the only signal today (no texture data), so a product is placed in the first
// matching direction and never in two. Re-run after scripts/beauty-game-full-catalog.mjs.
// Usage: node scripts/beauty-game-advice-fit.mjs
import {readFileSync, writeFileSync} from 'node:fs';

const web = new URL('../web/beauty-play/', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('catalog-full.json', web), 'utf8'));
const LIMIT = 12;

// [character, advice, category, pattern]; within a character, earlier rules claim a product first.
const RULES = [
 ['mona', 'moist', 'lip', /gloss|glaze|\boil\b|jelly|dew|water|juicy|glow|plump|shine/i],
 ['mona', 'point', 'lip', /velvet|matte|\bmat\b|powder lipstick|lasting|fixing|\bstay\b|lipstick/i],
 ['mona', 'soft', 'lip', /balm|sheer|nude|mlbb|blur|mousse|soft|bare|tint/i],
 ['venus', 'hair', 'hair', /spray|wax|fixer|styling|stick|\bgel\b|pomade|curl|volum|dry shampoo|powder/i],
 ['venus', 'light', 'hair', /\boil\b|essence|mist|serum|perfume|parfum|ampoule|leave/i],
 ['ophelia', 'simple', 'cream', /all[- ]?in[- ]?one|multi|\bcream\b/i],
 ['ophelia', 'care', 'cream', /toner|essence|serum|ampoule|lotion|emulsion|moistur|hydrat/i],
];
// Never lead with these: they suit a routine or another product kind, not the moment in the story.
const SKIP = /scrub|mask|shampoo|conditioner|vinegar|cleans|remover|pencil|liner|\beye\b|cushion|foundation/i;

// No popularity data yet, so spread the picks: one product per brand per round, one per product line.
function spread(products) {
 const byBrand = new Map(), lines = new Set();
 for (const p of products) {
  const line = (p.brand + ' ' + p.name.split(/\s+/).slice(0, 3).join(' ')).toLowerCase();
  if (lines.has(line)) continue;
  lines.add(line);
  if (!byBrand.has(p.brand)) byBrand.set(p.brand, []);
  byBrand.get(p.brand).push(p);
 }
 const out = [], queues = [...byBrand.values()];
 while (queues.some(q => q.length)) for (const q of queues) if (q.length) out.push(q.shift());
 return out;
}

const fit = {}, claimed = new Map();
for (const [character, advice, category, pattern] of RULES) {
 const taken = claimed.get(character) || new Set();
 // Every match is claimed, not just the shown twelve, so a later direction never shows it.
 const matched = catalog.filter(p => p.category === category && pattern.test(p.name) && !SKIP.test(p.name) && !taken.has(p.id));
 matched.forEach(p => taken.add(p.id));
 const ids = spread(matched).slice(0, LIMIT).map(p => p.id);
 claimed.set(character, taken);
 (fit[character] ||= {})[advice] = ids;
}
writeFileSync(new URL('advice-fit.json', web), JSON.stringify(fit, null, 1) + '\n');
for (const [character, byAdvice] of Object.entries(fit))
 for (const [advice, ids] of Object.entries(byAdvice)) console.log(character, advice, ids.length);
