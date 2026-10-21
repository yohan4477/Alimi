import test from 'node:test';
import assert from 'node:assert/strict';
import {deeplink, searchPageUrl} from '../server/oliveyoung.js';
import {createOliveYoungHandler} from '../api/oliveyoung.js';
import {oliveYoungUrl} from '../dist/live.js';

const env = {RAKUTEN_PUBLISHER_ID: 'AbC1*xYz/9', OLIVEYOUNG_US_MID: '12345'};
function call(url, {env: e = env, method = 'GET'} = {}) {
  const res = {headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end() { this.ended = true; }};
  createOliveYoungHandler({env: e})({method, url}, res);
  return res;
}

test('deeplink wraps the OLIVE YOUNG US search in a LinkShare click URL', () => {
  const link = new URL(deeplink(searchPageUrl('COSRX snail'), {publisherId: 'AbC1*xYz/9', mid: '12345', u1: 'post-12'}));
  assert.equal(link.origin + link.pathname, 'https://click.linksynergy.com/deeplink');
  assert.equal(link.searchParams.get('id'), 'AbC1*xYz/9');
  assert.equal(link.searchParams.get('mid'), '12345');
  assert.equal(link.searchParams.get('murl'), 'https://us.oliveyoung.com/search?q=COSRX+snail');
  assert.equal(link.searchParams.get('u1'), 'post-12');
  assert.equal(new URL(deeplink('https://us.oliveyoung.com/', {publisherId: 'a', mid: '1'})).searchParams.has('u1'), false);
});

test('handler redirects to the tracked link and caches it at the CDN', () => {
  const r = call('/api/oliveyoung?q=COSRX%20snail&ref=post-12<x>');
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, deeplink(searchPageUrl('COSRX snail'), {publisherId: env.RAKUTEN_PUBLISHER_ID, mid: '12345', u1: 'post-12x'}));
  assert.match(r.headers['cache-control'], /s-maxage=86400/);
});

test('missing or malformed IDs fall back to plain search, uncached', () => {
  for (const e of [{}, {RAKUTEN_PUBLISHER_ID: 'a'}, {...env, OLIVEYOUNG_US_MID: 'abc'}]) {
    const r = call('/api/oliveyoung?q=COSRX', {env: e});
    assert.equal(r.headers.location, searchPageUrl('COSRX'));
    assert.equal(r.headers['cache-control'], 'no-store');
  }
});

test('empty query or non-GET is rejected', () => {
  assert.equal(call('/api/oliveyoung?q=%20%20').statusCode, 400);
  assert.equal(call('/api/oliveyoung?q=a', {method: 'POST'}).statusCode, 400);
});

test('client link uses the English brand name and sanitises ref', () => {
  assert.equal(oliveYoungUrl({brand: 'COSRX', brandKo: '코스알엑스', name: 'Snail 96 Mucin'}, 'post-12<x>'), '/api/oliveyoung?q=COSRX+Snail+96+Mucin&ref=post-12x');
  assert.equal(oliveYoungUrl({}), null);
});
