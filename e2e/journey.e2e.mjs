// Journey reference screens beyond onboarding: room header (join, share), avatars, shared links. Mocked REST.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH,args:['--no-sandbox']} : {channel:'chrome'});
const base=process.argv[2]??'http://localhost:3000/';
const item={family_key:'tint03',retailer:'Shop',market:'US',sku:'03',brand:'TEST',brand_ko:'테스트',name:'Soft tint 03',price_minor:1200,image_url:null,currency:'USD',size_label:'4g',option_label:'03',url:'https://example.com/tint',affiliate_url:null,category:'립'};
const room={id:'tint',title_en:'Tint talk',title_ko:'틴트 이야기',intro_en:'Shades',intro_ko:'발색',kind:'topic',tag:'makeup',sort:1,members:5,messages_24h:1,last_message_at:new Date().toISOString(),concerns:['lip']};
const messages=[{id:1,room_id:'tint',author_tag:'abc',nickname:'Maya',body:'Which shade?',item,reply_to:null,likes:0,created_at:new Date().toISOString()}];
async function open(url,setup=async()=>{}){
 const ctx=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/rest/v1/**',async route=>{const u=new URL(route.request().url()),r=u.pathname.split('/').at(-1);
  if(r==='chat_room_list')return route.fulfill({json:[room]});
  if(r==='chat_messages')return route.fulfill({json:u.searchParams.has('id')?[]:messages});
  if(r==='join_chat')return route.fulfill({json:'Jade'});
  if(r==='catalog_families')return route.fulfill({json:[{family_key:'tint03',brand:'TEST',base_name:'Soft tint',min_price_minor:1200,max_price_minor:1200,variants:1,category:'립',image_url:null}]});
  if(r==='catalog_items')return route.fulfill({json:[item]});
  if(r==='app_events')return route.fulfill({status:204});
  return route.fulfill({json:[]});});
 await page.addInitScript(()=>{localStorage.setItem('seoulbeauty-interests-v1',JSON.stringify({version:1,skincare:false,makeup:false,concerns:[],done:true}));Object.defineProperty(Navigator.prototype,'share',{value:undefined,configurable:true});});
 await setup(page);await page.goto(url);return {ctx,page,errors};
}
try {
 // Shared room link opens the room; header shows real members, join for non-members, and share copies a clean link.
 {
  const {ctx,page,errors}=await open(base+'?room=tint&lang=ko',async p=>p.addInitScript(()=>localStorage.setItem('alimi-chat-agreed','1')));
  await page.locator('.room-top h1').waitFor();
  assert.equal(await page.locator('.room-top h1').innerText(),'틴트 이야기');
  assert.match(await page.locator('.room-top small').innerText(),/5/);
  await page.locator('[data-chat-action="room-more"]').click();
  await page.locator('[data-chat-action="share-room"]').click();
  await page.waitForFunction(()=>document.querySelector('#toast')?.classList.contains('show'));
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),new URL('?room=tint',base).href);
  await page.locator('#chat-log .chat-msg').first().waitFor();
  await page.locator('#join-live').click();
  await page.locator('#chat-text').waitFor();
  assert.equal(await page.locator('#room-join').count(),0,'join button gone once joined');
  assert.equal(await page.locator('.msg-avatar').count(),0);
  assert.equal(await page.locator('.chat-nick').first().innerText(),'Maya');
  await page.locator('#chat-log [data-family="tint03"]').first().click();
  await page.locator('[data-family-brand="TEST"]').click();
  await page.locator('#brand [data-family="tint03"]').first().click();
  await page.locator('[data-family-attach]').click();
  assert.equal(await page.locator('#chat').isVisible(),true,'return to original chat');
  assert.match(await page.locator('#chat-context').innerText(),/Soft tint/);
  assert.equal(await page.locator('.room-top h1').innerText(),'틴트 이야기');
  assert.deepEqual(errors,[]);await ctx.close();
 }
 // Not yet a member: the header offers join, which asks for the rules first and then opens live chat.
 {
  const {ctx,page,errors}=await open(base+'?lang=en');
  await page.locator('[data-home-tab="rooms"][role="tab"]').click();
  await page.locator('.room-list-card[data-chat-room="tint"]').click();
  await page.locator('#room-join').click();
  await page.locator('[data-chat-action="join-ok"]').click();
  await page.locator('#chat-text').waitFor();
  await page.locator('#chat-log .chat-msg').first().waitFor();
  assert.equal(await page.locator('#room-join').count(),0);
  assert.deepEqual(errors,[]);await ctx.close();
 }
 // Shared product link opens the product sheet with share and no attach (no room open).
 {
  const {ctx,page,errors}=await open(base+'?product=tint03&lang=ko');
  await page.locator('#family-dialog[open] [data-family-share]').waitFor();
  assert.equal(await page.locator('#family-dialog .family-attach').count(),0);
  assert.deepEqual(errors,[]);await ctx.close();
 }
 // Returning visitor: welcome block with joined rooms; "new" only for activity after the last visit.
 {
  const {ctx,page,errors}=await open(base+'?lang=ko',async p=>{
   await p.route('**/rest/v1/chat_members*',r=>r.fulfill({json:[{room_id:'tint',joined_at:'2026-10-18T00:00:00Z'}]}));
   await p.addInitScript(()=>localStorage.setItem('seoulbeauty-seen-v1',JSON.stringify({tint:'2000-01-01T00:00:00Z'})));
  });
  await page.locator('.welcome-back').waitFor();
  await page.locator('.joined-card[data-chat-room="tint"] .count-badge').waitFor();
  assert.equal(await page.locator('.joined-card[data-chat-room="tint"] .count-badge').innerText(),'1');
  // Reading the room records it as seen; back home the count is gone.
  await page.locator('.joined-card[data-chat-room="tint"]').first().click();
  await page.locator('#chat-log .chat-msg').first().waitFor();
  await page.locator('[data-chat-action="rooms"]').first().click();
  await page.locator('.welcome-back').waitFor();
  assert.equal(await page.locator('.count-badge').count(),0);
  // My activity: saved products and joined rooms as tabs.
  await page.locator('#tabbar [data-screen="saved"]').click();
  assert.equal(await page.locator('[data-activity-tab="saved"]').getAttribute('aria-selected'),'true');
  await page.locator('[data-activity-tab="rooms"]').click();
  await page.locator('#activity-conversations [data-open-room="tint"]').waitFor();
  assert.deepEqual(errors,[]);await ctx.close();
 }
 console.log('ok - shared room/product links, room header members/join/share, hidden avatars with visible names, welcome back with honest new-message badge, activity tabs');
} finally { await browser.close(); }
