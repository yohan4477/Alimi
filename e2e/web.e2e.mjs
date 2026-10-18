// Browser smoke test for the web app against the live public API. Run in CI on every web change:
//   node e2e/web.e2e.mjs http://localhost:3000/
// Fails on JS errors, an empty catalog, wrong category filtering or missing photos in the favorites view.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:3000/';
const withLang = l => { const u = new URL(base); u.searchParams.set('lang', l); return u.href; };
const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 390, height: 844}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/rest/v1/app_events', r => r.fulfill({status: 201, body: ''})); // keep test traffic out of metrics
const step = async (name, fn) => { await fn(); console.log('ok -', name); };

try {
  await page.goto(withLang('ko')); // flows below assert the Korean copy
  await step('tracked products and first catalog page render without scrolling', async () => {
    await page.waitForSelector('#products > .card', {timeout: 20000});
    await page.waitForSelector('.catalog-grid .card', {timeout: 20000});
    assert.equal(await page.locator('.catalog-grid .card').count(), 24);
  });
  await step('scrolling loads the next catalog page', async () => {
    await page.mouse.wheel(0, 8000);
    await page.waitForFunction(() => document.querySelectorAll('.catalog-grid .card').length >= 48, null, {timeout: 15000});
  });
  await step('category tab filters tracked and catalog items', async () => {
    await page.click('[data-category="립"]');
    await page.waitForFunction(() => document.querySelectorAll('.catalog-grid .card').length > 0, null, {timeout: 15000});
    const metas = await page.locator('.catalog-grid .card .meta').allTextContents();
    assert.ok(metas.every(m => m.startsWith('립')), 'catalog under 립 must be 립');
    const tracked = await page.locator('#products > .card .product-name').allTextContents();
    assert.ok(tracked.length > 0 && !tracked.some(n => /Essence|Serum/.test(n)), 'tracked under 립 must not include essence/serum');
  });
  await step('a product family opens its sizes / options with prices', async () => {
    await page.click('[data-category="클렌징"]');
    const card = page.locator('.catalog-grid .card', {hasText: '옵션'}).first();
    await card.waitFor({timeout: 15000});
    await card.locator('button').click();
    await page.waitForSelector('#family-body .variant-row', {timeout: 10000});
    const rows = await page.locator('#family-body .variant-row').allInnerTexts();
    assert.ok(rows.length >= 2, 'family with options lists at least two variants');
    assert.ok(rows.every(r => /\$\d/.test(r)), 'every variant shows a price');
    await page.click('#family-dialog .close-dialog');
  });
  await step('favorite shows up in the favorites view with a loaded photo', async () => {
    await page.click('[data-category="전체"]');
    const heart = page.locator('#products > .card .heart').first();
    await heart.click();
    await page.click('nav [data-view="saved"]');
    await page.waitForSelector('#products > .card img', {timeout: 10000});
    await page.waitForFunction(() => [...document.querySelectorAll('#products > .card img')].every(i => i.complete && i.naturalWidth > 0), null, {timeout: 20000});
  });
  await step('chat: join a room, share a searched item, report and block', async () => {
    // Chat endpoints are mocked so the test never posts into real rooms. Item search uses the live catalog.
    const room = {id: 'acne', title_en: 'Acne & breakouts', title_ko: '트러블·여드름', intro_en: 'x', intro_ko: '트러블에 효과 본 제품 이야기', sort: 1, members: 3, messages_24h: 1};
    const other = {id: 1, room_id: 'acne', author_tag: 'other', nickname: 'Calm Otter', body: '추천 좀 해주세요', item: null, reply_to: null, likes: 2, created_at: new Date().toISOString()};
    let posted;
    await page.route('**/rest/v1/chat_room_list*', r => r.fulfill({json: [room]}));
    await page.route('**/rest/v1/chat_messages*', r => r.fulfill({json: new URL(r.request().url()).searchParams.get('id') ? [] : [other]}));
    await page.route('**/rest/v1/rpc/join_chat', r => r.fulfill({json: 'Dewy Panda'}));
    await page.route('**/rest/v1/rpc/report_chat', r => r.fulfill({status: 204, body: ''}));
    await page.route('**/rest/v1/rpc/post_chat', r => { posted = r.request().postDataJSON();
      r.fulfill({json: {id: 2, room_id: 'acne', author_tag: 'me', nickname: 'Dewy Panda', body: posted.p_body, reply_to: posted.p_reply_to, likes: 0, created_at: new Date().toISOString(),
        item: {retailer: posted.p_retailer, market: posted.p_market, sku: posted.p_sku, brand: 'ANUA', name: 'Heartleaf Oil', price_minor: 1700, image_url: null, family_key: 'anua|oil'}}}); });
    await page.click('#chat-tab');
    await page.click('[data-chat-room="acne"]');
    await page.waitForSelector('#chat-join[open] .chat-rules');
    await page.click('[data-chat-action="join-ok"]');
    await page.waitForSelector('.chat-msg >> text=추천 좀 해주세요');
    assert.equal(await page.getAttribute('#chat-text', 'placeholder'), 'Dewy Panda(으)로 대화');
    await page.click('[data-chat-menu="1"]');
    await page.click('[data-chat-action="reply"]');
    await page.click('[data-chat-action="attach"]');
    await page.fill('#chat-pick-q', 'anua');
    await page.click('.chat-pick-row', {timeout: 15000});
    await page.fill('#chat-text', '이거 좋아요');
    await page.click('.chat-send');
    await page.waitForSelector('.chat-msg .chat-item');
    assert.equal(posted.p_reply_to, 1);
    assert.ok(posted.p_sku, 'searched item is attached by reference');
    await page.click('[data-chat-menu="1"]');
    await page.click('[data-chat-action="report"]');
    await page.click('[data-chat-report="spam"]');
    await page.click('[data-chat-menu="1"]');
    await page.click('[data-chat-action="block"]');
    assert.equal(await page.locator('.chat-msg >> text=추천 좀 해주세요').count(), 0, 'blocked author is hidden');
    await page.click('[data-chat-action="rooms"]');
    await page.click('[data-chat-action="home"]');
    await page.waitForSelector('#browse:not([hidden])');
  });
  await step('English UI for US users', async () => {
    await page.goto(withLang('en'));
    await page.waitForSelector('.catalog-grid .card', {timeout: 20000});
    assert.equal(await page.textContent('#list-title'), 'Watching prices');
    assert.ok((await page.locator('#categories .chip').allTextContents()).includes('Sun care'));
    assert.match(await page.textContent('.notice'), /Official Stylevana US prices/);
    assert.equal(await page.locator('text=/[가-힣]/').count(), 0, 'no Korean text in the English UI');
  });
  assert.deepEqual(errors, [], 'no JavaScript errors');
  console.log('web e2e passed');
} catch (e) {
  await page.screenshot({path: 'e2e-failure.png', fullPage: true}).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
