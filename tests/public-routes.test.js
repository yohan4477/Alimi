import test from 'node:test';
import assert from 'node:assert/strict';
import {compatibilityTarget, hasActualCompatibilityTarget, isSyntheticTarget, isSyntheticProductTarget, liveURL, sampleURL, staticEntryPath} from '../dist/public-routes.js';

const origin = 'https://seoulbeauty.me';
const draft = '24bd66b5-6365-48f7-a14f-98609579bea1';
const nonce = 'fixture_nonce_123456';

test('public root is sample and /live is actual; legacy markets dispatch through compatibility', () => {
  for (const path of ['/', '/kr', '/kr/', '/us', '/us/']) assert.equal(staticEntryPath(path), '/sample.html');
  for (const path of ['/live', '/live/']) assert.equal(staticEntryPath(path), '/index.html');
  for (const path of ['/sample-app.js', '/assets/logo.svg', '/beauty-play/']) assert.equal(staticEntryPath(path), path);
  for (const suffix of ['', '?lang=en', '?region=kr', '?demo=1', '?sampleTab=saved']) {
    assert.equal(compatibilityTarget(origin + '/' + suffix), null);
    assert.equal(hasActualCompatibilityTarget(origin + '/' + suffix), false);
  }
});

test('actual root room, product, draft and valid PKCE callbacks retain their same-origin context', () => {
  for (const params of [
    {room: 'real-room', lang: 'ko', region: 'us'},
    {product: 'brand|serum', sku: '123', lang: 'en'},
    {beautyDraft: draft},
    {productRooms: '1', lang: 'en'},
    {code: 'fixture-code', sb_login_state: nonce},
    {error: 'access_denied', sb_login_state: nonce},
  ]) {
    const source = new URL(origin + '/');
    source.search = new URLSearchParams({...params, demo: '1'}).toString();
    const target = compatibilityTarget(source.href);
    assert.equal(target.origin, source.origin);
    assert.equal(target.pathname, '/live');
    assert.equal(target.searchParams.has('demo'), false);
    for (const [key, value] of Object.entries(params)) assert.equal(target.searchParams.get(key), value);
  }
});

test('PKCE callback dispatch rejects token fragments, oversized errors and missing or malformed state', () => {
  for (const suffix of [
    '?code=fixture-code',
    '?code=fixture-code&state=' + nonce,
    '?code=fixture-code&sb_login_state=short',
    '?code=bad%20code&sb_login_state=' + nonce,
    '?code=' + 'x'.repeat(4097) + '&sb_login_state=' + nonce,
    '?error=' + 'x'.repeat(101) + '&sb_login_state=' + nonce,
    '?error=access_denied',
    '?beautyDraft=not-a-draft',
    '?room=x',
    '?room=%3Cscript%3E',
    '#access_token=fixture_fragment_not_a_real_token&token_type=bearer',
    '#code=fixture-code&sb_login_state=' + nonce,
  ]) {
    assert.equal(hasActualCompatibilityTarget(origin + '/' + suffix), false, suffix.slice(0, 100));
    assert.equal(compatibilityTarget(origin + '/' + suffix), null, suffix.slice(0, 100));
  }
});

test('synthetic targets never upgrade a sample URL into actual service reads', () => {
  for (const id of ['demo-cx-t01', 'sample-room', 'synthetic_room', 'DEMO:room', 'demo']) {
    assert.equal(isSyntheticTarget(id), true);
    for (const key of ['room', 'product', 'post', 'productRooms']) {
      const source = new URL(origin + '/');
      source.search = new URLSearchParams({[key]: id, beautyDraft: draft}).toString();
      assert.equal(compatibilityTarget(source.href), null, `${key}=${id}`);
    }
  }
  for (const product of ['torriden-serum', 'aestura-cream', 'roundlab-sun', 'anua-toner', 'cosrx-essence', 'romand-tint', 'clio-cushion', 'laneige-lip', 'medicube-pad', 'drg-cream', 'goodal-serum', 'peripera-tint']) {
    assert.equal(isSyntheticProductTarget(product), true);
    assert.equal(compatibilityTarget(`${origin}/?product=${product}&room=actual-room`), null);
  }
  for (const id of ['real-room', 'demographic', 'sampling']) assert.equal(isSyntheticTarget(id), false);
});

