import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {categoryOf, makeBrandInfo, CATEGORIES} from '../scripts/catalog-taxonomy.mjs';

// Golden set: real names from the 2026-10-18 Stylevana feed with the category a shopper would expect.
// Add a row here whenever a product shows up under the wrong tab, before changing the rules.
const GOLDEN = [
  ['Mask Fit Red Cushion - 18g - 21C Cool Ivory', '베이스메이크업'],
  ['Lip Sleeping Mask EX - 20g - Berry', '립'],
  ['The Juicy Lasting Tint - 3.5g - 07 Cherry Bomb', '립'],
  ['Lip & Cheek Blurry Pudding Pot - 5g - PK01 Baby', '립'],
  ['Heartleaf Pore Control Cleansing Oil - 200ml', '클렌징'],
  ['Radiance Cleansing Balm - 100ml', '클렌징'],
  ['Zero Pore Pad 2.0 - 70pcs', '토너·패드'],
  ['PDRN Pink Peptide Serum - 30ml', '에센스·세럼'],
  ['Advanced Snail 96 Mucin Power Essence - 100ml', '에센스·세럼'],
  ['Relief Sun : Rice + Probiotics - 50ml', '선케어'],
  ['Aqua Sun X Magic Cushion Moist Up Medium Beige', '선케어'],
  ['Visible Difference Mask Sheet - Aloe - 1pc (10ea) Set', '마스크팩'],
  ['Advanced Snail 92 All In One Cream (3ea) Set', '크림·로션'],
  ['Greatly Refreshing Set', '세트'],
  ['Madagascar Centella Travel Kit 5items - 5items', '세트'],
  ['Exfoliating Scalp Scrub Peppermint - 200g', '헤어·바디'],
  ['Better Than Eyes - 6.5g - Dry Ragras', '아이메이크업'],
  ['Saemmul Artlook Eyebrow - 0.2g - 04 Black Gray', '아이메이크업'],
  ['Tone Pairing Cheek - 9.6g - 03 Violeta', '베이스메이크업'],
  ['Ink The Velvet - 4g - 030 Classic Nude', '립'],
  ['Revive Eye Serum : Ginseng + Retinal - 30ml', '에센스·세럼'],
  ['Green Plum Refreshing Cleanser - 100ml', '클렌징'],
  ['1025 Dokdo Toner - 200ml', '토너·패드']
];

test('golden category set', () => {
  const wrong = GOLDEN.filter(([n, c]) => categoryOf(n) !== c).map(([n, c]) => `${n}: expected ${c}, got ${categoryOf(n)}`);
  assert.deepEqual(wrong, []);
  for (const [, c] of GOLDEN) assert.ok(CATEGORIES.includes(c));
});

test('only Korean brands are listed; bundles and foreign brands are excluded', () => {
  const info = makeBrandInfo(JSON.parse(readFileSync(new URL('../data/brands.json', import.meta.url))));
  for (const b of ['COSRX', 'cosrx', 'BEAUTY OF JOSEON', 'Romand', 'TIRTIR', 'Fwee', 'medicube']) assert.equal(info(b).origin, 'KR', b);
  for (const b of ['Kao', 'Shiseido', 'Judydoll', 'CANMAKE', 'La Roche Posay', 'Charlotte Tilbury']) assert.equal(info(b).origin, 'other', b);
  for (const b of ['All-in-One Sets', 'Top Picks', 'Stylevana']) assert.equal(info(b).origin, null, b);
  assert.equal(info('BEAUTY OF JOSEON').brandKo, '조선미녀');
  assert.equal(info('Romand').brandKo, '롬앤');
});

test('every curated catalog product has a real category and Korean brand label', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url)));
  const info = makeBrandInfo(JSON.parse(readFileSync(new URL('../data/brands.json', import.meta.url))));
  for (const p of catalog.products) {
    assert.notEqual(categoryOf(p.name), '기타', p.slug);
    assert.equal(info(p.feedBrand).origin, 'KR', p.slug);
    assert.ok(info(p.feedBrand).brandKo, p.slug + ' needs a Korean brand label');
  }
});
