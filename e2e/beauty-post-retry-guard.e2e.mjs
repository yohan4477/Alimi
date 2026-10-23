// Fixture-only interruption checks. No request can reach a live backend.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const origin = new URL(process.argv[2] || 'http://127.0.0.1:3000/').origin;
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH, args:['--no-sandbox']});
const key = 'seoulbeauty-game-draft-v1', id = '340c78fa-03ca-42f2-857e-f8b70a1a4654';
try {
 for (const outcome of ['lost-response','server-error','storage-error']) {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  const room = {id:'tint',service_region:'us',title_en:'Tint talk',title_ko:'틴트 이야기',kind:'topic',sort:1,members:2};
  const writes = [], posts = [], errors = [];
  await context.addInitScript(({outcome}) => {
   localStorage.setItem('seoulbeauty-interests-v1',JSON.stringify({version:1,skincare:false,makeup:false,concerns:[],done:true}));
   localStorage.setItem('alimi-chat-agreed','1');
   if (outcome === 'storage-error') {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {if(key.startsWith('seoulbeauty-post-pending:'))throw new DOMException('Fixture storage blocked','QuotaExceededError');return set.call(this,key,value);};
   }
  },{outcome});
  await context.route('**/*', route => {
   const request = route.request(), url = new URL(request.url());
   if (url.origin === origin) return route.continue();
   const resource = url.pathname.split('/').at(-1);
   if (resource === 'app_events') return route.fulfill({status:204});
   if (resource === 'chat_room_list') return route.fulfill({json:[room]});
   if (resource === 'community_posts') return route.fulfill({json:posts});
   if (resource === 'create_post') {
    const payload=request.postDataJSON();writes.push(payload);
    if(outcome==='server-error')return route.fulfill({status:503,json:{message:'unavailable'}});
    const post={id:9001,room_id:room.id,author_tag:'fixture',nickname:'QA',kind:payload.p_kind,title:payload.p_title,body:payload.p_body,item:null,reasons:[],photos:[],comments:0,likes:0,created_at:new Date().toISOString(),last_activity_at:new Date().toISOString()};
    posts.push(post);
    return route.abort('connectionreset'); // Simulated commit with its acknowledgement lost.
   }
   return route.fulfill({json:[]});
  });
  const page=await context.newPage();page.on('pageerror', e=>errors.push(e.message));
  await page.goto(origin+'/us?lang=en&demo=0');
  await page.evaluate(({key,id})=>sessionStorage.setItem(key,JSON.stringify({id,region:'us',language:'en',body:'Preserved draft fixture',title:'Fixture',createdAt:Date.now()})),{key,id});
  await page.goto(origin+'/us?lang=en&demo=0&beautyDraft='+id);
  const openComposer=async()=>{
   await page.locator('[data-chat-action="beauty-draft-choose"]').click();
   await page.locator('[data-beauty-draft-room="tint"]').click();
   await page.locator('#post-write[open]').waitFor();
  };
  await openComposer();
  await page.locator('[data-chat-action="write-submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-chat-action="write-submit"]').disabled);
  assert.equal(writes.length,outcome==='storage-error'?0:1);
  assert.equal(posts.length,outcome==='lost-response'?1:0);
  assert.equal(await page.locator('#write-body').inputValue(),'Preserved draft fixture');
  await page.reload();await openComposer();
  assert.equal(await page.locator('#write-body').inputValue(),'Preserved draft fixture');
  await page.locator('[data-chat-action="write-submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-chat-action="write-submit"]').disabled);
  assert.equal(writes.length,outcome==='storage-error'?0:1,'reload must not repeat an uncertain or untrackable submission');
  assert.equal(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).body,key),'Preserved draft fixture');
  assert.deepEqual(errors,[]);
  console.log(`ok - ${outcome}: no unsafe retry, no duplicate fixture post, draft survives reload`);
  await context.close();
 }
} finally {await browser.close();}
