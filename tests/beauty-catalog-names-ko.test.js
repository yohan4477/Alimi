import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL('../web/beauty-play/' + name, import.meta.url), 'utf8'));

// The game catalog comes from a US retailer in English. Korean screens look names up here,
// so a catalog refresh must also refresh catalog-names-ko.json.
test('every game catalog product has a Korean name for Korean screens', () => {
 const names = read('catalog-names-ko.json'), ko = read('translations.json').ko;
 const missing = read('catalog-full.json').map(p => p.name).filter(name => !names[name] && !ko[name]);
 assert.deepEqual(missing, []);
 assert.ok(Object.values(names).every(v => /[가-힣]/.test(v)));
 assert.match(readFileSync(new URL('../web/beauty-play/page.tsx', import.meta.url), 'utf8'), /addTranslations\('ko',names\)/);
});
