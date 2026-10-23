import {readFileSync} from 'node:fs';
// All REST responses are fixtures: exercise creation failure/retry and server-authorized deletion.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
const base=process.argv[2]??'http://localhost:3000/';
try {
 for (const lang of ['ko','en']) {
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/room-feature-release.js',route=>route.fulfill({contentType:'text/javascript',body:readFileSync(new URL('../dist/room-feature-release.js',import.meta.url),'utf8').replaceAll('= false','= true')}));
  await page.addInitScript(()=>localStorage.setItem('seoulbeauty-interests-v1',JSON.stringify({version:1,skincare:false,makeup:false,concerns:[],done:true})));
  let fail=true,created=false,deleted=false,submissions=[];
  const room={id:'new-room',service_region:'kr',title_ko:'내 피부 고민',title_en:'내 피부 고민',kind:'topic',tag:'talk',concerns:['acne','dry','sensitive'],members:1,messages_24h:0};
  await page.route('**/rest/v1/**',route=>{
   const req=route.request(),name=new URL(req.url()).pathname.split('/').at(-1);
   if(name==='app_events')return route.fulfill({status:204});
   if(name==='chat_room_list')return route.fulfill({json:created&&!deleted?[room]:[]});
   if(name==='create_region_room'){
    submissions.push(req.postDataJSON());
    if(fail)return route.fulfill({status:404,json:{code:'PGRST202',message:'Could not find the function public.create_region_room in the schema cache'}});
    created=true;return route.fulfill({json:room.id});
   }
   if(name==='room_actions')return route.fulfill({json:{joined:true,can_delete:true}});
   if(name==='delete_room'){deleted=true;return route.fulfill({status:204});}
   return route.fulfill({json:[]});
  });
  await page.goto(new URL('/kr?lang='+lang,base).href);
  await page.evaluate(()=>document.dispatchEvent(new Event('seoulbeauty-create-room')));
  await page.locator('#room-title').fill('내 피부 고민');
  await page.locator('#room-intro').fill('보습 제품 이야기');
  await page.locator('[data-chat-action="more-room-tags"]').click();
  assert.equal(await page.locator('[data-room-concern]').count(),19);
  for(const tag of ['acne','dry','sensitive','pores'])await page.locator(`[data-room-concern="${tag}"]`).click();
  assert.equal(await page.locator('[data-room-concern][aria-pressed="true"]').count(),3);
  assert.ok(await page.locator('#room-error').innerText());
  await page.locator('[data-chat-action="room-submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#room-error')?.textContent.length>0&&!document.querySelector('[data-chat-action="room-submit"]').disabled);
  assert.equal(await page.locator('#room-title').inputValue(),'내 피부 고민');
  assert.equal(await page.locator('#room-intro').inputValue(),'보습 제품 이야기');
  assert.equal(submissions.length,1);
  assert.deepEqual(submissions[0].p_concerns,['acne','dry','sensitive']);
  fail=false;
  await page.locator('[data-chat-action="room-submit"]').click();
  await page.locator('.room-top h1').waitFor();
  assert.equal(await page.locator('.room-top h1').innerText(),'내 피부 고민');
  assert.equal(submissions.length,2);
  await page.locator('[data-chat-action="room-more"]').click();
  page.once('dialog',d=>d.dismiss());
  await page.locator('[data-chat-action="delete-room"]').click();
  assert.equal(deleted,false,'cancel preserves the room');
  // The management menu stays open after cancellation.
  page.once('dialog',d=>d.accept());
  await page.locator('[data-chat-action="delete-room"]').click();
  await page.locator('#community-home').waitFor();
  assert.equal(deleted,true);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('ok - room tags, maximum selection, missing RPC recovery, draft preservation, creation and deletion confirmation in ko/en');
}finally{await browser.close();}
