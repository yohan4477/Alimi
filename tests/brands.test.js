import test from 'node:test';
import assert from 'node:assert/strict';
import {brandInitials, brandColor, brandsUrl, familiesPageUrl, twoRowOrder} from '../dist/live.js';

test('brand badge: initials and a stable color until a logo is added', () => {
  assert.equal(brandInitials('COSRX'), 'CO');
  assert.equal(brandInitials('Beauty of Joseon'), 'BO');
  assert.equal(brandInitials("A'PIEU"), 'AP');
  assert.equal(brandColor('COSRX'), brandColor('COSRX'));
  assert.match(brandColor('VT'), /^#[0-9a-f]{6}$/);
});

test('brand strip ranks by product families; tapping a brand filters families', () => {
  const u = new URL(brandsUrl());
  assert.equal(u.pathname, '/rest/v1/catalog_brands');
  assert.equal(u.searchParams.get('order'), 'families.desc');
  assert.equal(new URL(familiesPageUrl('립', 0, 24, 'ROMAND')).searchParams.get('brand'), 'eq.ROMAND');
  assert.equal(new URL(familiesPageUrl('립', 0)).searchParams.has('brand'), false);
});

test('two-row brand strip keeps rank order on each row', () => {
  const order = twoRowOrder([...Array(15).keys()]);
  assert.deepEqual(order.filter((_, i) => i % 2 === 0), [0, 1, 2, 3, 4, 5, 6, 7], 'top row');
  assert.deepEqual(order.filter((_, i) => i % 2 === 1), [8, 9, 10, 11, 12, 13, 14], 'bottom row');
});
