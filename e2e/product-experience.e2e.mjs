// All outside requests are fixtures; no user reviews or production writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const origin = new URL(process.argv[2] || 'http://127.0.0.1:3000/').origin;
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH, args:['--no-sandbox']});
try {
 for (const language of ['en','ko']) {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  const room = {id:'fixture-room',service_region:'us',title_en:'Fixture room',title_ko:'테스트 방',kind:'topic',sort:1};
  const review = {id:1,room_id:room.id,kind:'review',title:'Existing review',nickname:'QA',body:'Fixture only',photos:[],comments:0,created_at:new Date().toISOString(),skin_type:'dry'};
  const errors = [];
  let empty = false, failure = false;
  await context.route('**/*', route => {
   const url = new URL(route.request().url());
   if (url.origin === origin) return route.continue();
   const resource = url.pathname.split('/').at(-1);
   if (resource === 'app_events') return route.fulfill({status:204});
   if (resource === 'chat_room_list') return route.fulfill({json:[room]});
   if (resource === 'product_mentions') return failure ? route.fulfill({status:503,json:{message:'unavailable'}}) : route.fulfill({json:empty ? [] : [{source:'review',source_id:1,post_id:1,room_id:room.id}]});
   if (resource === 'community_posts') return route.fulfill({json:empty ? [] : [review]});
   return route.fulfill({json:[]});
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/us?lang=' + language + '&demo=0');
  await page.evaluate(async () => {
   const box = document.createElement('div'); box.id = 'fixture-product-talk'; document.body.append(box);
   const {renderProductTalk} = await import('/chat.js');
   await renderProductTalk(box, 'fixture-family');
  });
  const box = page.locator('#fixture-product-talk');
  assert.equal(await box.locator('.experience-discovery').count(), 1, 'discovery renders alongside populated reviews');
  assert.equal(await box.locator('[data-post="1"]').count(), 1, 'the original review is retained');
  if (language === 'en') assert.doesNotMatch(await box.locator('.experience-discovery').innerText(), /[가-힣]/);
  await box.locator('[data-experience-status="current"]').click();
  await box.locator('[data-experience-topic="texture"]').click();
  assert.equal(await box.locator('[data-post="1"]').count(), 1, 'choices never block review access');
  assert.equal(await box.locator('[data-experience-topic="texture"]').getAttribute('aria-pressed'), 'true');
  empty = true;
  await page.evaluate(async () => (await import('/chat.js')).renderProductTalk(document.querySelector('#fixture-product-talk'), 'fixture-empty'));
  assert.equal(await box.locator('.experience-discovery').count(), 1, 'empty reviews still offer optional choices');
  assert.equal(await box.locator('[data-experience-topic]').count(), 0, 'product choices do not leak to another product');
  failure = true;
  await page.evaluate(async () => (await import('/chat.js')).renderProductTalk(document.querySelector('#fixture-product-talk'), 'fixture-failure'));
  assert.equal(await box.innerText(), '', 'review fetch failure does not fabricate reviews');
  assert.deepEqual(errors, []);
  console.log(`ok - product discovery ${language}: nonempty/empty/failure, existing reviews, choices, product isolation`);
  await context.close();
 }
} finally {await browser.close();}
