// Deterministic end-to-end run with every Supabase call mocked: guards the screen wiring (tab bar, brand page,
// saved slots, settings, search, community posts / comments / reviews / live chat, product sheet buy links)
// so refactors can't silently break it. No network, no production writes.
//   node e2e/offline.e2e.mjs http://localhost:3000/
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:3000/';
const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']} : {channel: 'chrome'});
const now = new Date().toISOString();
const item = {retailer: 'Stylevana US', market: 'US', sku: '501', brand: 'COSRX', brand_ko: '코스알엑스', name: 'Snail Essence 100ml', category: '에센스·세럼',
  price_minor: 1750, currency: 'USD', availability: 'in_stock', image_url: null, family_key: 'cosrx|snail essence', size_label: '100ml', option_label: null,
  unit: 'ml', unit_price_minor: 175, url: 'https://www.stylevana.com/snail.html', affiliate_url: 'https://www.awin1.com/pclick.php?p=1&a=2&m=90791',
  description: 'Lightweight snail mucin essence.', description_permission: 'Awin feed test'};
const family = {family_key: item.family_key, brand: 'COSRX', brand_ko: '코스알엑스', base_name: 'Snail Essence', category: '에센스·세럼', image_url: null,
  min_price_minor: 1750, max_price_minor: 1750, variants: 1, best_unit_price_minor: 175, sort_key: '501'};
const room = {id: 'acne', title_en: 'Acne & breakouts', title_ko: '트러블·여드름', intro_en: 'What worked?', intro_ko: '트러블 이야기', sort: 1, kind: 'topic', tag: 'skin',
  brand: null, logo_url: null, members: 3, messages_24h: 1, last_message_at: now};
const post = {id: 7, room_id: 'acne', author_tag: 'other', nickname: 'Calm Otter', kind: 'question', title: 'Gentle essence for acne skin?', body: 'Oily, sensitive.',
  item: null, reasons: ['texture'], comments: 1, likes: 0, created_at: now, last_activity_at: now, photos: [], sponsored: false};
const review = {...post, id: 8, kind: 'review', title: 'Three weeks with snail essence', item, skin_type: 'oily', skin_tone: 'deep', used_for: 'weeks', bought_where: 'Stylevana', bought_price_minor: 1650, ship_country: 'US', ship_days: 9};
const comment = {id: 3, post_id: 7, author_tag: 'other2', nickname: 'Soft Seal', body: 'Try this one', item, likes: 0, created_at: now};
const message = {id: 11, room_id: 'acne', author_tag: 'other', nickname: 'Calm Otter', body: 'Anyone tried snail?', item: null, reply_to: null, likes: 0, created_at: now};

const profiles = [];
async function mock(page, calls) {
  await page.route('**/rest/v1/**', route => {
    const req = route.request(), u = new URL(req.url()), res = u.pathname.split('/').at(-1), q = k => u.searchParams.get(k);
    calls.push(res);
    const json = body => route.fulfill({json: body});
    switch (res) {
      case 'app_events': return route.fulfill({status: 204});
      case 'offers': return json([]);
      case 'catalog_brands': return json([{brand: 'COSRX', brand_ko: '코스알엑스', families: 143, logo_url: null}]);
      case 'catalog_families': return json(q('offset') === '0' ? [family] : []);
      case 'catalog_items': return json([item]);
      case 'chat_room_list': return json([room]);
      case 'chat_members': return json([]);
      case 'chat_messages': return json(q('id') ? [] : q('room_id') ? [message] : []);
      case 'community_posts': return json(q('id') ? [post, review].filter(p => q('id') === 'eq.' + p.id || q('id').startsWith('in.')) : [post, review]);
      case 'community_comments': return json([comment]);
      case 'product_mentions': return json([{source: 'review', source_id: 8, post_id: 8, room_id: null, created_at: now}, {source: 'comment', source_id: 3, post_id: 7, room_id: null, created_at: now}]);
      case 'join_chat': return json('Dewy Panda');
      case 'post_chat': { const b = req.postDataJSON(); return json({...message, id: 12, author_tag: 'me', nickname: 'Dewy Panda', body: b.p_body}); }
      case 'add_comment': { const b = req.postDataJSON(); return json({...comment, id: 4, author_tag: 'me', body: b.p_body, item: null}); }
      case 'report_chat': case 'report_community': return route.fulfill({status: 204});
      case 'get_profile': return json(null);
      case 'set_profile': { const p = req.postDataJSON().p_profile; profiles.push(p); return json(p); }
      case 'delete_profile': return route.fulfill({status: 204});
      default: return json([]);
    }
  });
}
const step = async (name, fn) => { await fn(); console.log('ok -', name); };

