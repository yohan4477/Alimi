import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEvent, deviceId, track} from '../dist/events.js';

const memStorage = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v))}; };

test('device id is a persisted random UUID; survives broken storage', () => {
  const s = memStorage();
  const a = deviceId(s);
  assert.match(a, /^[0-9a-f-]{36}$/);
  assert.equal(deviceId(s), a);
  const broken = {getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }};
  assert.match(deviceId(broken), /^[0-9a-f-]{36}$/);
});

test('only whitelisted events are built', () => {
  assert.deepEqual(buildEvent('product_view', 'cosrx', undefined, 'id'),
    {device_id: 'id', platform: 'web', app_version: 'web-1', name: 'product_view', product_id: 'cosrx', props: {}});
  assert.throws(() => buildEvent('hack', null, {}, 'id'), /Unknown event/);
});

test('track posts minimal anonymous payload and never throws', async () => {
  const calls = [];
  track('search', null, {length: 5, results: 2}, {storage: memStorage(), fetchImpl: async (u, init) => { calls.push([u, init]); return {ok: true}; }});
  assert.match(calls[0][0], /\/rest\/v1\/app_events$/);
  assert.equal(calls[0][1].keepalive, true);
  assert.equal(calls[0][1].headers.Prefer, 'return=minimal');
  const body = JSON.parse(calls[0][1].body);
  assert.deepEqual(Object.keys(body).sort(), ['app_version', 'device_id', 'name', 'platform', 'product_id', 'props']);
  assert.deepEqual(body.props, {length: 5, results: 2});
  assert.doesNotThrow(() => track('home_view', null, {}, {storage: memStorage(), fetchImpl: () => Promise.reject(Error('offline'))}));
  assert.doesNotThrow(() => track('bogus', null, {}, {storage: memStorage(), fetchImpl: async () => ({})}));
});
