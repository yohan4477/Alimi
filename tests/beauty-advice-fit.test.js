import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const fit = JSON.parse(readFileSync(new URL('../web/beauty-play/advice-fit.json', import.meta.url), 'utf8'));
const catalog = new Map(JSON.parse(readFileSync(new URL('../web/beauty-play/catalog-full.json', import.meta.url), 'utf8')).map(p => [p.id, p]));
const advice = JSON.parse(readFileSync(new URL('../web/beauty-play/advice-data.json', import.meta.url), 'utf8'));

test('directions sharing a product kind lead with different products', () => {
 for (const [character, byAdvice] of Object.entries(fit)) {
  const seen = new Set();
  for (const [id, ids] of Object.entries(byAdvice)) {
   assert.ok(advice[character].some(a => a.id === id), character + '/' + id + ' is a real advice option');
   assert.ok(ids.length >= 6, character + '/' + id + ' has enough picks');
   for (const pid of ids) {
    assert.ok(catalog.has(pid), pid + ' exists in the game catalog');
    assert.ok(!seen.has(pid), pid + ' is not shared between ' + character + "'s directions");
    seen.add(pid);
   }
   assert.equal(new Set(ids.map(pid => catalog.get(pid).category)).size, 1, character + '/' + id + ' stays in one product kind');
  }
 }
 assert.deepEqual(Object.keys(fit.mona).sort(), ['moist', 'point', 'soft']);
});

test('the game puts the direction picks first and marks them', () => {
 const page = readFileSync(new URL('../web/beauty-play/page.tsx', import.meta.url), 'utf8');
 assert.match(page, /const suggested=\[\.\.\.new Set\(\[\.\.\.fitIds,/);
 assert.match(page, /browseCatalog\(eligibleProducts,suggested,/);
 assert.match(page, /className="fit-badge"/);
});
