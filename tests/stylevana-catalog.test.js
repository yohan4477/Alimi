import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchCatalog, buildCatalogItems} from '../scripts/stylevana-catalog.mjs';
import {registerOffer, upsertCatalog} from '../scripts/supabase-sink.mjs';

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
  const fetchImpl = async (u, init) => { calls.push([String(u), init]); return {ok: true, status: 200, text: async () => JSON.stringify([{id: calls.length === 1 ? 'p1' : 'o1'}])}; };
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

test('catalog layer keeps distinct deal SKUs sharing an EAN and rejects invalid rows', () => {
  const items = buildCatalogItems([
    row(),
    row({merchant_product_id: '77777', product_name: '[DEAL]Romand - The Juicy Lasting Tint - 3.5g - 07 Cherry Bomb'}),
    row({merchant_product_id: '77778', ean: '9990001', product_name: '[Deal] Romand - Only Deal Item'}),
    row({merchant_product_id: '77779', currency: 'KRW'}),
    row({merchant_product_id: '77780', search_price: '0'}),
    row({merchant_product_id: '77781', merchant_deep_link: 'https://evil.example/x'}),
    row({merchant_product_id: '77782', ean: '', merchant_image_url: 'http://insecure.example/x.png'})
  ], catalog, at);
  assert.deepEqual(items.map(i => i.sku), ['66606', '77777', '77778', '77782']);
  assert.equal(items[0].name, 'The Juicy Lasting Tint - 3.5g - 07 Cherry Bomb');
  assert.equal(items[1].name, '[Deal] The Juicy Lasting Tint - 3.5g - 07 Cherry Bomb');
  assert.equal(items[2].name, '[Deal] Only Deal Item');
  assert.deepEqual({p: items[0].price_minor, d: items[0].delivery_minor, s: items[0].availability, u: items[0].url, seen: items[0].seen_at},
    {p: 1350, d: 399, s: 'in_stock', u: 'https://www.stylevana.com/en_US/romand-the-juicy-lasting-tint-3-5g.html', seen: at});
  assert.equal(items[3].ean, null);
  assert.equal(items[3].image_url, null);
});

test('catalog includes foreign brands and retailer bundles while retaining one row per SKU', () => {
  const rows = [row(), row({merchant_product_id: '2', brand_name: 'Shiseido'}),
    row({merchant_product_id: '3', brand_name: 'Stylevana', product_name: 'Stylevana - Skincare Set'}), row()];
  const info = name => ({origin: name === 'Romand' ? 'KR' : name === 'Stylevana' ? null : 'other', brandKo: null});
  assert.deepEqual(buildCatalogItems(rows, catalog, at, info).map(i => i.sku), ['66606', '2', '3']);
});

test('missing brand metadata preserves the SKU and full product name', () => {
  const [item] = buildCatalogItems([row({brand_name: ''})], catalog, at);
  assert.equal(item.sku, '66606');
  assert.equal(item.brand, '');
  assert.equal(item.name, row().product_name);
});

test('upsertCatalog batches rows then deactivates items missing from this feed', async () => {
  const calls = [];
  const fetchImpl = async (u, init) => { calls.push([String(u), init]); return {ok: true, status: 201, text: async () => ''}; };
  const items = Array.from({length: 1201}, (_, i) => ({retailer: 'Stylevana US', market: 'US', sku: String(i)}));
  assert.deepEqual(await upsertCatalog(items, at, {url: 'https://demo.supabase.co', key: 'k', fetchImpl}), {skipped: false, upserted: 1201});
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.slice(0, 3).map(c => JSON.parse(c[1].body).length), [500, 500, 201]);
  assert.match(calls[3][0], /seen_at=lt\.2026-10-18T03%3A00%3A00\.000Z/);
  assert.equal(calls[3][1].method, 'PATCH');
  await assert.rejects(upsertCatalog([], at, {url: 'https://demo.supabase.co', key: 'k', fetchImpl}), /Empty catalog/);
});
