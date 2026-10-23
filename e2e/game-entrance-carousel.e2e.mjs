// Mocked community requests only. No production posts, votes, or game writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createLocalServer} from '../scripts/dev-server.mjs';
const server=createLocalServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
 for (const width of [320,390]) for (const lang of ['ko','en']) {
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'no-preference'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.goto(`${base}/kr?skipOnboarding=1&lang=${lang}`);
  const entry=page.locator('[data-game-entrance]');await entry.waitFor();
  const before=await entry.getAttribute('href'), firstText=await entry.innerText();
  assert.equal(new URL(before,base).searchParams.get('lang'),lang);
  await page.clock.fastForward(5001);
  assert.notEqual(await entry.getAttribute('href'),before);
  assert.notEqual(await entry.innerText(),firstText);
  await page.waitForFunction(()=>{const img=document.querySelector('[data-game-entrance] img');return img?.complete&&img.naturalWidth>0;});
  await entry.focus();const focused=await entry.getAttribute('href');await page.clock.fastForward(10001);assert.equal(await entry.getAttribute('href'),focused);
  await entry.evaluate(el=>el.blur());await entry.hover();const hovered=await entry.getAttribute('href');await page.clock.fastForward(10001);assert.equal(await entry.getAttribute('href'),hovered);
  await page.mouse.move(0,0);await page.emulateMedia({reducedMotion:'reduce'});const reduced=await entry.getAttribute('href');await page.clock.fastForward(10001);assert.equal(await entry.getAttribute('href'),reduced);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const box=await entry.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+1);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: 5-second character/text/link rotation, focus/hover/reduced-motion pause, KO/EN 320/390px layout');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
