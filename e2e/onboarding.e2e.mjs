// Journey 1 on the web: splash → interests and concerns (2/3) → matching rooms (3/3) → the room. Edit from My activity,
// skip, persistence, no server writes; then free room creation. Mocked REST only; no production writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH,args:['--no-sandbox']} : {channel:'chrome'});
const base=process.argv[2]??'http://localhost:3000/';
const room=(id,tag,sort,extra={})=>({id,title_en:id+' room',title_ko:id+' 방',intro_en:'About '+id,intro_ko:id+' 이야기',kind:'topic',tag,sort,members:1,messages_24h:0,last_message_at:null,...extra});
const rooms=[room('everyone','talk',1,{messages_24h:4,last_message_at:new Date().toISOString()}),room('acne','skin',4),room('dry-sensitive','skin',5),room('makeup','makeup',7),room('routine','skin',8)];
const KEY='seoulbeauty-interests-v1';
async function open(width,lang,{extra='',setup=async()=>{},list=rooms}={}){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await setup(page);
  await page.route('**/rest/v1/**',async route=>{
   const u=new URL(route.request().url()),resource=u.pathname.split('/').at(-1);
   if(resource==='create_room')return route.fallback(); // handled by the test's own route
   if(route.request().method()!=='GET'&&!['app_events','room_actions'].includes(resource))writes.push(resource); // existing page analytics aside
   if(resource==='chat_room_list')return route.fulfill({json:list});
   if(resource==='app_events')return route.fulfill({status:204});
   return route.fulfill({json:[]});
  });
  await page.goto(base+'?lang='+lang+extra);
  return {page,errors,writes};
}
try {
 for(const [lang,width] of [['ko',390],['en',320]]) {
  const {page,errors,writes}=await open(width,lang,{extra:'&holdSplash'});
  const ob=page.locator('#onboarding');
  await ob.locator('.ob-splash').waitFor();
  assert.match(await ob.innerText(),lang==='ko'?/좋은 일상을 만든다/:/makes good days/);
  await ob.locator('.ob-splash').click();
  // 2/3: both fields at once, every concern of both, independently toggled.
  await ob.locator('[data-onb-group="skincare"]').click();
  await ob.locator('[data-onb-group="makeup"]').click();
  assert.equal(await ob.locator('[data-onb-group="skincare"]').getAttribute('aria-pressed'),'true');
  assert.equal(await ob.locator('[data-onb-concern]').count(),14);
  assert.equal(await ob.locator('.ob-step').getAttribute('aria-valuenow'),'1');
  await ob.locator('[data-onb-concern="dry"]').click();
  await ob.locator('[data-onb-concern="cushion"]').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow at ${width}`);
  // 3/3: matching rooms; back keeps the choices; filters.
  await ob.locator('[data-onb="next"]').click();
  await ob.locator('[data-onb="profile-next"]').click();
  assert.equal(await ob.locator('.ob-step').getAttribute('aria-valuenow'),'3');
  const recs=await ob.locator('[data-onb-room]').evaluateAll(l=>l.map(b=>b.dataset.onbRoom));
  assert.ok(recs.includes('dry-sensitive')&&recs.includes('makeup'),'skin and makeup rooms recommended together: '+recs);
  await ob.locator('[data-onb-filter="skincare"]').click();
  assert.ok(!(await ob.locator('[data-onb-room]').evaluateAll(l=>l.map(b=>b.dataset.onbRoom))).includes('makeup'),'skincare filter leaves out makeup');
  await ob.locator('[data-onb-filter="all"]').click();
  assert.equal(await ob.locator('[data-onb-room]').count(),rooms.length);
  await ob.locator('[data-onb="back"]').click();
  assert.equal(await ob.locator('.ob-step').getAttribute('aria-valuenow'),'2');
  await ob.locator('[data-onb="back"]').click();
  assert.equal(await ob.locator('[data-onb-concern="dry"]').getAttribute('aria-pressed'),'true');
  await ob.locator('[data-onb="next"]').click();
  await ob.locator('[data-onb="profile-next"]').click();
  // Picking a room closes the flow and opens that room (readable, nothing sent).
  await ob.locator('[data-onb-room="dry-sensitive"]').click();
  assert.equal(await ob.isHidden(),true);
  await page.locator('.room-top h1').waitFor();
  assert.match(await page.locator('.room-top h1').innerText(),/dry-sensitive/);
  // Done: the flow does not come back; My activity lists the choices and reopens it at step 2.
  await page.reload();await page.locator('#chat .logo-head').waitFor();
  assert.equal(await ob.isHidden(),true);
  await page.locator('#tabbar [data-screen="saved"]').click();
  assert.match(await page.locator('.interest-row small').innerText(),lang==='ko'?/스킨케어 · 메이크업 · 건조 · 쿠션 호수/:/Skincare · Makeup · Dryness · Cushion shades/);
  await page.locator('#saved [data-onb-manage]').click();
  await ob.locator('[data-onb-group="makeup"]').click();
  assert.equal(await ob.locator('[data-onb-concern="cushion"]').count(),0,'deselected field hides its concerns');
  await ob.locator('[data-onb="next"]').click();
  await ob.locator('[data-onb="profile-next"]').click();
  assert.ok(!(await ob.locator('[data-onb-room]').evaluateAll(l=>l.map(b=>b.dataset.onbRoom))).includes('makeup'),'makeup room gone after deselecting makeup');
  // Skip on a fresh device: back on step 2 closes the flow for good.
  await page.evaluate(k=>localStorage.removeItem(k),KEY);await page.reload();
  await ob.locator('.ob-splash').click();
  await ob.locator('[data-onb="back"]').click();
  assert.equal(await ob.isHidden(),true);
  await page.reload();await page.locator('#chat .logo-head').waitFor();
  assert.equal(await ob.isHidden(),true,'skipped stays skipped');
  assert.deepEqual(writes,[],'onboarding sends nothing to the server');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 // Free room creation from the rooms tab: prefilled from saved interests; duplicate error, then success opens the room.
 {
  const list=rooms.map(r=>({...r,concerns:[]})); // server with the user_rooms migration
  const created=[];
  const {page,errors}=await open(390,'ko',{list,setup:async p=>{
   await p.addInitScript(k=>localStorage.setItem(k,JSON.stringify({version:1,skincare:false,makeup:true,concerns:['lip'],done:true})),KEY);
   await p.route('**/rest/v1/rpc/create_room',route=>{const body=JSON.parse(route.request().postData());created.push(body);
    if(body.p_title==='acne room')return route.fulfill({status:400,json:{message:'chat:duplicate'}});
    list.push(room('u-new123','makeup',100,{title_en:body.p_title,title_ko:body.p_title,intro_ko:body.p_intro,intro_en:body.p_intro,concerns:body.p_concerns,user_created:true}));return route.fulfill({json:'u-new123'});});
  }});
  await page.locator('[data-home-tab="rooms"][role="tab"]').click();
  await page.locator('.start-conversation').click();
  const dlg=page.locator('#room-create');
  assert.equal(await dlg.locator('[data-room-tag="makeup"]').getAttribute('aria-pressed'),'true','field prefilled from interests');
  assert.equal(await dlg.locator('[data-room-concern="lip"]').getAttribute('aria-pressed'),'true','concern prefilled from interests');
  assert.equal(await dlg.locator('[data-room-concern="acne"]').count(),0,'only makeup concerns for a makeup room');
  await dlg.locator('[data-chat-action="room-submit"]').click();
  assert.match(await dlg.locator('#room-error').innerText(),/3자 이상/);
  await dlg.locator('#room-title').fill('acne room');await dlg.locator('[data-chat-action="room-submit"]').click();
  await page.waitForFunction(()=>/이미 있어요/.test(document.querySelector('#room-error')?.textContent));
  assert.equal(await dlg.locator('#room-title').inputValue(),'acne room','typed text survives an error');
  await dlg.locator('#room-title').fill('웜톤 립 추천');await dlg.locator('#room-intro').fill('웜톤에 맞는 틴트');
  await dlg.locator('[data-chat-action="room-submit"]').click();
  await page.waitForFunction(()=>/웜톤 립 추천/.test(document.querySelector('.room-top h1')?.textContent ?? ''));
  assert.deepEqual(created.at(-1),{p_secret:created.at(-1).p_secret,p_title:'웜톤 립 추천',p_intro:'웜톤에 맞는 틴트',p_tag:'makeup',p_concerns:['lip']});
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('ok - journey 1: splash, interests 1/3, optional profile 2/3, rooms 3/3 with filters, room opens, persistence, edit, skip, 320/390px, ko/en, no writes; room creation errors and success');
} finally { await browser.close(); }
