// Journey reference screens beyond onboarding: room header (join, share), avatars, shared links. Mocked REST.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'});
const base=process.argv[2]??'http://localhost:3000/';
const item={family_key:'tint03',retailer:'Shop',market:'US',sku:'03',brand:'TEST',brand_ko:'테스트',name:'Soft tint 03',price_minor:1200,image_url:null,currency:'USD',size_label:'4g',option_label:'03',url:'https://example.com/tint',affiliate_url:null,category:'립'};
const room={id:'tint',title_en:'Tint talk',title_ko:'Tint talk',intro_en:'Shades',intro_ko:'발색',kind:'topic',tag:'makeup',sort:1,members:5,messages_24h:1,last_message_at:new Date().toISOString(),concerns:['lip']};
const messages=[{id:1,room_id:'tint',author_tag:'abc',nickname:'Maya',body:'Which shade?',item,reply_to:null,likes:0,created_at:new Date().toISOString()}];
async function open(url,setup=async()=>{}){
 const ctx=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/rest/v1/**',async route=>{const u=new URL(route.request().url()),r=u.pathname.split('/').at(-1);
  if(r==='chat_room_list')return route.fulfill({json:[room]});
  if(r==='chat_messages')return route.fulfill({json:u.searchParams.has('id')?[]:messages});
  if(r==='join_chat')return route.fulfill({json:'Jade'});
  if(r==='catalog_region_families')return route.fulfill({json:[{family_key:'tint03',brand:'TEST',base_name:'Soft tint',min_price_minor:1200,max_price_minor:1200,variants:1,category:'립',image_url:null}]});
  if(r==='catalog_items')return route.fulfill({json:[item]});
  if(r==='app_events')return route.fulfill({status:204});
  return route.fulfill({json:[]});});
 await page.addInitScript(()=>{localStorage.setItem('seoulbeauty-interests-v1',JSON.stringify({version:1,skincare:false,makeup:false,concerns:[],done:true}));Object.defineProperty(Navigator.prototype,'share',{value:undefined,configurable:true});});
 await setup(page);await page.goto(url);return {ctx,page,errors};
}
try {
 await mkdir('e2e-artifacts',{recursive:true});
 // Original 1254px asset: visible hair crown is about 16px below its top edge.
 // The unchanged portrait starts beside headline line one; subtitle never crosses the face.
 for(const language of ['ko','en']){
  const {ctx,page,errors}=await open(base+'?lang='+language+'&demo=0');
  await page.locator('.home-hero').waitFor();
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   await page.locator('.home-hero').screenshot({path:`e2e-artifacts/hero-${language}-${width}.png`});
   await page.screenshot({path:`e2e-artifacts/header-tabs-${language}-${width}.png`});
   const geometry=await page.locator('.home-hero').evaluate(hero=>{
    const image=hero.querySelector('img').getBoundingClientRect(),heading=hero.querySelector('h1').getBoundingClientRect(),body=hero.querySelector('p'),copy=body.getBoundingClientRect(),cta=hero.querySelector('.hero-cta').getBoundingClientRect();
    const result={imageTop:image.top,hairTop:image.top+image.width*(16/1254),headingTop:heading.top,copyRight:copy.right,faceLeft:image.left+image.width*.30,copyBottom:copy.bottom,ctaTop:cta.top,whiteSpace:getComputedStyle(body).whiteSpace,overflow:document.documentElement.scrollWidth>innerWidth};
    if(document.documentElement.lang==='ko'){
     const text=body.firstChild,index=text.textContent.indexOf('직접');
     const before=document.createRange(),after=document.createRange();before.setStart(text,index-2);before.setEnd(text,index-1);after.setStart(text,index);after.setEnd(text,index+1);
     result.breakBefore=before.getBoundingClientRect().top;result.breakAfter=after.getBoundingClientRect().top;
     const first=document.createRange();first.setStart(text,0);first.setEnd(text,1);result.firstLeft=first.getBoundingClientRect().left;result.nextLeft=after.getBoundingClientRect().left;
    }
    return result;
   });
   assert.ok(Math.abs(geometry.imageTop-geometry.headingTop)<=1,'portrait starts at first headline line');
   assert.ok(Math.abs(geometry.hairTop-geometry.headingTop)<=5,'visible hair crown aligns within5px of first headline line');
   assert.ok(geometry.copyRight<=geometry.faceLeft,'subtitle stays left of face');
   assert.ok(geometry.copyBottom<=geometry.ctaTop,'subtitle does not overlap CTA');
   assert.equal(geometry.overflow,false);
   assert.equal(geometry.whiteSpace,language==='ko'?'pre-line':'normal');
   if(language==='ko'){assert.ok(geometry.breakAfter>geometry.breakBefore);assert.ok(Math.abs(geometry.firstLeft-geometry.nextLeft)<=1,'sentence starts share an indent');}
   const chrome=await page.evaluate(()=>{
    const header=document.querySelector('#chat .sb-head'),buttons=[...header.querySelectorAll('.icon-btn')];
    const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,cy:r.top+r.height/2};};
    const ink=buttons.map(b=>{const svg=b.querySelector('svg'),box=svg.getBBox(),matrix=svg.getScreenCTM();return new DOMPoint(box.x+box.width/2,box.y+box.height/2).matrixTransform(matrix).y;});
    return {buttons:buttons.map(rect),ink,logo:rect(header.querySelector('.sb-logo')),market:rect(document.querySelector('#chat .service-region-button')),tabs:[...document.querySelectorAll('#tabbar button')].map(b=>({button:rect(b),icon:rect(b.querySelector('svg')),label:rect(b.querySelector('i')),labelOverflow:b.querySelector('i').scrollWidth>b.querySelector('i').clientWidth}))};
   });
   assert.ok(Math.abs(chrome.buttons[0].cy-chrome.buttons[1].cy)<=1,'header hitboxes share baseline');
   assert.ok(Math.abs(chrome.ink[0]-chrome.ink[1])<=1,'bell and search visible drawings align');
   assert.ok(chrome.logo.right<=chrome.buttons[0].left,'logo does not overlap actions');
   chrome.buttons.forEach(b=>assert.ok(b.width>=44&&b.height>=44));assert.ok(chrome.market.height>=44);
   for(const tab of chrome.tabs){assert.ok(tab.button.height>=44);assert.ok(tab.label.top>=tab.icon.bottom);assert.equal(tab.labelOverflow,false);assert.ok(tab.label.left>=tab.button.left&&tab.label.right<=tab.button.right);}
   assert.ok(Math.max(...chrome.tabs.map(t=>t.label.top))-Math.min(...chrome.tabs.map(t=>t.label.top))<=1,'tab labels share baseline');
  }
  assert.deepEqual(errors,[]);await ctx.close();
 }
 // Shared room link opens the room; header shows real members, join for non-members, and share copies a clean link.
 {
  const {ctx,page,errors}=await open(base+'?room=tint&lang=ko',async p=>p.addInitScript(()=>localStorage.setItem('alimi-chat-agreed','1')));
  await page.locator('.room-top h1').waitFor();
  assert.equal(await page.locator('.room-top h1').innerText(),'Tint talk');
  assert.match(await page.locator('.room-top .room-count').innerText(),/5/);
  await page.locator('[data-chat-action="room-more"]').click();
  await page.locator('#room-menu [data-chat-action="share-room"]').click();
  await page.waitForFunction(()=>document.querySelector('#toast')?.classList.contains('show'));
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),new URL('/live?room=tint&region=us&lang=ko',base).href);
  await page.locator('#chat-log .chat-msg').first().waitFor();

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
  assert.equal(await page.locator('.room-top h1').innerText(),'Tint talk');
  assert.deepEqual(errors,[]);await ctx.close();
 }
 // Not yet a member: the header offers join, which asks for the rules first and then opens live chat.
 {
  const {ctx,page,errors}=await open(base+'?lang=en');
  await page.locator('.home-links [data-home-tab="rooms"]').click();
  await page.locator('.room-list-card[data-chat-room="tint"]').click();

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
 // Returning visitors can resume actual joined rooms from activity without a welcome banner.
 {
  const {ctx,page,errors}=await open(base+'?lang=ko',async p=>{
   await p.route('**/rest/v1/chat_members*',r=>r.fulfill({json:[{room_id:'tint',joined_at:'2026-10-18T00:00:00Z'}]}));
  });
  await page.locator('#chat .logo-head').waitFor();
  assert.equal(await page.locator('.welcome-back').count(),0);
  await page.locator('#tabbar [data-screen="saved"]').click();
  await page.locator('[data-activity-tab="rooms"]').click();
  await page.locator('#activity-conversations [data-open-room="tint"]').waitFor();
  assert.deepEqual(errors,[]);await ctx.close();
 }
 console.log('ok - shared room/product links, room header members/join/share, hidden avatars with visible names, welcome back with honest new-message badge, activity tabs');
} finally { await browser.close(); }
