// Browser integration only: every backend request is intercepted; never publishes live content.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const origin = new URL(process.argv[2] || 'http://127.0.0.1:3000/').origin;
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH, args:['--no-sandbox']});
const key = 'seoulbeauty-game-draft-v1';
const id = '340c78fa-03ca-42f2-857e-f8b70a1a4654';
try {
 for (const [region, language] of [['us','en'],['kr','ko']]) {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  const room = {id:'tint',service_region:region,title_en:'Tint talk',title_ko:'틴트 이야기',intro_en:'Tint experiences',intro_ko:'틴트 경험',kind:'topic',sort:1,members:2,messages_24h:0};
  const posts = [], events = [], writes = [], errors = [];
  let fail = true;
  await context.addInitScript(() => {
   localStorage.setItem('seoulbeauty-interests-v1',JSON.stringify({version:1,skincare:false,makeup:false,concerns:[],done:true}));
   localStorage.setItem('alimi-chat-agreed','1');
  });
  await context.route('**/*', async route => {
   const request = route.request(), url = new URL(request.url());
   if (url.origin === origin) return route.continue();
   // No outside request can escape, including unexpected Supabase endpoints or auth.
   if (!url.pathname.startsWith('/rest/v1/')) return route.fulfill({status:200,json:[]});
   const resource = url.pathname.split('/').at(-1);
   if (resource === 'app_events') { events.push(request.postDataJSON()); return route.fulfill({status:204}); }
   if (resource === 'chat_room_list') return route.fulfill({json:[room]});
   if (resource === 'community_posts') return route.fulfill({json:posts.filter(p => !url.searchParams.has('id') || url.searchParams.get('id') === 'eq.' + p.id)});
   if (resource === 'create_post') {
    const payload = request.postDataJSON(); writes.push(payload);
    if (fail) return route.fulfill({status:503,json:{message:'unavailable'}});
    const post = {id:9001,room_id:room.id,author_tag:'fixture-author',nickname:'QA fixture',kind:payload.p_kind,title:payload.p_title,body:payload.p_body,item:null,reasons:[],photos:[],comments:0,likes:0,created_at:new Date().toISOString(),last_activity_at:new Date().toISOString()};
    posts.push(post); return route.fulfill({json:post});
   }
   return route.fulfill({json:[]});
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/' + region + '?lang=' + language + '&demo=0');
  await page.evaluate(({key,id,region,language}) => sessionStorage.setItem(key,JSON.stringify({id,region,language,body:'My private tint draft <script>alert(1)</script>',createdAt:Date.now()})),{key,id,region,language});
  const handoffURL = origin + '/' + region + '?lang=' + language + '&beautyDraft=' + id + '&demo=0';
  await page.goto(handoffURL);
  await page.locator('[data-chat-action="beauty-draft-choose"]').waitFor();
  assert.equal(writes.length,0,'arriving with a private draft must never publish');
  assert.match(await page.locator('.beauty-draft-text').innerText(),/<script>/,'private text renders as text');
  const copied = await context.newPage(); await copied.goto(handoffURL);
  await copied.locator('#beauty-draft-arrival').waitFor();
  assert.equal(await copied.locator('.beauty-draft-text').count(),0,'a copied URL does not carry private text');
  assert.equal(await copied.locator('[data-chat-action="beauty-draft-choose"]').count(),0);
  await copied.close();
  await page.locator('[data-chat-action="beauty-draft-choose"]').click();
  await page.locator('[data-beauty-draft-room="tint"]').click();
  await page.locator('#post-write[open]').waitFor();
  assert.equal(writes.length,0,'choosing a room only opens the editor');
  await page.fill('#write-title','Explicitly published fixture');
  await page.fill('#write-body','Edited public text');
  await page.locator('[data-chat-action="write-submit"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-chat-action="write-submit"]').disabled);
  assert.equal(writes.length,1); assert.equal(posts.length,0);
  assert.equal(await page.locator('#write-body').inputValue(),'Edited public text');
  assert.equal(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).body,key),'Edited public text');
  assert.equal(events.filter(e => e.name === 'beauty_post_published').length,0,'failed submission is not a publication');
  // A full reload, not just an in-memory reopening, preserves unsent edits.
  await page.reload(); await page.locator('[data-chat-action="beauty-draft-choose"]').click();
  await page.locator('[data-beauty-draft-room="tint"]').click();
  await page.locator('#post-write[open]').waitFor();
  assert.equal(await page.locator('#write-title').inputValue(),'Explicitly published fixture');
  assert.equal(await page.locator('#write-body').inputValue(),'Edited public text');
  fail = false;
  await page.locator('[data-chat-action="write-submit"]').click();
  await page.locator('#post-view .post-body').waitFor();
  assert.equal(await page.locator('#post-view .post-body').innerText(),'Edited public text');
  assert.equal(writes.length,2); assert.equal(posts.length,1);
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key),key),null,'clear only after successful publication');
  await page.waitForFunction(() => !document.querySelector('#post-write').open);
  assert.equal(events.filter(e => e.name === 'beauty_post_published').length,1);
  // Fetch the stored fixture again after a fresh document load, through the real public reader.
  await page.goto(origin + '/' + region + '?lang=' + language + '&demo=0&room=tint');
  await page.locator('[data-topic-mode="posts"]').click();
  await page.locator('[data-post="9001"]').first().click();
  await page.locator('#post-view .post-body').waitFor();
  assert.equal(await page.locator('#post-view .post-body').innerText(),'Edited public text');
  assert.equal(writes.length,2,'reading a published post never resubmits it');
  assert.ok(events.every(e => !JSON.stringify(e).includes('Edited public text') && !JSON.stringify(e).includes('My private tint')),'analytics contain no draft text');
  assert.deepEqual(errors,[]);
  console.log(`ok - ${region}/${language}: explicit publish, failure/reload retention, copied-link privacy, persisted fixture read, analytics boundaries`);
  await context.close();
 }
} finally { await browser.close(); }
