import test from 'node:test';
import assert from 'node:assert/strict';
import {sinkObservation, toMinor} from '../scripts/supabase-sink.mjs';

const row = {retailer: 'Stylevana US', market: 'US', merchantProductId: '10759', observedAt: '2026-10-18T00:00:00.000Z',
  amount: 17.5, reportedDelivery: 3.99, availability: 'in_stock', fingerprint: 'abc', method: 'awin_feed'};
const opts = (handler) => ({url: 'https://demo.supabase.co', key: 'k', fetchImpl: async (u, init) => handler(String(u), init)});
const ok = body => ({ok: true, status: 200, text: async () => JSON.stringify(body)});

test('converts amounts to minor units without float drift', () => {
  assert.equal(toMinor(17.5), 1750);
  assert.equal(toMinor(3.99), 399);
  assert.equal(toMinor(0.29), 29);
});

test('skips silently when Supabase is not configured', async () => {
  assert.deepEqual(await sinkObservation(row, {url: '', key: ''}), {skipped: true});
});

test('looks up the offer and calls ingest_observation with minor units', async () => {
  const calls = [];
  const result = await sinkObservation(row, opts((u, init) => {
    calls.push([u, init]);
    return u.includes('/rpc/') ? ok(true) : ok([{id: 'offer-1'}]);
  }));
  assert.deepEqual(result, {skipped: false, changed: true});
  assert.match(calls[0][0], /offers\?select=id&retailer=eq\.Stylevana\+US&market=eq\.US&external_id=eq\.10759$/);
  assert.deepEqual(JSON.parse(calls[1][1].body), {p_offer_id: 'offer-1', p_observed_at: row.observedAt, p_amount_minor: 1750,
    p_delivery_minor: 399, p_availability: 'in_stock', p_fingerprint: 'abc', p_source: 'awin_feed'});
});

test('rejects unregistered offers, HTTP errors and foreign hosts', async () => {
  await assert.rejects(sinkObservation(row, opts(() => ok([]))), /Offer not registered/);
  await assert.rejects(sinkObservation(row, opts(() => ({ok: false, status: 401}))), /Supabase HTTP 401/);
  await assert.rejects(sinkObservation(row, {url: 'https://evil.example.com', key: 'k'}), /Unexpected Supabase URL/);
});

// All requests below are local mocks; no production import or retry is performed.
const catalogItems = Array.from({length: 1001}, (_, i) => ({retailer: 'Stylevana US', market: 'US', sku: String(i)}));
const watermark = '2020-01-01T00:00:00.000Z';

test('catalog transport failure identifies batch and acknowledged rows without retry or deactivation', async () => {
  const {upsertCatalog} = await import('../scripts/supabase-sink.mjs');
  const methods = [];
  await assert.rejects(upsertCatalog(catalogItems, watermark, opts((u, init) => {
    methods.push(init.method);
    if (methods.length === 2) throw Error('SECRET upstream URL and token');
    return ok(null);
  })), error => {
    assert.deepEqual(error.diagnostics, {stage: 'upsert', batchIndex: 2, totalBatches: 3,
      acknowledgedRows: 500, failureKind: 'transport', failedRequestOutcome: 'unknown'});
    assert.doesNotMatch(error.message, /SECRET|token/);
    return true;
  });
  assert.deepEqual(methods, ['POST', 'POST']);
});

test('catalog timeout at deactivation reports all acknowledged upserts, not deactivation success', async () => {
  const {upsertCatalog} = await import('../scripts/supabase-sink.mjs');
  const methods = [];
  await assert.rejects(upsertCatalog(catalogItems, watermark, opts((u, init) => {
    methods.push(init.method);
    if (init.method === 'PATCH') throw Object.assign(Error('PRIVATE'), {name: 'TimeoutError'});
    return ok(null);
  })), error => {
    assert.deepEqual(error.diagnostics, {stage: 'deactivate', batchIndex: null, totalBatches: 3,
      acknowledgedRows: 1001, failureKind: 'timeout', failedRequestOutcome: 'unknown'});
    assert.doesNotMatch(error.message, /PRIVATE/);
    return true;
  });
  assert.deepEqual(methods, ['POST', 'POST', 'POST', 'PATCH']);
});

test('catalog HTTP failure reports status but never reads response body', async () => {
  const {upsertCatalog} = await import('../scripts/supabase-sink.mjs');
  await assert.rejects(upsertCatalog(catalogItems, watermark, opts(() => ({ok: false, status: 503,
    text: () => { throw Error('must not read error body'); }}))), error => {
    assert.equal(error.diagnostics.failureKind, 'http');
    assert.equal(error.diagnostics.httpStatus, 503);
    assert.equal(error.diagnostics.acknowledgedRows, 0);
    return true;
  });
});

test('catalog success preserves default batch size and one final deactivation', async () => {
  const {upsertCatalog} = await import('../scripts/supabase-sink.mjs');
  const sizes = [];
  assert.deepEqual(await upsertCatalog(catalogItems, watermark, opts((u, init) => {
    sizes.push(init.method === 'POST' ? JSON.parse(init.body).length : 'PATCH');
    return ok(null);
  })), {skipped: false, upserted: 1001});
  assert.deepEqual(sizes, [500, 500, 1, 'PATCH']);
});

test('response read failures and malformed bodies stay sanitized', async () => {
  const {upsertCatalog} = await import('../scripts/supabase-sink.mjs');
  for (const [text, expected] of [
    [async () => { throw Error('SECRET body read'); }, 'transport'],
    [async () => 'SECRET malformed JSON', 'response']
  ]) {
    await assert.rejects(upsertCatalog(catalogItems, watermark, opts(() => ({ok: true, status: 200, text}))), error => {
      assert.equal(error.diagnostics.failureKind, expected);
      assert.equal(error.diagnostics.acknowledgedRows, 0);
      assert.equal(error.diagnostics.failedRequestOutcome, 'unknown');
      assert.doesNotMatch(error.message, /SECRET|malformed JSON|body read/);
      return true;
    });
  }
});
