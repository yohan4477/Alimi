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
  // Concerns of both fields appear on the same screen as the fields.
  assert.equal(await guide.locator('[data-onb-concern]').count(),8);
  await guide.locator('[data-onb-concern="dry"]').click();
  await guide.locator('[data-onb-concern="cushion"]').click();
  // Back from the recommendations keeps choices.
  await guide.locator('[data-onb="next"]').click();await guide.locator('[data-onb="back"]').click();
  assert.equal(await guide.locator('[data-onb-concern="dry"]').getAttribute('aria-pressed'),'true');
  await guide.locator('[data-onb="next"]').click();
  assert.equal(await guide.locator('[role="progressbar"]').getAttribute('aria-valuenow'),'2');
  const recs=await guide.locator('[data-chat-room]').evaluateAll(l=>l.map(b=>b.dataset.chatRoom));
  assert.ok(recs.includes('dry-sensitive')&&recs.includes('makeup'),'skin and makeup rooms recommended together: '+recs);
  assert.equal(await guide.locator('[data-chat-action="create-room"]').count(),0,'no create button before the server supports it');
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
  assert.equal(await guide.locator('[data-onb-concern="cushion"]').count(),0,'deselected field hides its concerns');
  await guide.locator('[data-onb="next"]').click();
  const skinOnly=await guide.locator('[data-chat-room]').evaluateAll(l=>l.map(b=>b.dataset.chatRoom));
  assert.ok(!skinOnly.includes('makeup'),'makeup room gone after deselecting makeup: '+skinOnly);
  await guide.locator('[data-onb="finish"]').click();
  // Skip on a fresh device leaves the community untouched.
  await page.evaluate(()=>localStorage.removeItem('seoulbeauty-interests-v1'));await page.reload();
  await guide.locator('[data-onb="skip"]').click();
  assert.equal(await guide.innerHTML(),'');
  assert.ok(await page.locator('[data-chat-room][data-live]').count()>0,'home still lists active rooms');
  assert.deepEqual(writes,[],'guide sends nothing to the server');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 // Free room creation from the guide's last step: duplicate name error, then success opens the new room.
 {
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],created=[];
  page.on('pageerror',e=>errors.push(e.message));
  const list=rooms.map(r=>({...r,concerns:[]})); // server with the user_rooms migration
  await page.route('**/rest/v1/**',async route=>{
   const u=new URL(route.request().url()),resource=u.pathname.split('/').at(-1);
   if(resource==='chat_room_list')return route.fulfill({json:list});
   if(resource==='create_room'){const body=JSON.parse(route.request().postData());created.push(body);
    if(body.p_title==='acne room')return route.fulfill({status:400,json:{message:'chat:duplicate'}});
    list.push(room('u-new123','makeup',100,{title_en:body.p_title,title_ko:body.p_title,intro_ko:body.p_intro,intro_en:body.p_intro,concerns:body.p_concerns,user_created:true}));return route.fulfill({json:'u-new123'});}
   if(resource==='join_chat')return route.fulfill({json:'Dewy Otter'});
   if(resource==='app_events')return route.fulfill({status:204});
   return route.fulfill({json:[]});
  });
  await page.goto(base+'?lang=ko');
  const guide=page.locator('#onboard-guide');
  await guide.locator('[data-onb-group="makeup"]').click();
  await guide.locator('[data-onb-concern="lip"]').click();await guide.locator('[data-onb="next"]').click();
  await guide.locator('[data-chat-action="create-room"]').click();
  const dlg=page.locator('#room-create');
  assert.equal(await dlg.locator('[data-room-tag="makeup"]').getAttribute('aria-pressed'),'true','field prefilled from the guide');
  assert.equal(await dlg.locator('[data-room-concern="lip"]').getAttribute('aria-pressed'),'true','concern prefilled from the guide');
  assert.equal(await dlg.locator('[data-room-concern="acne"]').count(),0,'only makeup concerns for a makeup room');
  await dlg.locator('[data-chat-action="room-submit"]').click();
  assert.match(await dlg.locator('#room-error').innerText(),/3자 이상/);
  await dlg.locator('#room-title').fill('acne room');await dlg.locator('[data-chat-action="room-submit"]').click();
  await page.waitForFunction(()=>/이미 있어요/.test(document.querySelector('#room-error')?.textContent));
  assert.equal(await dlg.locator('#room-title').inputValue(),'acne room','typed text survives an error');
  await dlg.locator('#room-title').fill('웜톤 립 추천');await dlg.locator('#room-intro').fill('웜톤에 맞는 틴트');
  await dlg.locator('[data-chat-action="room-submit"]').click();
  await page.locator('#chat-join, #topic-body').first().waitFor();
  if(await page.locator('#chat-join').isVisible())await page.locator('[data-chat-action="join-ok"]').click();
  await page.waitForFunction(()=>/웜톤 립 추천/.test(document.querySelector('#chat')?.textContent));
  assert.deepEqual(created.at(-1),{p_secret:created.at(-1).p_secret,p_title:'웜톤 립 추천',p_intro:'웜톤에 맞는 틴트',p_tag:'makeup',p_concerns:['lip']});
  // The "start a conversation" sheet offers the same path.
  await page.locator('#tabbar [data-screen="chat"]').click();
  await page.locator('[data-chat-action="find-topic"]').first().click();
  assert.equal(await page.locator('#chat-start [data-chat-action="create-room"]').count(),1);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('ok - onboarding guide: both fields, concerns, matched rooms, persistence, edit, skip, 320/390px, ko/en, no writes; room creation errors and success');
} finally { await browser.close(); }
