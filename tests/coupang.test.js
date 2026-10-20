import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {authorization, deeplink, searchPageUrl, DEEPLINK_PATH} from '../server/coupang.js';
import {createCoupangHandler} from '../api/coupang.js';
import {coupangUrl} from '../dist/live.js';

const env = {COUPANG_ACCESS_KEY: 'access', COUPANG_SECRET_KEY: 'secret'};
const ok = link => new Response(JSON.stringify({rCode: '0', data: [{shortenUrl: link}]}), {status: 200});
async function call(url, {fetchImpl, env: e = env, method = 'GET'} = {}) {
  const res = {headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end() { this.ended = true; }};
  await createCoupangHandler({env: e, fetchImpl})({method, url}, res);
  return res;
}

test('signs the Coupang CEA header over date, method, path and query', () => {
  const now = new Date('2026-10-20T03:04:05Z');
  const h = authorization({accessKey: 'access', secretKey: 'secret', method: 'POST', path: DEEPLINK_PATH, now});
  const sig = createHmac('sha256', 'secret').update('261020T030405Z' + 'POST' + DEEPLINK_PATH).digest('hex');
  assert.equal(h, `CEA algorithm=HmacSHA256, access-key=access, signed-date=261020T030405Z, signature=${sig}`);
});

test('deeplink posts the search URL with subId and only accepts link.coupang.com', async () => {
  let sent;
  const fetchImpl = async (url, init) => { sent = {url, init}; return ok('https://link.coupang.com/a/abc'); };
  const link = await deeplink(searchPageUrl('조선미녀 선크림'), {accessKey: 'a', secretKey: 's', subId: 'post12', fetchImpl});
  assert.equal(link, 'https://link.coupang.com/a/abc');
  assert.equal(sent.url, 'https://api-gateway.coupang.com' + DEEPLINK_PATH);
  assert.deepEqual(JSON.parse(sent.init.body), {coupangUrls: [searchPageUrl('조선미녀 선크림')], subId: 'post12'});
  assert.match(sent.init.headers.Authorization, /^CEA algorithm=HmacSHA256, access-key=a, /);
  assert.equal(await deeplink('x', {accessKey: 'a', secretKey: 's', fetchImpl: async () => ok('https://evil.example/x')}), null);
  assert.equal(await deeplink('x', {accessKey: 'a', secretKey: 's', fetchImpl: async () => new Response('{"rCode":"400"}')}), null);
});

test('handler redirects to the affiliate link and caches it at the CDN', async () => {
  const r = await call('/api/coupang?q=COSRX%20snail&ref=post-12', {fetchImpl: async () => ok('https://link.coupang.com/a/x')});
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, 'https://link.coupang.com/a/x');
  assert.match(r.headers['cache-control'], /s-maxage=86400/);
});

test('rejected subId retries without it; no keys or API failure falls back to plain search, uncached', async () => {
  const bodies = [];
  const retry = await call('/api/coupang?q=a&ref=post-1', {fetchImpl: async (u, init) => { bodies.push(JSON.parse(init.body)); return bodies.length === 1 ? new Response('{"rCode":"400"}') : ok('https://link.coupang.com/a/y'); }});
  assert.equal(retry.headers.location, 'https://link.coupang.com/a/y');
  assert.equal(bodies[0].subId, 'post-1'); assert.equal(bodies[1].subId, undefined);
  for (const opts of [{env: {}, fetchImpl: () => assert.fail('no call without keys')}, {fetchImpl: async () => { throw new Error('down'); }}]) {
    const r = await call('/api/coupang?q=COSRX', opts);
    assert.equal(r.headers.location, searchPageUrl('COSRX'));
    assert.equal(r.headers['cache-control'], 'no-store');
  }
});

test('empty query or non-GET is rejected', async () => {
  assert.equal((await call('/api/coupang?q=%20%20')).statusCode, 400);
  assert.equal((await call('/api/coupang?q=a', {method: 'POST'})).statusCode, 400);
});

test('client link prefers the Korean brand name and sanitises ref', () => {
  assert.equal(coupangUrl({brand: 'COSRX', brandKo: '코스알엑스', name: 'Snail 96 Mucin'}, 'post-12<x>'), '/api/coupang?q=%EC%BD%94%EC%8A%A4%EC%95%8C%EC%97%91%EC%8A%A4+Snail+96+Mucin&ref=post-12x');
  assert.equal(coupangUrl({}), null);
});
