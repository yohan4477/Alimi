// Isolated browser coverage for CI and local Chromium.
// Every request is fulfilled from dist or an in-memory fixture. There is no
// HTTP server, route.continue(), real account, production read, or remote write.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {staticEntryPath} from '../dist/public-routes.js';
import {SUPABASE_URL} from '../dist/supabase.js';

const base = 'https://sample-boundary.test';
const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const source = JSON.parse(await readFile(new URL('../dist/cx-demo-fixtures.json', import.meta.url), 'utf8'));
const english = JSON.parse(await readFile(new URL('../dist/cx-demo-fixtures.en.json', import.meta.url), 'utf8'));
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'};
const fiction = /fictional|가상/i;
const korean = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const preferenceKeys = new Set(['seoulbeauty-language', 'beauty-language', 'alimi-lang', 'seoulbeauty-region', 'seoulbeauty-region-manual']);
const forbiddenSampleModule = /\/(?:app|visitor-entry|auth|account-sync|supabase|events|chat|chat-api|live|profile|saved-messages|saved-catalog|demo-chat-store|demo-fixtures)\.js$/;
const sentinel = 'PRIVATE_FIXTURE_MUST_NOT_APPEAR';
const seededLocal = {
  'alimi-auth-session-v1': JSON.stringify({access_token: sentinel, refresh_token: sentinel, expires_at: 4102444800}),
  'alimi-live-v1': JSON.stringify({favorites: [sentinel], prices: {}, history: {}}),
  'seoulbeauty-saved-messages-v1': JSON.stringify([{id: 991, room_id: 'private-fixture-room', body: sentinel, nickname: sentinel}]),
  'seoulbeauty-catalog-saves-v1': JSON.stringify([{id: 'catalog|fixture', sku: 'private', name: sentinel, price: 10, url: 'https://example.test/private'}]),
  'seoulbeauty-demo-chat-v1': JSON.stringify({'demo-cx-t01': [{id: 992, room_id: 'demo-cx-t01', body: sentinel, nickname: sentinel, demo: true}]}),
  'seoulbeauty-community-mode': 'offline',
  'seoulbeauty-profile-v1': JSON.stringify({nickname: sentinel}),
};
const seededSession = {'alimi-auth-code-verifier': sentinel, 'alimi-auth-state': sentinel, 'seoulbeauty-auth-started': '1'};
const now = '2026-10-23T12:00:00.000Z';
const liveRoom = {id: 'actual-room', title_en: 'Actual community fixture', title_ko: '실제 커뮤니티 테스트', intro_en: 'A mocked actual-service discussion', intro_ko: '실제 서비스 경로 테스트', kind: 'topic', tag: 'skin', service_region: 'us', sort: 1, members: 2, messages_24h: 1, last_message_at: now};
const liveMessage = {id: 501, room_id: liveRoom.id, author_tag: 'fixture-other', nickname: 'Fixture reader', body: 'ACTUAL_SERVICE_FIXTURE_MESSAGE', item: null, reply_to: null, likes: 0, created_at: now};
let browser;