try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  const errors = [], calls = [];
  page.on('pageerror', e => errors.push(e.message));
  await mock(page, calls);
  await page.goto(base + '?lang=en');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('alimi-chat-agreed', '1'); });
  await page.reload();

  await step('community is the first screen with the tab bar', async () => {
    await page.waitForSelector('#tabbar [data-screen="chat"].active');
    await page.waitForSelector('#chat [data-chat-room="acne"]');
  });
  await step('start a conversation opens a topic sheet, then the write form for that topic', async () => {
    await page.click('[data-chat-action="find-topic"]');
    await page.click('#chat-start [data-chat-start="acne"]');
    await page.waitForSelector('#post-write[open] #write-title');
    assert.match(await page.locator('#post-write h2').innerText(), /Acne/);
    await page.click('#post-write .close-dialog');
  });
  await step('search finds catalog items', async () => {
    await page.click('#tabbar [data-screen="search"]');
    await page.fill('#search', 'snail');
    await page.waitForSelector('#search-catalog .card .heart');
  });
  await step('saved tab shows add slots and settings', async () => {
    await page.click('#tabbar [data-screen="saved"]');
    assert.equal(await page.locator('#saved .add-slot').count(), 3);
    await page.click('#saved [data-screen="settings"]');
    await page.waitForSelector('#settings .set-row');
  });
  await step('profile: under 13 saves nothing, B2B locked under 16, concerns need health consent, Do Not Sell', async () => {
    await page.click('#tabbar [data-screen="saved"]');
    await page.click('#saved [data-profile-open]');
    await page.click('#profile-dialog [data-value="under13"]');
    assert.equal(await page.isDisabled('#profile-dialog [data-profile-save]'), true);
    await page.click('#profile-dialog [data-value="13-15"]');
    assert.equal(await page.isDisabled('#profile-dialog [data-profile-check="consent_b2b"]'), true);
    await page.click('#profile-dialog [data-value="25-34"]');
    await page.click('#profile-dialog [data-profile-field="skin_type"][data-value="oily"]');
    await page.click('#profile-dialog [data-profile-field="skin_tone"][data-value="deep"]');
    assert.equal(await page.locator('#profile-dialog [data-profile-field="concerns"]').count(), 0, 'concerns hidden until health consent');
    await page.check('#profile-dialog [data-profile-check="consent_health"]');
    await page.click('#profile-dialog [data-profile-field="concerns"][data-value="acne"]');
    await page.click('#profile-dialog [data-profile-save]');
    await page.waitForSelector('#profile-dialog:not([open])', {state: 'attached'});
    const sent = profiles.at(-1);
    assert.deepEqual([sent.age_band, sent.skin_type, sent.skin_tone, sent.concerns, sent.consent_b2b], ['25-34', 'oily', 'deep', ['acne'], false]);
    await page.waitForSelector('#saved .profile-card >> text=25');
    await page.click('#saved [data-screen="settings"]');
    await page.click('#settings [data-set="do-not-sell"]');
    await page.waitForFunction(n => document.querySelector('#toast')?.classList.contains('show'), null);
    assert.equal(profiles.at(-1).opt_out_sale, true);
    assert.equal(profiles.at(-1).consent_b2b, false);
  });
  await step('community: topic posts, post detail with comment card carrying clickref', async () => {
    await page.click('#tabbar [data-screen="chat"]');
    await page.click('#chat .room-row[data-chat-room="acne"]');
    await page.waitForSelector('#post-list .post-row');
    await page.click('#post-list [data-post="7"]');
    await page.waitForSelector('.comment .chat-item');
    await page.click('.comment .chat-item');
    await page.waitForSelector('#family-dialog[open] .variant-buy');
    assert.equal(new URL(await page.getAttribute('#family-body .variant-buy', 'href')).searchParams.get('clickref'), 'comment-3');
    await page.waitForSelector('#family-talk .post-row');
    await page.click('#family-talk [data-review-similar]');
    assert.equal(await page.locator('#family-talk .post-row').count() >= 1, true, 'the deep / oily review matches the saved profile');
    await page.click('#family-dialog .close-dialog');
    await page.fill('#comment-text', 'Thanks!');
    await page.click('#comment-form .chat-send');
    await page.waitForSelector('.comment >> text=Thanks!');
  });
  await step('review detail shows writer facts apart from the buy button', async () => {
    await page.click('[data-chat-action="topic"]');
    await page.click('#post-list [data-post="8"]');
    await page.waitForSelector('.review-facts');
    await page.waitForSelector('.buyer-info');
  });
  await step('live chat: send, then block hides the author', async () => {
    await page.click('[data-chat-action="topic"]');
    await page.click('[data-topic-mode="live"]');
    await page.waitForSelector('.chat-msg >> text=Anyone tried snail?');
    await page.fill('#chat-text', 'Yes, it is light');
    await page.click('#chat-form .chat-send');
    await page.waitForSelector('.chat-msg >> text=Yes, it is light');
    await page.click('[data-chat-menu="11"]');
    await page.click('[data-chat-action="block"]');
    assert.equal(await page.locator('.chat-msg >> text=Anyone tried snail?').count(), 0);
    await page.click('#tabbar [data-screen="saved"]');
    await page.waitForSelector('#saved:not([hidden])');
  });
  assert.deepEqual(errors, [], 'no JavaScript errors: ' + errors.join(' | '));
  assert.ok(!calls.includes('request_tracking'), 'no price-tracking RPC');
  console.log('offline e2e passed');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
