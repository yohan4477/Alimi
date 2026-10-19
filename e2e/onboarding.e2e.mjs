// First-visit community guide: both fields, concerns per field, matching rooms, skip, edit from My activity.
// Mocked REST only; no production writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH,args:['--no-sandbox']} : {channel:'chrome'});
const base=process.argv[2]??'http://localhost:3000/';
const room=(id,tag,sort,extra={})=>({id,title_en:id+' room',title_ko:id+' 방',intro_en:'About '+id,intro_ko:id+' 이야기',kind:'topic',tag,sort,members:1,messages_24h:0,last_message_at:null,...extra});
const rooms=[room('everyone','talk',1,{messages_24h:4,last_message_at:new Date().toISOString()}),room('acne','skin',4),room('dry-sensitive','skin',5),room('makeup','makeup',7),room('routine','skin',8)];
try {
 for(const [lang,width] of [['ko',390],['en',320]]) {
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/**',async route=>{
   const u=new URL(route.request().url()),resource=u.pathname.split('/').at(-1);
   if(route.request().method()!=='GET'&&resource!=='app_events')writes.push(resource); // existing page analytics aside
   if(resource==='chat_room_list')return route.fulfill({json:rooms});
   if(resource==='app_events')return route.fulfill({status:204});
   return route.fulfill({json:[]});
  });
  await page.goto(base+'?lang='+lang);
  const guide=page.locator('#onboard-guide');
  await guide.locator('[data-onb-group="skincare"]').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow at ${width}`);
  // Both fields at once, independently toggled.
  await guide.locator('[data-onb-group="skincare"]').click();
  await guide.locator('[data-onb-group="makeup"]').click();
  assert.equal(await guide.locator('[data-onb-group="skincare"]').getAttribute('aria-pressed'),'true');
  assert.equal(await guide.locator('[data-onb-group="makeup"]').getAttribute('aria-pressed'),'true');
  await guide.locator('[data-onb="next"]').click();
  assert.equal(await guide.locator('[data-onb-concern]').count(),8);
  await guide.locator('[data-onb-concern="dry"]').click();
  await guide.locator('[data-onb-concern="cushion"]').click();
  // Back keeps choices.
  await guide.locator('[data-onb="back"]').click();await guide.locator('[data-onb="next"]').click();
  assert.equal(await guide.locator('[data-onb-concern="dry"]').getAttribute('aria-pressed'),'true');
  await guide.locator('[data-onb="next"]').click();
  const recs=await guide.locator('[data-chat-room]').evaluateAll(l=>l.map(b=>b.dataset.chatRoom));
  assert.ok(recs.includes('dry-sensitive')&&recs.includes('makeup'),'skin and makeup rooms recommended together: '+recs);
  await guide.locator('[data-onb="finish"]').click();
  // Done: compact "for you" list persists across reloads; the guide steps do not come back.
  await guide.locator('[data-onb="edit"]').waitFor();
  await page.reload();await guide.locator('[data-onb="edit"]').waitFor();
  assert.equal(await guide.locator('[data-onb-group]').count(),0);
  // My activity shows the choices and reopens the guide to change them.
  await page.locator('#tabbar [data-screen="saved"]').click();
  assert.match(await page.locator('.interest-row small').innerText(),lang==='ko'?/스킨케어 · 메이크업 · 건조함 · 쿠션 호수/:/Skincare · Makeup · Dryness · Cushion shades/);
  await page.locator('[data-onb-manage]').click();
  await guide.locator('[data-onb-group="makeup"]').click();
  assert.equal(await guide.locator('[data-onb-group="makeup"]').getAttribute('aria-pressed'),'false');
  await guide.locator('[data-onb="next"]').click();
  assert.equal(await guide.locator('[data-onb-concern="cushion"]').count(),0,'deselected field hides its concerns');
  await guide.locator('[data-onb="next"]').click();
  const skinOnly=await guide.locator('[data-chat-room]').evaluateAll(l=>l.map(b=>b.dataset.chatRoom));
  assert.ok(!skinOnly.includes('makeup'),'makeup room gone after deselecting makeup: '+skinOnly);
  await guide.locator('[data-onb="finish"]').click();
  // Skip on a fresh device leaves the community untouched.
  await page.evaluate(()=>localStorage.removeItem('seoulbeauty-interests-v1'));await page.reload();
  await guide.locator('[data-onb="skip"]').click();
  assert.equal(await guide.innerHTML(),'');
  assert.ok(await page.locator('.conversation-row[data-live]').count()>0,'home still lists active rooms');
  assert.deepEqual(writes,[],'guide sends nothing to the server');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('ok - onboarding guide: both fields, concerns, matched rooms, persistence, edit, skip, 320/390px, ko/en, no writes');
} finally { await browser.close(); }
