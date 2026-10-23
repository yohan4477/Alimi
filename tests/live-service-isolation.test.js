import './fixtures/us-market.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {regionURL, languageURL} from '../dist/region.js';
import {shareUrl, sharedTarget} from '../dist/share.js';
import {track} from '../dist/events.js';
import {isSyntheticTarget,isSyntheticProductTarget} from '../dist/public-routes.js';
import {startVisitorEntry} from '../dist/visitor-entry.js';
import {currentMarket, MANUAL_MARKET_KEY} from '../dist/market-preference.js';

const source = readFileSync(new URL('../dist/chat.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
const memory = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value))};
};
function documentFixture() {
  const element = () => ({children: [], dataset: {}, listeners: {}, append(child) { this.children.push(child); }, setAttribute() {}, addEventListener(name, callback) { this.listeners[name] = callback; }});
  const body = element();
  body.prepend = child => body.children.unshift(child);
  return {cookie: '', body, createElement: element, documentElement: {lang: '', attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; }}};
}
const countryResponse = country => async () => ({ok: true, json: async () => ({language: country === 'KR' ? 'ko' : 'en', suggestedRegion: country === 'KR' ? 'kr' : null})});

test('actual community source cannot import fixtures or restore the former offline mode', () => {
  assert.doesNotMatch(source, /from ['"]\.\/(?:demo-fixtures|demo-chat-store|cx-demo-fixtures)/);
  assert.doesNotMatch(source, /\b(?:demoRooms|demoMessages|demoEntries|demoActive|syntheticRooms|createDemoProductRoom)\b/);
  assert.doesNotMatch(source, /seoulbeauty-community-mode|toggle-demo|data-demo-product/);
  assert.match(source, /export const isDemo = \(\) => false/);
  assert.match(source, /fetchLiveRooms = async \(\) => \(await fetchRooms\(\)\)\.filter\(isLiveRoom\)/);
  assert.equal((source.match(/fetchRooms\(/g) ?? []).length, 1, 'every room ingress uses the live-only filter');
  assert.match(source, /function openTopic\(room, mode = 'live'\) \{\s*if \(!isLiveRoom\(room\)\) return/);
  assert.match(source, /if\(!box\|\|!isLiveRoom\(chat.room\)\)return/);
  assert.match(source, /mountGameEntranceCarousel\(entrance/);
});

test('synthetic room targets are discarded before pending-room lookup', () => {
  const guard = source.match(/const isLiveRoom = ([^;]+);/)[1];
  const setter = source.match(/export const openRoomNext = ([^\n]+);/)[1];
  const {set, pending} = new Function(`const isLiveRoom = ${guard}; let pendingRoom = null; const set = ${setter}; return {set, pending: () => pendingRoom};`)();
  for (const id of ['demo-cx-t01', 'demo-user-room', '', null, undefined]) {
    set(id);
    assert.equal(pending(), null);
  }
  set('real-room');
  assert.equal(pending(), 'real-room');
  assert.match(source, /export const openRoomById = openRoomNext/);
});

test('actual explore and onboarding load real rooms despite stale offline storage and demo query', async () => {
  const saved = Object.fromEntries(['document', 'location', 'localStorage', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = memory({'seoulbeauty-community-mode': 'offline'});
  const requests = [];
  const real = {id: 'real-room', service_region: 'us', kind: 'topic', title_en: 'Real discussion', tags: []};
  try {
    globalThis.document = {addEventListener() {}, dispatchEvent() {}};
    globalThis.location = new URL('https://seoulbeauty.me/live?region=us&demo=1');
    globalThis.localStorage = storage;
    globalThis.fetch = async (url, options) => {
      requests.push({url: String(url), method: options?.method ?? 'GET'});
      return {ok: true, status: 200, json: async () => String(url).includes('/chat_room_list?') ? [
        real,
        {id: 'demo-cx-t01', service_region: 'us', kind: 'topic'},
        {id: 'flagged-sample', service_region: 'us', demo: true, kind: 'topic'},
        {id: 'other-market', service_region: 'kr', kind: 'topic'}
      ] : []};
    };
    const chat = await import('../dist/chat.js');
    assert.equal(chat.isDemo(), false);
    assert.deepEqual((await chat.exploreData()).rooms, [real]);
    assert.deepEqual((await chat.onboardingData()).rooms, [real]);
    assert.equal(storage.getItem('seoulbeauty-community-mode'), 'offline', 'legacy preference is ignored, not rewritten');
    assert.ok(requests.some(request => request.url.includes('/chat_room_list?')));
    assert.ok(requests.every(request => request.method === 'GET'));
    assert.ok(requests.every(request => !/demo-|cx-demo|demo-fixtures/.test(request.url)));
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test('real events survive old offline preference while synthetic events remain blocked', () => {
  const storage = memory({'seoulbeauty-community-mode': 'offline'}), calls = [];
  const options = {storage, fetchImpl: async (url, init) => calls.push({url, body: JSON.parse(init.body)})};
  track('chat_send', null, {room: 'demo-cx-t01'}, options);
  track('community_open', null, {demo: true}, options);
  assert.equal(calls.length, 0);
  track('chat_send', null, {room: 'real-room'}, options);
  track('search', null, {length: 4, results: 2}, options);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.props.room, 'real-room');
  assert.equal(calls[0].body.props.service_region, 'us');
});

test('market switches remain on /live and language changes preserve actual deep links', () => {
  const href = 'https://seoulbeauty.me/live?region=kr&lang=en&room=kr-room&product=serum&post=7&productRooms=sunscreen#old';
  const target = regionURL('us', href);
  assert.equal(target.pathname, '/live');
  assert.equal(target.searchParams.get('region'), 'us');
  assert.equal(target.searchParams.get('lang'), 'en');
  assert.equal(target.hash, '');
  for (const key of ['room', 'product', 'post', 'productRooms']) assert.equal(target.searchParams.has(key), false);
  const language = languageURL('ko', href);
  assert.equal(language.pathname, '/live');
  assert.equal(language.searchParams.get('region'), 'kr');
  assert.equal(language.searchParams.get('room'), 'kr-room');
  assert.equal(language.searchParams.get('lang'), 'ko');
  assert.throws(() => regionURL('jp', href), /Invalid service region/);
});

test('shares use /live with explicit market, selected language and only new deep-link context', () => {
  for (const [market, language, params] of [['kr', 'en', {room: 'kr-room'}], ['us', 'ko', {product: 'brand|serum'}]]) {
    const href = `https://seoulbeauty.me/live?region=${market}&lang=${language}&demo=1&code=old-code&beautyDraft=old-draft#old-token`;
    const target = new URL(shareUrl(params, href));
    assert.equal(target.pathname, '/live');
    assert.equal(target.searchParams.get('region'), market);
    assert.equal(target.searchParams.get('lang'), language);
    assert.equal(target.hash, '');
    for (const key of ['demo', 'code', 'beautyDraft']) assert.equal(target.searchParams.has(key), false);
    assert.deepEqual(sharedTarget(target.search), params);
  }
  assert.equal(new URL(shareUrl({room: 'kr-room'}, 'https://seoulbeauty.me/kr?region=us')).searchParams.get('region'), 'kr', 'legacy path retains original market');
});

test('visitor market choice enters /live without losing authentication, draft or shared context', async () => {
  const document = documentFixture(), storage = memory({});
  const href = 'https://seoulbeauty.me/live?room=real-room&code=fixture-code&beautyDraft=fixture-draft&lang=ko#fixture-auth';
  let assigned;
  await startVisitorEntry({document, storage, location: {...new URL(href), pathname: '/live', search: new URL(href).search, href, assign: value => { assigned = value; }}, fetchImpl: countryResponse('US'), loadApp: () => assert.fail('market unresolved')});
  const choice = document.body.children[0].children.find(child => child.dataset.marketChoice === 'us');
  choice.listeners.click();
  const target = new URL(assigned);
  assert.equal(target.pathname, '/live');
  assert.equal(target.searchParams.get('region'), 'us');
  for (const key of ['room', 'code', 'beautyDraft', 'lang']) assert.equal(target.searchParams.get(key), new URL(href).searchParams.get(key));
  assert.equal(target.hash, '#fixture-auth');
  assert.equal(storage.getItem(MANUAL_MARKET_KEY), 'us');
});

test('actual visitor entry preserves trusted KR suggestion and independent explicit language/market', async () => {
  for (const [search, country, expectedMarket, expectedLanguage] of [['', 'KR', 'kr', 'ko'], ['?region=us&lang=ko', 'KR', 'us', 'ko']]) {
    const document = documentFixture();
    let loaded = 0;
    await startVisitorEntry({document, storage: memory(), location: {pathname: '/live', search, href: 'https://seoulbeauty.me/live' + search}, fetchImpl: countryResponse(country), loadApp: async () => { loaded++; }});
    assert.equal(loaded, 1);
    assert.equal(currentMarket(), expectedMarket);
    assert.equal(document.documentElement.lang, expectedLanguage);
  }
});


test('actual application import graph excludes all sample fixture and storage modules', () => {
  const visited = new Set();
  function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    if (!/\.[cm]?js$/.test(url.pathname)) return;
    const content = readFileSync(url, 'utf8');
    for (const match of content.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]/g)) visit(new URL(match[1] ?? match[2], url));
  }
  visit(new URL('../dist/app.js', import.meta.url));
  assert.ok(visited.size > 20, 'inspect transitive dependencies, not only the entry module');
  for (const url of visited) assert.doesNotMatch(url, /\/(?:demo-fixtures|demo-chat-store|cx-demo-fixtures(?:\.en)?|sample-data)\.(?:js|json)$/);
  assert.doesNotMatch(appSource, /\b(?:demoProducts|demoRooms|demoActivity|openDemoProduct|isDemo)\b|data-demo-product/);
});

test('stale synthetic saved messages and posts stay out of actual activity without deleting local snapshots', () => {
  const declaration = appSource.match(/const isActualContent = ([^\n]+);/)[0];
  const drawSaved = appSource.slice(appSource.indexOf('function drawSavedTalk(){'), appSource.indexOf('let activityAlerts=null;'));
  const messages = [
    {id: 1, room_id: 'real-room', body: 'Actual saved message'},
    {id: 2, room_id: 'demo-cx-t01', body: 'Old fictional message'},
    {id: 3, room_id: 'other-room', demo: true, body: 'Flagged fictional message'},
    {id: 4, room_id: 'other-room', item: {demo: true}, body: 'Fictional attachment'}
  ];
  const posts = [{id: 5, title: 'Actual saved post'}, {id: 6, room_id: 'demo-cx-t01', title: 'Old fictional post'}];
  const before = JSON.stringify({messages, posts}), box = {innerHTML: ''};
  new Function('$', 'readSavedMessages', 'readSavedPosts', 'esc', 't', 'activityEmpty', 'isSyntheticTarget', 'isSyntheticProductTarget', declaration + drawSaved + ';drawSavedTalk();')(
    () => box, () => messages, () => posts, String, String, () => 'empty', isSyntheticTarget, isSyntheticProductTarget
  );
  assert.match(box.innerHTML, /Actual saved message/);
  assert.match(box.innerHTML, /Actual saved post/);
  assert.doesNotMatch(box.innerHTML, /fictional|Fictional|demo-/);
  assert.equal(JSON.stringify({messages, posts}), before, 'hiding stale snapshots must not rewrite stored user data');
  for (const read of ['readRecent()', 'readSavedMessages()', 'readSavedPosts()', 'readCatalogSaves(storage)']) {
    assert.ok(appSource.includes(read + '.filter(isActualContent)'), read + ' must filter stale sample snapshots');
  }
});

test('synthetic family targets stop before real product lookup even when stale option metadata is present', async () => {
  const isActualContent = new Function('isSyntheticTarget', 'isSyntheticProductTarget', 'return ' + appSource.match(/const isActualContent = ([^\n]+);/)[1])(isSyntheticTarget, isSyntheticProductTarget);
  for (const row of [{id:'demo-product'}, {room_id:'demo-room'}, {family_key:'demo-family'}, {sku:'demo-sku'}, {room:{id:'demo-room'}}, {room:{demo:true}}, {demo:true}]) assert.equal(isActualContent(row), false);
  assert.equal(isActualContent({id:7, room_id:'actual-room', family_key:'brand|serum'}), true);
  const family = appSource.slice(appSource.indexOf('async function openFamily('), appSource.indexOf('// Journey 6-4'));
  let requests = 0;
  const openFamily = new Function('isActualContent', 'fetchFamily', family + ';return openFamily;')(isActualContent, () => { requests++; });
  await openFamily('demo-product');
  await openFamily('demo-product', null, {family_key:'actual-product'});
  await openFamily('actual-product', null, {demo:true});
  for (const id of ['torriden-serum','aestura-cream','roundlab-sun','anua-toner','cosrx-essence','romand-tint','clio-cushion','laneige-lip','medicube-pad','drg-cream','goodal-serum','peripera-tint']) {
    await openFamily(id);
    assert.equal(isActualContent({family_key:id}), false);
    assert.equal(sharedTarget('?product=' + id), null);
  }
  assert.equal(isActualContent({id:991234,name:'Torriden Serum',family_key:'torriden|dive-in-serum'}), true, 'real IDs and overlapping product names are not synthetic evidence');
  assert.deepEqual(sharedTarget('?product=torriden%7Cdive-in-serum'), {product:'torriden|dive-in-serum'});
  assert.equal(sharedTarget('?room=demo-cx-t01'), null);
  assert.equal(requests, 0);
});
