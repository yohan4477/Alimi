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
  await page.waitForSelector('#chat:not([hidden])');
  await page.click('#tabbar [data-screen="search"]');await page.click('.explore-link');
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
    assert.ok(await page.locator('#family-description h2').isVisible(), 'product information precedes options');
    // Retailer copy when a permitted feed description exists, category guidance otherwise.
    assert.match(await page.locator('#family-description').innerText(), /제품 분류에 대한 안내|제휴 제공 상품 설명/);
    assert.ok(await page.locator('#family-body .variant-buy').first().getAttribute('href'), 'buy directly without saving');
    const rows = await page.locator('#family-body .variant-row').allInnerTexts();
    assert.ok(rows.length >= 2, 'family with options lists at least two variants');
    assert.ok(rows.every(r => /\$\d/.test(r)), 'every variant shows a price');
    await page.screenshot({path: '/tmp/alimi-product-description.png'});
    await page.click('#family-dialog .close-dialog');
  });
  await step('saved tab: add slots when empty, favorite shows up with a loaded photo', async () => {
    await page.click('#tabbar [data-screen="saved"]');
    assert.equal(await page.locator('#saved .add-slot').count(), 3, 'three add slots when nothing is saved');
    await page.click('#tabbar [data-screen="search"]');await page.fill('#search', '');await page.click('.explore-link');
    await page.click('[data-category="전체"]');
    await page.locator('#products > .card .heart').first().click();
    await page.click('#tabbar [data-screen="saved"]');
    await page.waitForSelector('#saved .saved-card img', {timeout: 10000});
    assert.equal(await page.locator('#saved .add-slot').count(), 2);
    await page.waitForFunction(() => [...document.querySelectorAll('#saved .saved-card img')].every(i => i.complete && i.naturalWidth > 0), null, {timeout: 20000});
    await page.click('#saved [data-screen="settings"]');
    await page.waitForSelector('#settings .set-row >> text=관심상품 정리하기');
    assert.ok(await page.isVisible('#tabbar'), 'tab bar stays on settings');
  });
  await step('search opens its own screen', async () => {
    await page.click('#tabbar [data-screen="search"]');
    assert.ok(await page.isHidden('#browse'), 'home is replaced by the search screen');
    await page.fill('#search', 'cosrx');
    await page.waitForSelector('#search-catalog .catalog-grid .card', {timeout: 15000});
  });
  await step('popular-brand badge opens the brand page with its products', async () => {
    await page.route('**/rest/v1/catalog_brands*', r => r.fulfill({json: [{brand: 'COSRX', brand_ko: '코스알엑스', families: 300, logo_url: null}, {brand: 'MISSHA', brand_ko: '미샤', families: 900, logo_url: null}]}));
    await page.goto(withLang('ko'));
    await page.click('#tabbar [data-screen="search"]');await page.click('.explore-link');
    await page.click('[data-brand="COSRX"]');
    await page.waitForFunction(() => document.querySelector('#brand h1')?.textContent === '코스알엑스', null, {timeout: 15000});
    await page.waitForFunction(() => document.querySelectorAll('#brand .catalog-grid .card').length > 0, null, {timeout: 15000});
    assert.equal(await page.evaluate(() => scrollY), 0, 'brand page starts at the top');
    const brands = await page.locator('#brand .catalog-grid .card .brand').allTextContents();
    assert.ok(brands.every(b => b === '코스알엑스'), 'only COSRX families');
    await page.click('#brand [data-screen="home"]');
    await page.waitForSelector('#browse:not([hidden])');
  });
  await step('chat: join a room, share a searched item, report and block', async () => {
    // Chat endpoints are mocked so the test never posts into real rooms. Item search uses the live catalog.
    const room = {id: 'acne', title_en: 'Acne & breakouts', title_ko: '트러블·여드름', intro_en: 'x', intro_ko: '트러블에 효과 본 제품 이야기', sort: 1, members: 3, messages_24h: 1, kind: 'topic', tag: 'skin'};
    const other = {id: 1, room_id: 'acne', author_tag: 'other', nickname: 'Calm Otter', body: '추천 좀 해주세요', item: null, reply_to: null, likes: 2, created_at: new Date().toISOString()};
    let posted;
    await page.route('**/rest/v1/chat_room_list*', r => r.fulfill({json: [room]}));
    await page.route('**/rest/v1/chat_messages*', r => r.fulfill({json: new URL(r.request().url()).searchParams.get('id') ? [] : [other]}));
    await page.route('**/rest/v1/rpc/join_chat', r => r.fulfill({json: 'Dewy Panda'}));
    await page.route('**/rest/v1/rpc/report_chat', r => r.fulfill({status: 204, body: ''}));
    await page.route('**/rest/v1/rpc/post_chat', r => { posted = r.request().postDataJSON();
      r.fulfill({json: {id: 2, room_id: 'acne', author_tag: 'me', nickname: 'Dewy Panda', body: posted.p_body, reply_to: posted.p_reply_to, likes: 0, created_at: new Date().toISOString(),
        item: {retailer: posted.p_retailer, market: posted.p_market, sku: posted.p_sku, brand: 'ANUA', name: 'Heartleaf Oil', price_minor: 1700, image_url: null, family_key: 'anua|oil'}}}); });
    await page.click('#tabbar [data-screen="chat"]');
    await page.route('**/rest/v1/community_posts*', r => r.fulfill({json: []}));
    assert.ok(await page.isVisible('#tabbar'), 'tab bar stays on chat');
    await page.click('[data-home-tab="rooms"][role="tab"]');
    await page.click('.room-list-card[data-chat-room="acne"]');
    await page.waitForSelector('#chat-join[open] .chat-rules');
    await page.click('[data-chat-action="join-ok"]');
    await page.waitForSelector('#post-list >> text=아직 글이 없어요');
    await page.click('[data-topic-mode="live"]');
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
    await page.click('#tabbar [data-screen="search"]');await page.fill('#search', '');await page.click('.explore-link');
    await page.waitForSelector('#browse:not([hidden])');
  });
  await step('community: write a question with a product and reasons, then comment', async () => {
    // Write RPCs are mocked; nothing reaches real topics.
    let created, commented;
    const post = {id: 41, room_id: 'acne', author_tag: 'me', nickname: 'Dewy Panda', kind: 'question', title: '', body: '', item: null, reasons: [], comments: 0, likes: 0, created_at: new Date().toISOString(), last_activity_at: new Date().toISOString()};
    await page.route('**/rest/v1/rpc/create_post', r => { created = r.request().postDataJSON(); Object.assign(post, {title: created.p_title, reasons: created.p_reasons, item: created.p_sku ? {retailer: created.p_retailer, market: created.p_market, sku: created.p_sku, brand: 'ANUA', name: 'Heartleaf Oil', price_minor: 1700, image_url: null, family_key: 'anua|oil'} : null}); r.fulfill({json: post}); });
    await page.route('**/rest/v1/community_posts*', r => r.fulfill({json: new URL(r.request().url()).searchParams.get('id') ? [post] : []}));
    await page.route('**/rest/v1/community_comments*', r => r.fulfill({json: []}));
    await page.route('**/rest/v1/rpc/add_comment', r => { commented = r.request().postDataJSON(); r.fulfill({json: {id: 9, post_id: 41, author_tag: 'me', nickname: 'Dewy Panda', body: commented.p_body, item: null, likes: 0, created_at: new Date().toISOString()}}); });
    await page.click('#tabbar [data-screen="chat"]');
    await page.click('[data-home-tab="rooms"][role="tab"]');
    await page.click('.room-list-card[data-chat-room="acne"]');
    await page.click('[data-chat-action="write"]');
    await page.click('[data-write-kind="question"]');
    await page.fill('#write-title', '끈적이지 않는 선크림 추천해 주세요');
    await page.click('[data-write-reason="texture"]');
    await page.click('[data-chat-action="attach-write"]');
    await page.fill('#chat-pick-q', 'anua');
    await page.click('.chat-pick-row', {timeout: 15000});
    await page.click('[data-chat-action="write-submit"]');
    await page.waitForSelector('.post-full h1 >> text=끈적이지 않는 선크림 추천해 주세요');
    assert.deepEqual(created.p_reasons, ['texture']);
    assert.ok(created.p_sku, 'product attached by reference');
    await page.fill('#comment-text', '이거 가벼워요');
    await page.click('#comment-form .chat-send');
    await page.waitForSelector('.comment >> text=이거 가벼워요');
    assert.equal(commented.p_post, 41);
  });
  await step('English UI for US users', async () => {
    await page.goto(withLang('en'));
    await page.click('#tabbar [data-screen="search"]');await page.click('.explore-link');
    await page.waitForSelector('.catalog-grid .card', {timeout: 20000});
    assert.equal(await page.textContent('#list-title'), 'Explore products');
    assert.ok((await page.locator('#categories .chip').allTextContents()).includes('Sun care'));
    assert.match(await page.textContent('.notice'), /Official Stylevana US prices/);
    assert.equal(await page.locator('#browse :text-matches("[가-힣]")').count(), 0, 'no Korean text in the English UI');
  });
  await page.locator('#products > .card .product-open').first().click();
  assert.equal(await page.locator('#set-target,.analysis-section,.target-section').count(),0,'no price tracking UI');
  if (errors.length) console.log('JS errors:', JSON.stringify(errors));
  assert.deepEqual(errors, [], 'no JavaScript errors');
  console.log('web e2e passed');
} catch (e) {
  await page.screenshot({path: 'e2e-failure.png', fullPage: true}).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
