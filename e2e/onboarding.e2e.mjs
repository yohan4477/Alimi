// Current optional onboarding: home -> personal setup -> product conversations, no automatic room join.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
const base=process.argv[2]??'http://127.0.0.1:3000/';
try {
 for(const [lang,width] of [['ko',390],['en',320]]) {
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/**',route=>{
   const req=route.request(),resource=new URL(req.url()).pathname.split('/').at(-1);
   if(req.method()!=='GET' && resource!=='app_events')writes.push(resource);
   if(resource==='chat_room_list')return route.fulfill({json:[{id:'acne',title_en:'Acne talk',title_ko:'트러블',intro_en:'Experience',intro_ko:'경험',kind:'topic',tag:'skin',sort:1,members:0,messages_24h:0,concerns:['acne']}]});
   if(resource==='app_events')return route.fulfill({status:204});
   return route.fulfill({json:[]});
  });
  await page.goto(base+'?lang='+lang);
  const ob=page.locator('#onboarding');assert.equal(await ob.isHidden(),true,'setup does not block first visit');
  await page.locator('#chat .edit-interests').click();
  await ob.locator('[data-onb-group="skincare"]').click();
  await ob.locator('[data-onb-group="makeup"]').click();
  assert.equal(await ob.locator('[data-onb-concern]').count(),14);
  await ob.locator('[data-onb-concern="dry"]').click();
  await ob.locator('[data-onb-concern="cushion"]').click();
  await ob.locator('[data-onb="next"]').click();
  assert.equal(await ob.locator('[data-onb-profile="ageRange"]').count(),10);
  await ob.locator('[data-onb="profile-next"]').click();
  assert.equal(await ob.locator('.ob-step').getAttribute('aria-valuenow'),'3');
  assert.equal(await ob.locator('[data-onb-room]').count(),0,'last step is product discovery, not an automatic room');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await ob.locator('[data-onb="products-browse"]').click();
  assert.equal(await ob.isHidden(),true);
  assert.equal(await page.locator('.room-top').count(),0,'finishing setup does not join a room');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('seoulbeauty-interests-v1')));
  assert.equal(saved.done,true);assert.deepEqual(saved.concerns,['dry','cushion']);
  await page.reload();assert.equal(await ob.isHidden(),true);
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: optional setup, multiple interests, five-year age choices, product discovery, no forced room join, ko/en 320/390px');
}finally{await browser.close();}
