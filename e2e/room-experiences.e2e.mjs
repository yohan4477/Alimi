// Full offline scenario on the real app. CI provides Chrome; no production writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH,args:['--no-sandbox']}:{channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST'&&/set_room_experience|delete_room_experience/.test(r.url()))writes.push(r.url());});
 await page.route('**/rest/v1/**',r=>r.fulfill({json:[]}));
 const url=(process.argv[2]??'http://localhost:3000/')+'?lang=ko&demo=1&room=demo-experience-mixed';
 await page.goto(url);
 const host=page.locator('#room-experiences');
 await host.locator('[data-exp-action=edit]').waitFor();
 const click=s=>host.locator(s).click();
 await click('[data-exp-action=edit]');
 for(const [field,value] of [['status','using'],['period','months'],['repeat','third'],['opinion','recommend'],['reasons','moisture']])await click(`[data-exp-field=${field}][data-exp-value=${value}]`);
 await click('[data-exp-action=save]');
 assert.match(await host.innerText(),/응답 9명/);assert.match(await host.innerText(),/추천 5명/);
 await click('[data-exp-action=edit]');await click('[data-exp-field=status][data-exp-value=curious]');await click('[data-exp-action=save]');
 assert.match(await host.innerText(),/구매 고민 3명/);assert.match(await host.innerText(),/추천 4명/);
 await page.reload();await host.locator('[data-exp-action=edit]').waitFor();await click('[data-exp-action=toggle]');
 assert.match(await host.innerText(),/응답 9명/);
 await click('[data-exp-action=edit]');await click('[data-exp-action=delete]');assert.match(await host.innerText(),/응답 8명/);
 await page.locator('#chat-text').fill('오프라인에서 대화도 계속할 수 있어요.');await page.locator('#chat-form .chat-send').click();
 assert.match(await page.locator('#chat-log').innerText(),/오프라인에서 대화도 계속할 수 있어요/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 await page.screenshot({path:'room-experiences-mobile.png',fullPage:true});
 console.log('Room experience mobile scenario passed');
} finally {await browser.close();}
