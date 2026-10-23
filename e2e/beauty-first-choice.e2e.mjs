import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createLocalServer} from '../scripts/dev-server.mjs';
const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try {
 browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
 for(const lang of ['ko','en']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),events=[];
  await page.route('**/beauty-play/api/**',async route=>{const request=route.request(),url=new URL(request.url());if(url.pathname.endsWith('/record')){const body=request.postDataJSON();events.push(body);return route.fulfill({json:{ok:true}});}return route.fulfill({json:{accountLinkEnabled:false}});});
  await page.goto(base+'/beauty-play/?character=mona&lang='+lang);
  await page.locator('.advice-choices button').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('.staged-dock .primary'));
  assert.equal(events.filter(e=>e.name==='game_start').length,0);
  if(lang==='en')assert.match(await page.locator('.game-reward-hint').textContent(),/Make a choice/);
  await page.locator('.advice-choices button').first().click();
  await page.waitForTimeout(100);
  await page.locator('.advice-choices button').last().click();
  await page.waitForTimeout(100);
  assert.equal(events.filter(e=>e.name==='game_start').length,1);
  assert.equal(events.find(e=>e.name==='game_start').step,'selection');
  await page.locator('.story-switch').selectOption('3');
  await page.locator('.advice-choices button').first().click();await page.waitForTimeout(100);
  assert.equal(events.filter(e=>e.name==='game_start').length,2);
  assert.equal(await page.locator('.account-link').count(),0);
  await page.close();
 }
 console.log('First choice: bilingual mobile, no impression start, repeat/scenario deduplication passed');
} finally {await browser?.close();await new Promise(r=>server.close(r));}
