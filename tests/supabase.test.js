import test from 'node:test';
import assert from 'node:assert/strict';
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, restGet, rpc} from '../dist/supabase.js';
import * as live from '../dist/live.js';

test('shared Supabase helpers keep the key, timeout and error contract', async () => {
  let call;
  const ok = async (url, o) => { call = {url, o}; return {ok: true, status: 200, json: async () => [1]}; };
  assert.deepEqual(await restGet(SUPABASE_URL + '/rest/v1/x', ok), [1]);
  assert.equal(call.o.headers.apikey, SUPABASE_PUBLISHABLE_KEY);
  assert.ok(call.o.signal, 'request has a timeout signal');
  await assert.rejects(restGet('u', async () => ({ok: false, status: 503})), /HTTP 503/);
  await rpc('like_chat', {p_id: 1}, ok);
  assert.equal(call.url, SUPABASE_URL + '/rest/v1/rpc/like_chat');
  assert.equal(call.o.method, 'POST');
  assert.equal(call.o.headers['Content-Type'], 'application/json');
  await assert.rejects(rpc('x', {}, async () => ({ok: false, status: 400, json: async () => ({message: 'chat:slow'})})), /chat:slow/);
  assert.equal(await rpc('x', {}, async () => ({ok: true, status: 204})), null);
  assert.equal(live.SUPABASE_URL, SUPABASE_URL, 'live.js re-exports the same connection');
});

test('fetchFamily returns collapsed variants through the shared GET helper', async () => {
  const rows = [{sku: 'a', size_label: '50ml', option_label: null, price_minor: 1000, unit_price_minor: 200}, {sku: 'b', size_label: '50ml', option_label: null, price_minor: 900, unit_price_minor: 180}];
  const list = await live.fetchFamily('x|y', async () => ({ok: true, status: 200, json: async () => rows}));
  assert.deepEqual(list.map(v => v.sku), ['b']);
});