async function fixture({language = 'en', country = 'US', width = 390, live = false, appStub = false, saved = {}, session = {}} = {}) {
  const context = await browser.newContext({locale: language === 'ko' ? 'ko-KR' : 'en-US', viewport: {width, height: 844}, serviceWorkers: 'block'});
  await context.addInitScript(({saved, session}) => {
    const nativeGet = Storage.prototype.getItem;
    const nativeSet = Storage.prototype.setItem;
    const nativeKey = Storage.prototype.key;
    for (const [key, value] of Object.entries(saved)) nativeSet.call(localStorage, key, value);
    for (const [key, value] of Object.entries(session)) nativeSet.call(sessionStorage, key, value);
    const audit = window.storageAudit = {reads: [], writes: [], other: []};
    const area = object => object === localStorage ? 'local' : 'session';
    Storage.prototype.getItem = function(key) { audit.reads.push({area: area(this), key: String(key)}); return nativeGet.call(this, key); };
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function(...args) { audit.writes.push({area: area(this), method, key: String(args[0] ?? '')}); return original.apply(this, args); };
    }
    Storage.prototype.key = function(index) { audit.reads.push({area: area(this), key: '<enumerate>'}); return nativeKey.call(this, index); };
    window.fixtureStorageSnapshot = () => {
      const snapshot = storage => Object.fromEntries(Array.from({length: storage.length}, (_, index) => { const key = nativeKey.call(storage, index); return [key, nativeGet.call(storage, key)]; }));
      return {local: snapshot(localStorage), session: snapshot(sessionStorage)};
    };
    for (const [object, method, name] of [[globalThis.indexedDB, 'open', 'indexedDB.open'], [globalThis.caches, 'open', 'caches.open']]) {
      if (!object) continue;
      const original = object[method].bind(object);
      object[method] = (...args) => { audit.other.push(name); return original(...args); };
    }
  }, {saved, session});
  const requests = [], denied = [], errors = [], mockedWrites = [];
  let likes = 0;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const record = {url: url.href, pathname: url.pathname, method: request.method(), body: request.postData() || ''};
    requests.push(record);
    const deny = () => { denied.push(record); return route.abort('blockedbyclient'); };
    if (live && url.origin === SUPABASE_URL) {
      if (!url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/auth/v1/')) return deny();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mockedWrites.push(record);
      const resource = url.pathname.split('/').at(-1);
      const headers = {'access-control-allow-origin': base, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS'};
      const mock = options => route.fulfill({...options, headers});
      if (request.method() === 'OPTIONS') return mock({status: 204});
      if (url.pathname.startsWith('/auth/v1/')) return mock({status: 401, json: {message: 'No fixture account'}});
      if (resource === 'chat_room_list') return mock({json: [liveRoom, {...liveRoom, id: 'demo-cx-t01', title_en: 'MUST_NOT_RENDER_DEMO'}, {...liveRoom, id: 'flagged-fixture', demo: true, title_en: 'MUST_NOT_RENDER_FLAGGED'}]});
      if (resource === 'chat_messages') return mock({json: url.searchParams.has('id') ? [] : url.searchParams.get('room_id') === 'eq.' + liveRoom.id ? [liveMessage] : []});
      if (resource === 'like_chat') return mock({json: ++likes});
      if (resource === 'post_chat') return mock({json: {...liveMessage, id: 502, author_tag: 'fixture-self', body: request.postDataJSON().p_body}});
      if (resource === 'get_profile') return mock({json: null});
      if (resource === 'app_events') return mock({status: 204});
      return mock({json: []});
    }
    if (url.origin !== base || request.method() !== 'GET') return deny();
    if (url.pathname === '/api/language') return route.fulfill({json: {language, suggestedRegion: country === 'KR' ? 'kr' : null}});
    if (/^\/(?:api|rest|auth)(?:\/|$)/.test(url.pathname)) return deny();
    if (appStub && url.pathname === '/app.js') return route.fulfill({contentType: 'text/javascript', body: "import {region} from './region.js'; window.fixtureActualMarket=region; document.body.dataset.actualFixture='loaded';"});
    // Root is served from the physical index, independently of dev rewrite helpers.
    const name = url.pathname === '/' ? '/index.html' : staticEntryPath(decodeURIComponent(url.pathname));
    const file = path.resolve(dist, '.' + name);
    if (!file.startsWith(dist + path.sep) || name.split('/').some(part => part.startsWith('.'))) return deny();
    try { return await route.fulfill({contentType: mime[path.extname(file)] || 'application/octet-stream', body: await readFile(file)}); }
    catch { denied.push(record); return route.fulfill({status: 404, body: 'Missing static fixture'}); }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  return {context, page, requests, denied, errors, mockedWrites};
}
async function readySample(f) {
  await f.page.locator('[data-sample-disclosure]:visible').first().waitFor();
  assert.equal(new URL(f.page.url()).pathname, '/');
  assert.equal(await f.page.locator('html').getAttribute('data-locale-pending'), null);
}
async function assertSampleBoundary(f, {unchanged = false} = {}) {
  assert.deepEqual(f.denied, [], 'all sample requests must be permitted same-origin static files or /api/language');
  assert.deepEqual(f.errors, [], 'sample renders without uncaught errors');
  assert.ok(f.requests.every(request => new URL(request.url).origin === base && request.method === 'GET'));
  assert.ok(!f.requests.some(request => forbiddenSampleModule.test(request.pathname)), 'sample must not import actual-service, account, storage or telemetry modules');
  assert.ok(!JSON.stringify(f.requests).includes(sentinel), 'private storage never leaves through URL or request body');
  assert.ok(!(await f.page.locator('body').innerText()).includes(sentinel), 'private saved/account data never appears');
  const audit = await f.page.evaluate(() => window.storageAudit);
  assert.deepEqual(audit.reads.filter(entry => entry.area !== 'local' || !preferenceKeys.has(entry.key)), [], 'sample reads only language/market preferences, not actual identity or saves');
  assert.deepEqual(audit.writes.filter(entry => entry.area !== 'local' || !preferenceKeys.has(entry.key)), [], 'sample cannot persist interaction/account/saved data');
  assert.deepEqual(audit.other, [], 'no IndexedDB or cache store access from sample');
  if (unchanged) {
    assert.deepEqual(audit.writes, [], 'likes and saves are memory-only');
    assert.deepEqual(await f.page.evaluate(() => window.fixtureStorageSnapshot()), {local: seededLocal, session: seededSession});
  }
}
async function chooseSampleOption(page, attribute, value) {
  assert.equal(await page.locator('[data-sample-market-open]:visible').count(), 1, 'one combined language/market selector');
  await page.locator('[data-sample-market-open]:visible').click();
  await page.locator('#service-region-picker[open]').waitFor();
  await page.locator(`#service-region-picker [${attribute}="${value}"]`).click();
  assert.equal(await page.locator('#service-region-picker').evaluate(dialog => dialog.open), false);
  assert.equal(new URL(page.url()).pathname, '/');
}
async function assertPresentation(page, language) {
  assert.match(await page.locator('[data-sample-disclosure]:visible').first().innerText(), fiction);
  assert.equal(await page.locator('html').getAttribute('lang'), language);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  if (language === 'en') assert.doesNotMatch(await page.locator('body').innerText(), korean, 'English visible screen contains no Korean');
}

try {
  browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {channel: 'chrome'});
  await mkdir('e2e-artifacts',{recursive:true});
  assert.equal(source.rooms.length, 13);
  assert.equal(Object.values(source.messages).flat().length, 80);
  for (const language of ['ko', 'en']) for (const width of [320, 390]) {
    const f = await fixture({language, width, country: language === 'ko' ? 'KR' : 'US', saved: seededLocal, session: seededSession});
    try {
      await f.page.goto(base + '/?lang=' + language);
      await readySample(f);
      await assertPresentation(f.page, language);
      await f.page.evaluate(()=>document.fonts.ready);
      await f.page.screenshot({path:`e2e-artifacts/sample-home-${language}-${width}.png`,fullPage:true});
      assert.deepEqual(await f.page.locator('[data-sample-room]:visible').evaluateAll(nodes => nodes.map(node => node.dataset.sampleRoom)), source.rooms.map(room => room.id));
      let messages = 0;
      for (const room of source.rooms) {
        const expected = source.messages[room.id];
        await f.page.locator(`[data-sample-room="${room.id}"]:visible`).click();
        await f.page.locator('[data-sample-message]').first().waitFor();
        if(room.id===source.rooms[0].id){
          // Reload the history-pushed root deep link through the physical index.
          await f.page.reload();await readySample(f);
          await f.page.locator('[data-sample-message]').first().waitFor();
        }
        assert.equal(new URL(f.page.url()).pathname, '/');
        assert.equal(new URL(f.page.url()).searchParams.get('room'), room.id);
        assert.equal(await f.page.locator('#chat h1').innerText(), language === 'en' ? english.rooms[room.id].title : room.title_ko);
        assert.deepEqual(await f.page.locator('[data-sample-message]').evaluateAll(nodes => nodes.map(node => node.dataset.sampleMessage)), expected.map(message => String(message.id)));
        for (const message of expected) {
          const row = f.page.locator(`[data-sample-message="${message.id}"]`);
          assert.equal(await row.locator('.msg-body').innerText(), language === 'en' ? english.messages[message.id].body : message.body);
          assert.equal(await row.locator('.chat-nick').innerText(), language === 'en' ? english.messages[message.id].nickname : message.nickname);
          const quote = row.locator('[data-sample-jump]');
          assert.equal(await quote.count(), message.reply_to ? 1 : 0, `${message.id}: only delayed references render a quote`);
          if (message.reply_to) {
            assert.equal(await quote.getAttribute('data-sample-jump'), String(message.reply_to));
            await f.page.evaluate(() => {
              window.sampleJumpTarget = null;
              const original = Element.prototype.scrollIntoView;
              Element.prototype.scrollIntoView = function (...args) {
                window.sampleJumpTarget = this.dataset.sampleMessage;
                return original.apply(this, args);
              };
            });
            await quote.click();
            assert.equal(await f.page.evaluate(() => window.sampleJumpTarget), String(message.reply_to), 'delayed quote scrolls to the original message');
          }
        }
        if(room.id===source.rooms[0].id)await f.page.screenshot({path:`e2e-artifacts/sample-room-${language}-${width}.png`,fullPage:true});
        messages += expected.length;
        await assertPresentation(f.page, language);
        await f.page.locator('.room-back').click();
        await f.page.locator('[data-sample-room]:visible').first().waitFor();
      }
      assert.equal(messages, 80);
      await assertSampleBoundary(f, {unchanged: true});
      console.log(`ok - root ${language} at ${width}px renders all 13 fictional rooms / 80 messages, no private storage or actual requests`);
    } finally { await f.context.close(); }
  }

  for (const width of [320, 390]) {
    const f = await fixture({width, saved: seededLocal, session: seededSession});
    try {
      await f.page.goto(base + '/?lang=en'); await readySample(f);
      const room = source.rooms[0], message = source.messages[room.id][0];
      const lastRoom = f.page.locator('[data-sample-room]:visible').last();
      await lastRoom.scrollIntoViewIfNeeded();
      const homeScroll = await f.page.evaluate(() => scrollY);
      assert.ok(homeScroll > 0, 'room list is scrolled before opening a room');
      await lastRoom.click();
      await f.page.locator('[data-sample-back]').waitFor();
      await f.page.waitForFunction(() => scrollY === 0);
      assert.equal(await f.page.locator('#tabbar').isVisible(), false, 'room layout hides home tab bar');
      await f.page.goBack();
      await f.page.locator('[data-sample-room]:visible').first().waitFor();
      await f.page.waitForFunction(expected => Math.abs(scrollY - expected) < 3, homeScroll);
      await f.page.locator(`[data-sample-room="${room.id}"]`).click();
      const like = f.page.locator(`[data-sample-like="${message.id}"]`), save = f.page.locator(`[data-sample-save="${message.id}"]`);
      await like.click(); await save.click();
      assert.equal(await like.getAttribute('aria-pressed'), 'true'); assert.equal(await save.getAttribute('aria-pressed'), 'true');
      await f.page.locator('.room-back').click();
      await f.page.locator('#tabbar [data-sample-screen="saved"]').click();
      assert.equal(new URL(f.page.url()).pathname, '/');
      assert.equal(await f.page.locator('#saved [data-sample-room]').count(), 1);
      assert.equal(await f.page.locator('#saved [data-sample-room]').getAttribute('data-sample-room'), room.id);
      await f.page.locator('#tabbar [data-sample-screen="search"]').click();
      await f.page.locator('#sample-search').fill(english.rooms[room.id].title);
      assert.equal(await f.page.locator('#sample-results [data-sample-room]').count(), 1);
      await f.page.locator(`#sample-results [data-sample-room="${room.id}"]`).click();
      assert.equal(await like.getAttribute('aria-pressed'), 'true'); assert.equal(await save.getAttribute('aria-pressed'), 'true');
      await f.page.goBack(); await f.page.locator('#sample-search').waitFor();
      assert.equal(new URL(f.page.url()).pathname, '/');
      await assertSampleBoundary(f, {unchanged: true});
      await chooseSampleOption(f.page, 'data-sample-market', 'kr');
      assert.equal(new URL(f.page.url()).pathname, '/'); assert.equal(new URL(f.page.url()).searchParams.get('region'), 'kr');
      await chooseSampleOption(f.page, 'data-sample-market', 'us');
      assert.equal(new URL(f.page.url()).pathname, '/'); assert.equal(new URL(f.page.url()).searchParams.get('region'), 'us');
      await chooseSampleOption(f.page, 'data-sample-language', 'ko'); await assertPresentation(f.page, 'ko');
      await chooseSampleOption(f.page, 'data-sample-language', 'en'); await assertPresentation(f.page, 'en');
      assert.equal(new URL(f.page.url()).pathname, '/');
      await assertSampleBoundary(f);
      await f.page.reload(); await readySample(f);
      await f.page.locator('#tabbar [data-sample-screen="saved"]').click();
      assert.equal(await f.page.locator('#saved [data-sample-room]').count(), 0, 'sample saves disappear on reload');
      await f.page.locator('#tabbar [data-sample-screen="chat"]').click();
      await f.page.locator(`[data-sample-room="${room.id}"]:visible`).click();
      assert.equal(await like.getAttribute('aria-pressed'), 'false'); assert.equal(await save.getAttribute('aria-pressed'), 'false');
      await assertSampleBoundary(f);
      console.log(`ok - ${width}px sample navigation, search, market, language, browser back and memory-only likes/saves`);
    } finally { await f.context.close(); }
  }

  for (const suffix of ['?demo=1', '?room=demo-cx-t01', '?product=demo-item', '?product=torriden-serum', '?productRooms=synthetic-room', '?room=synthetic-room', '?code=fixture-code', '#access_token=fixture_fragment_not_a_real_token&token_type=bearer']) {
    const f = await fixture();
    try { await f.page.goto(base + '/' + suffix); await readySample(f); await assertSampleBoundary(f); }
    finally { await f.context.close(); }
  }
  for (const market of ['kr', 'us']) {
    const f = await fixture();
    try { await f.page.goto(`${base}/${market}?room=demo-cx-t01&lang=en`); await readySample(f); assert.equal(new URL(f.page.url()).searchParams.get('region'), market); await assertSampleBoundary(f); }
    finally { await f.context.close(); }
  }
  console.log('ok - demo and synthetic targets and unsupported auth fragments never import or contact actual services');

  const nonce = 'fixture_nonce_123456', draft = '24bd66b5-6365-48f7-a14f-98609579bea1';
  for (const suffix of [
    '/?room=actual-room&lang=en&region=us',
    '/?product=brand%7Cserum&lang=en&region=us',
    '/?beautyDraft=' + draft + '&region=us',
    '/?productRooms=1&region=us&lang=en',
    '/?code=fixture-code&sb_login_state=' + nonce + '&region=us',
    '/kr?lang=en&room=actual-room&code=fixture-code&sb_login_state=' + nonce + '&beautyDraft=' + draft + '&demo=1',
    '/us/?lang=ko&product=brand%7Cserum',
  ]) {
    const f = await fixture({appStub: true});
    try {
      await f.page.goto(base + suffix); await f.page.locator('body[data-actual-fixture="loaded"]').waitFor();
      const original = new URL(base + suffix), target = new URL(f.page.url());
      assert.equal(target.origin, base); assert.equal(target.pathname, '/live');
      assert.equal(target.searchParams.has('demo'), false);
      for (const [key, value] of original.searchParams) if (key !== 'demo' && key !== 'region') assert.equal(target.searchParams.get(key), value);
      const legacyMarket = original.pathname.split('/')[1];
      assert.equal(target.searchParams.get('region'), ['kr', 'us'].includes(legacyMarket) ? legacyMarket : original.searchParams.get('region'));
      assert.ok(!f.requests.some(request => /\/(?:sample-app|sample-data|sample-view)\.js$/.test(request.pathname)), 'compatibility redirects before importing sample data');
      assert.deepEqual(f.denied, []); assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
  }
  for(const route of ['/', '/kr']){
    const f=await fixture({appStub:true});
    try{
      await f.page.goto(base+route+'?code=fixture-code&sb_login_state='+nonce+'&room=actual-room&room=demo-cx-t01&product=torriden-serum&region=us&lang=en');
      await f.page.locator('body[data-actual-fixture="loaded"]').waitFor();
      const target=new URL(f.page.url());assert.equal(target.pathname,'/live');assert.equal(target.searchParams.has('room'),false);assert.equal(target.searchParams.has('product'),false);assert.equal(target.searchParams.get('sb_login_state'),nonce);
      assert.ok(!f.requests.some(request=>/\/(?:sample-app|sample-data|sample-view)\.js$/.test(request.pathname)));assert.deepEqual(f.denied,[]);assert.deepEqual(f.errors,[]);
    }finally{await f.context.close();}
  }
  console.log('ok - legacy market and valid root room/product/PKCE/draft targets preserve context on /live');

  for (const suffix of ['', '&room=demo-cx-t01']) {
    const f = await fixture({live: true, saved: {'seoulbeauty-community-mode': 'offline', 'seoulbeauty-demo-chat-v1': seededLocal['seoulbeauty-demo-chat-v1'], 'seoulbeauty-interests-v1': JSON.stringify({version: 1, skincare: false, makeup: false, concerns: [], done: true})}});
    try {
      await f.page.goto(base + '/live?region=us&lang=en&demo=1' + suffix);
      await f.page.locator(`[data-chat-room="${liveRoom.id}"]`).first().waitFor();
      assert.equal(await f.page.locator('[data-sample-disclosure], [data-sample-room], [data-chat-room^="demo-"]').count(), 0);
      assert.doesNotMatch(await f.page.locator('body').innerText(), /MUST_NOT_RENDER_DEMO|MUST_NOT_RENDER_FLAGGED|PRIVATE_FIXTURE_MUST_NOT_APPEAR/);
      await f.page.locator(`[data-chat-room="${liveRoom.id}"]`).first().click();
      await f.page.locator('#chat-log .msg-body').first().waitFor();
      assert.equal(await f.page.locator('#chat-log .msg-body').first().innerText(), liveMessage.body);
      await f.page.locator(`[data-chat-like="${liveMessage.id}"]`).click();
      await f.page.waitForFunction(id => document.querySelector(`[data-chat-like="${id}"]`)?.getAttribute('aria-pressed') === 'true', liveMessage.id);
      await f.page.locator('#chat-text').fill('Actual route mocked write');
      await f.page.locator('#chat-form .chat-send').click();
      await f.page.waitForFunction(() => document.querySelector('#chat-text')?.value === '');
      assert.ok(f.mockedWrites.some(request => request.pathname.endsWith('/like_chat')));
      assert.ok(f.mockedWrites.some(request => request.pathname.endsWith('/post_chat')));
      const api = f.requests.filter(request => new URL(request.url).origin !== base);
      assert.ok(api.some(request => request.pathname.endsWith('/chat_room_list')));
      assert.ok(api.every(request => !/demo-cx|synthetic-room|MUST_NOT_RENDER|PRIVATE_FIXTURE_MUST_NOT_APPEAR/.test(decodeURIComponent(request.url) + request.body)), 'synthetic targets never enter actual reads, writes or events');
      assert.ok(!f.requests.some(request => /\/(?:sample-app|sample-data|sample-view|demo-chat-store|demo-fixtures|cx-demo-fixtures)(?:\.en)?\.(?:js|json)$/.test(request.pathname)), 'actual app must not load sample fixtures');
      assert.deepEqual(f.denied, []); assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
  }
  console.log('ok - /live ignores stale offline/demo switches; actual reads/writes are fully mocked and exclude sample IDs');
} finally { await browser?.close(); }
