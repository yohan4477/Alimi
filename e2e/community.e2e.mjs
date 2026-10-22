// A deterministic UI flow in both supported languages; no production writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH,args:['--no-sandbox']} : {channel:'chrome'});
const base=process.argv[2]??'http://localhost:3000/';
try {
 for(const lang of ['en','ko']) {
  const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[];
  await page.addInitScript(()=>localStorage.setItem('seoulbeauty-interests-v1',JSON.stringify({version:1,skincare:false,makeup:false,concerns:[],done:true}))); // returning visitor: no first-visit flow
  page.on('pageerror',e=>errors.push(e.message));
  const item={family_key:'tint03',retailer:'Shop',market:'US',sku:'03',brand:'TEST',brand_ko:'테스트',name:'Soft tint 03',price_minor:1200,image_url:null,currency:'USD',size_label:'4g',option_label:'03',url:'https://example.com/tint',affiliate_url:null};
  const room={id:'tint',title_en:'Tint talk',title_ko:'틴트 이야기',intro_en:'Shades and experiences',intro_ko:'발색 경험을 나눠요',kind:'topic',sort:1,members:2,messages_24h:2,last_message_at:new Date().toISOString()};
  let heartCount=0, joins=0, sends=0;
  const messages=[{id:1,room_id:'tint',author_tag:'other',nickname:'Maya',body:'Which shade works on pigmented lips?',item,reply_to:null,likes:0,created_at:new Date().toISOString()}];
  await page.route('**/rest/v1/**',async route=>{
   const u=new URL(route.request().url()),resource=u.pathname.split('/').at(-1);
   if(resource==='chat_room_list')return route.fulfill({json:[room]});
   if(resource==='chat_messages')return route.fulfill({json:u.searchParams.has('id')?[]:messages});
   if(resource==='like_chat') { heartCount=heartCount?0:1; return route.fulfill({json:heartCount}); }
   if(resource==='join_chat'){joins++;return route.fulfill({json:'Jade'});}
   if(resource==='post_chat'){sends++;if(sends===1)return route.fulfill({status:500,json:{message:'temporary failure'}});const body=route.request().postDataJSON();return route.fulfill({json:{...messages[0],id:2,author_tag:'mine',nickname:'Jade',body:body.p_body,item:null}});}
   if(resource==='catalog_items')return route.fulfill({json:[item]});
   if(resource==='app_events')return route.fulfill({status:204});
   return route.fulfill({json:[]});
  });
  await page.goto(base+'?lang='+lang);
  await page.locator('.hot-row[data-live]').first().waitFor();
  assert.equal(await page.locator('#tabbar button').count(),3);
  assert.equal(await page.locator('#chat').isVisible(),true);
  assert.equal(await page.locator('#browse').isVisible(),false);
  assert.deepEqual(await page.locator('#tabbar button').evaluateAll(bs=>bs.map(b=>b.dataset.screen)),['chat','search','saved']);
  await page.locator('#chat .home-alerts').click();
  await page.locator('#alerts .alert-filters').waitFor();
  await page.locator('#alerts [data-screen="chat"]').click();
  await page.locator('.hot-row[data-live]').first().waitFor();
  // 추천 tab: trending card and recommended room; user-authored text stays verbatim in either UI language.
  assert.ok(await page.locator('.hot-row[data-chat-room="tint"]').count()>=1);
  // 발견 tab: products mentioned in conversations.
  await page.locator('.home-links [data-home-tab="discover"]').click();
  assert.equal(await page.locator('.mentioned-products article').count(),1);
  assert.match(await page.locator('#community-home').innerText(),lang==='en'?/Products in the conversation/:/대화에 나온 제품/);
  await page.locator('.home-sub [data-home-tab="rec"]').click();
  await page.locator('.hot-row[data-live]').first().click();
  // Reading and composing are available without joining.
  await page.locator('#chat-log .chat-item').waitFor();
  assert.equal(await page.locator('#chat-log .msg-body').first().innerText(),messages[0].body);
  assert.equal(await page.locator('#join-live, .room-join').count(),0);
  await page.locator('#chat-text').waitFor();
  const heart=page.locator('[data-chat-like="1"]');
  assert.equal(await heart.getAttribute('aria-pressed'),'false');
  await heart.click();
  await page.waitForFunction(()=>document.querySelector('[data-chat-like="1"]').getAttribute('aria-pressed')==='true');
  assert.equal(await heart.locator('span').innerText(),'1');
  assert.equal(await heart.locator('svg').evaluate(e=>getComputedStyle(e).fill),'rgb(237, 40, 80)');
  await heart.click();
  await page.waitForFunction(()=>document.querySelector('[data-chat-like="1"]').getAttribute('aria-pressed')==='false');
  assert.equal(await heart.locator('span').innerText(),'0');
  assert.equal(await page.locator('.chat-date').count(),1);
  // Journey 3 feed row: ♡ sits in the action row under the message text.
  const edge=await heart.boundingBox(), text=await page.locator('#chat-log .msg-body').first().boundingBox();
  assert.equal(await heart.evaluate(e=>e.parentElement.classList.contains('msg-actions')),true);
  assert.ok(edge.y>=text.y+text.height-1,'heart below the message text');

  await page.locator('#chat-log .chat-item').click();
  await page.locator('#family-dialog[open] #family-price').waitFor();
  assert.equal(await page.locator('.analysis-section').count(),0);
  assert.equal(await page.locator('.target-section').count(),0);
  // Opened from a live room: 대화에 첨부 puts the product into the composer.
  assert.equal(await page.locator('#family-dialog .family-attach').count(),1);
  await page.locator('#family-dialog .family-attach').click();
  assert.equal(await page.locator('#family-dialog').evaluate(d=>d.open),false);
  assert.match(await page.locator('#chat-form').innerText(),/Soft tint 03/);
  assert.equal(await page.locator('#chat-text').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.locator('#chat-log').isVisible(),true);
  assert.equal(await page.locator('#chat-log .chat-msg').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  assert.equal(joins,0,'reading never joins');
  await page.locator('#chat-text').fill('Retry this message');
  await page.locator('#chat-form .chat-send').click();
  await page.waitForFunction(()=>!document.querySelector('#chat-text').disabled);
  assert.equal(await page.locator('#chat-text').inputValue(),'Retry this message','failed send preserves draft');
  await page.locator('#chat-form .chat-send').click();
  await page.waitForFunction(()=>document.querySelector('#chat-text').value==='');
  assert.equal(sends,2);assert.equal(joins,0,'posting does not require a separate join RPC');
  await page.locator('.room-back').click();
  await page.locator('#tabbar [data-screen="saved"]').click();
  await page.locator('[data-activity-tab="rooms"]').click();
  await page.locator('#activity-conversations h2').waitFor({state:'attached'}); // tab label already names the list; heading kept for screen readers
  assert.match(await page.locator('#saved .activity-tabs').getAttribute('aria-label'),lang==='en'?/My activity/:/내 활동/);
  assert.deepEqual(errors,[]);
  console.log('ok - '+lang+' community home, product mentions, original conversation, product sheet return, activity and mobile width');
  await page.close();
 }
} finally {await browser.close()}
