import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVariant, familyKey, unitPriceMinor, unitLabel} from '../scripts/catalog-variants.mjs';

// Golden set from real 2026-10-18 feed names. Add a row before changing the rules.
const GOLDEN = [
  ['Heartleaf Pore Control Cleansing Oil - 200ml', 'Heartleaf Pore Control Cleansing Oil', '200ml', null, 200, 'ml'],
  ['Heartleaf Pore Control Cleansing Oil - 20ml', 'Heartleaf Pore Control Cleansing Oil', '20ml', null, 20, 'ml'],
  ['Mask Fit Red Cushion - 18g - 21C Cool Ivory', 'Mask Fit Red Cushion', '18g', '21C Cool Ivory', 18, 'g'],
  ['The Juicy Lasting Tint - #22 Pomelo Skin - 5.5g', 'The Juicy Lasting Tint', '5.5g', '#22 Pomelo Skin', 5.5, 'g'],
  ['PDRN Pink One Day Serum - 1.5ml*10pcs', 'PDRN Pink One Day Serum', '1.5ml*10pcs', null, 15, 'ml'],
  ['Zero Pore Pad 2.0 - 70pcs', 'Zero Pore Pad 2.0', '70pcs', null, 70, 'pcs'],
  ['Visible Difference Mask Sheet - Aloe - 1pc (10ea) Set', 'Visible Difference Mask Sheet', '1pc ×10', 'Aloe', 10, 'pcs'],
  ['Airy Fit Sheet Mask - Aloe - 20ea*19g', 'Airy Fit Sheet Mask', '20ea*19g', 'Aloe', 380, 'g'],
  ['Advanced Snail 92 All In One Cream (3ea) Set', 'Advanced Snail 92 All In One Cream', '×3', null, null, null],
  ['Mask Proof Fixing Tint - 4g - 01 Analog Rose (1ea) + 04 Ginger Milktea (1ea) Set', 'Mask Proof Fixing Tint', '4g', '01 Analog Rose (1ea) + 04 Ginger Milktea (1ea) Set', null, 'g'],
  ['Greatly Refreshing Set', 'Greatly Refreshing Set', null, null, null, null]
];

test('golden variant parsing', () => {
  const wrong = [];
  for (const [name, base, sizeLabel, option, quantity, unit] of GOLDEN) {
    const v = parseVariant(name);
    const got = [v.base, v.sizeLabel, v.option, v.quantity, v.unit];
    const want = [base, sizeLabel, option, quantity, unit];
    if (JSON.stringify(got) !== JSON.stringify(want)) wrong.push(`${name}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`);
  }
  assert.deepEqual(wrong, []);
});

test('sizes and shades of one product share a family; different products do not', () => {
  assert.equal(familyKey('ANUA', 'Heartleaf Pore Control Cleansing Oil - 200ml'), familyKey('ANUA', 'Heartleaf Pore Control Cleansing Oil - 20ml'));
  assert.equal(familyKey('Romand', 'The Juicy Lasting Tint - 3.5g - 07 Cherry Bomb'), familyKey('Romand', 'The Juicy Lasting Tint - 3.5g - 21 Grape Bomb'));
  assert.notEqual(familyKey('ANUA', 'Heartleaf Pore Control Cleansing Oil - 200ml'), familyKey('ANUA', 'Heartleaf Pore Control Cleansing Oil Mild - 200ml'));
  assert.notEqual(familyKey('ANUA', 'Heartleaf 77 Toner - 250ml'), familyKey('COSRX', 'Heartleaf 77 Toner - 250ml'));
});

test('unit price compares sizes fairly and is absent when unknown', () => {
  const big = unitPriceMinor(1700, parseVariant('Oil - 200ml'));
  const small = unitPriceMinor(424, parseVariant('Oil - 20ml'));
  assert.equal(big, 85);   // $0.85 per 10ml
  assert.equal(small, 212); // $2.12 per 10ml
  assert.equal(unitPriceMinor(1000, parseVariant('Some Set')), null);
  assert.equal(unitLabel('ml'), '10ml'); assert.equal(unitLabel('pcs'), 'pc');
});
