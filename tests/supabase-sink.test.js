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
