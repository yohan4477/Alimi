import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchCatalog} from '../scripts/stylevana-catalog.mjs';
import {registerOffer} from '../scripts/supabase-sink.mjs';

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url)));
const item = catalog.products.find(p => p.sku === '66606');
const at = '2026-10-18T03:00:00.000Z';
const row = (over = {}) => ({
  merchant_product_id: '66606', data_feed_id: '111294', merchant_id: '90791', ean: '8800258080111', brand_name: 'Romand',
  currency: 'USD', search_price: '13.5', delivery_cost: '3.99', in_stock: '1', aw_product_id: '123',
  product_name: 'Romand - The Juicy Lasting Tint - 3.5g - 07 Cherry Bomb',
  merchant_deep_link: 'https://www.stylevana.com/en_US/romand-the-juicy-lasting-tint-3-5g.html?utm_source=awin&sonid=66606',
  aw_deep_link: 'https://www.awin1.com/pclick.php?p=123&a=3125007&m=90791',
  merchant_image_url: 'https://sv9-cdn.stylevana.com/media/x.png', ...over
});
const one = (rows) => matchCatalog(rows, {...catalog, products: [item]}, at)[0];

test('catalog has ten unique products and SKUs', () => {
  assert.equal(catalog.products.length, 10);
  assert.equal(new Set(catalog.products.map(p => p.slug)).size, 10);
  assert.equal(new Set(catalog.products.map(p => p.sku)).size, 10);
});

test('matches by SKU, strips tracking query from canonical URL, converts fields', () => {
  const r = one([row(), row({merchant_product_id: '66607', ean: 'x'})]);
  assert.equal(r.status, 'ok');
  assert.equal(r.offer.url, 'https://www.stylevana.com/en_US/romand-the-juicy-lasting-tint-3-5g.html');
  assert.deepEqual({a: r.observation.amount, d: r.observation.reportedDelivery, s: r.observation.availability, id: r.observation.merchantProductId},
    {a: 13.5, d: 3.99, s: 'in_stock', id: '66606'});
});

test('fingerprint ignores collection time but tracks price and stock', () => {
  const a = one([row()]).observation.fingerprint;
  assert.equal(matchCatalog([row()], {...catalog, products: [item]}, '2026-10-19T00:00:00Z')[0].observation.fingerprint, a);
  assert.notEqual(one([row({search_price: '12'})]).observation.fingerprint, a);
  assert.notEqual(one([row({in_stock: '0'})]).observation.fingerprint, a);
});

test('rejects missing, duplicate, wrong identity, bad price and foreign links per item', () => {
  assert.equal(one([]).status, 'missing');
  assert.equal(one([row(), row()]).status, 'ambiguous');
  assert.equal(one([row({ean: '0000'})]).status, 'identity_mismatch');
  assert.equal(one([row({brand_name: 'Other'})]).status, 'identity_mismatch');
  assert.equal(one([row({currency: 'KRW'})]).status, 'identity_mismatch');
  assert.equal(one([row({data_feed_id: '104951'})]).status, 'missing');
  assert.equal(one([row({search_price: '0'})]).status, 'invalid_price');
  assert.equal(one([row({search_price: 'abc'})]).status, 'invalid_price');
  assert.equal(one([row({aw_deep_link: 'https://evil.example/pclick.php?p=123&m=90791'})]).status, 'invalid_link');
  assert.equal(one([row({merchant_image_url: 'http://sv9-cdn.stylevana.com/x.png'})]).status, 'invalid_link');
});

test('registerOffer upserts product then offer on their natural keys', async () => {
  const calls = [];
  const fetchImpl = async (u, init) => { calls.push([String(u), init]); return {ok: true, status: 200, json: async () => [{id: calls.length === 1 ? 'p1' : 'o1'}]}; };
  const r = await registerOffer(catalog, item, {url: 'https://www.stylevana.com/a.html', affiliateUrl: 'https://www.awin1.com/pclick.php', imageUrl: 'https://sv9-cdn.stylevana.com/x.png', ean: item.ean},
    {url: 'https://demo.supabase.co', key: 'k', fetchImpl});
  assert.deepEqual(r, {skipped: false, offerId: 'o1'});
  assert.match(calls[0][0], /products\?on_conflict=slug$/);
  assert.match(calls[1][0], /offers\?on_conflict=retailer%2Cmarket%2Cexternal_id$|offers\?on_conflict=retailer,market,external_id$/);
  assert.equal(calls[0][1].headers.Prefer, 'resolution=merge-duplicates,return=representation');
  assert.equal(JSON.parse(calls[0][1].body).name, 'The Juicy Lasting Tint 07 Cherry Bomb');
  assert.equal(JSON.parse(calls[1][1].body).product_id, 'p1');
  assert.deepEqual(await registerOffer(catalog, item, {}, {url: '', key: ''}), {skipped: true});
});