test('legacy KR/US URLs preserve real targets and language while explicitly choosing actual market', () => {
  for (const market of ['kr', 'us']) for (const slash of ['', '/']) {
    const source = new URL(`${origin}/${market}${slash}?region=${market === 'kr' ? 'us' : 'kr'}&room=real-room&lang=en&code=fixture-code&sb_login_state=${nonce}&beautyDraft=${draft}&demo=1#context`);
    const target = compatibilityTarget(source.href);
    assert.equal(target.pathname, '/live');
    assert.equal(target.origin, origin);
    assert.equal(target.searchParams.get('region'), market);
    assert.equal(target.searchParams.has('demo'), false);
    assert.equal(target.hash, '#context');
    for (const key of ['room', 'lang', 'code', 'sb_login_state', 'beautyDraft']) assert.equal(target.searchParams.get(key), source.searchParams.get(key));
  }
});

test('legacy synthetic room/product links stay sample rather than reaching /live', () => {
  for (const market of ['kr', 'us']) for (const key of ['room', 'product', 'post', 'productRooms']) {
    const target = compatibilityTarget(`${origin}/${market}?${key}=demo-cx-t01&lang=en`);
    assert.equal(target.pathname, '/');
    assert.equal(target.searchParams.get('region'), market);
    assert.equal(target.searchParams.get(key), 'demo-cx-t01');
    assert.equal(hasActualCompatibilityTarget(target.href), false);
  }
});

test('sample navigation stays root and live navigation stays actual without demo opt-in', () => {
  const source = `${origin}/?lang=ko&region=kr&room=demo-cx-t01`;
  const saved = sampleURL({href: source, market: 'us', language: 'en', tab: 'saved'});
  assert.equal(saved.pathname, '/');
  assert.equal(saved.searchParams.get('region'), 'us');
  assert.equal(saved.searchParams.get('lang'), 'en');
  assert.equal(saved.searchParams.get('sampleTab'), 'saved');
  assert.equal(saved.searchParams.has('room'), false);
  const room = sampleURL({href: saved.href, room: 'demo-cx-t03', tab: 'chat'});
  assert.equal(room.pathname, '/');
  assert.equal(room.searchParams.get('room'), 'demo-cx-t03');
  assert.equal(room.searchParams.has('sampleTab'), false);
  const live = liveURL({href: origin + '/?lang=en&demo=1', market: 'kr'});
  assert.equal(live.pathname, '/live');
  assert.equal(live.searchParams.get('region'), 'kr');
  assert.equal(live.searchParams.get('lang'), 'en');
  assert.equal(live.searchParams.has('demo'), false);
});


test('pending legacy PKCE callbacks strip synthetic targets before actual authentication cleanup',()=>{
 for(const path of ['/', '/kr', '/us/'])for(const callback of [{code:'fixture-code'},{error:'unexpected_provider_error'}]){
  const url=new URL(origin+path);url.search=new URLSearchParams({...callback,sb_login_state:nonce,room:'demo-cx-t01',product:'torriden-serum',post:'sample-post',productRooms:'demo-product',lang:'en',beautyDraft:draft}).toString();url.hash='context';
  const target=compatibilityTarget(url.href);assert.equal(target.pathname,'/live');assert.equal(target.origin,origin);assert.equal(target.hash,'#context');
  for(const key of ['room','product','post','productRooms'])assert.equal(target.searchParams.has(key),false);
  assert.equal(target.searchParams.get('sb_login_state'),nonce);assert.equal(target.searchParams.get('beautyDraft'),draft);assert.equal(target.searchParams.get('lang'),'en');
  for(const [key,value]of Object.entries(callback))assert.equal(target.searchParams.get(key),value);
 }
});

test('callback sanitization removes whole ambiguous target keys, not only their first value',()=>{
 for(const path of ['/', '/kr']){
  const target=compatibilityTarget(origin+path+'?code=fixture-code&sb_login_state='+nonce+'&room=real-room&room=demo-cx-t01&product=real-product&product=torriden-serum&lang=en&region=kr');
  assert.equal(target.pathname,'/live');assert.equal(target.origin,origin);assert.equal(target.searchParams.has('room'),false);assert.equal(target.searchParams.has('product'),false);assert.equal(target.searchParams.get('lang'),'en');assert.equal(target.searchParams.get('region'),'kr');
 }
});
