// Deterministic mobile regressions: no production data or event writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let stripFails=true,releaseOld,oldStarted,failB=true;
 const started=new Promise(r=>oldStarted=r), gate=new Promise(r=>releaseOld=r);
 const row=(brand,i)=>({family_key:brand+i,brand,brand_ko:null,base_name:brand+' product '+i,category:'립',image_url:null,min_price_minor:1000,max_price_minor:1000,variants:1});
 await page.route('**/rest/v1/**',async route=>{
  const u=new URL(route.request().url()), resource=u.pathname.split('/').at(-1);
  if(resource==='catalog_brands')return route.fulfill(stripFails?{status:503,json:{}}:{json:[{brand:'A',families:30,logo_url:'https://logos.invalid/a.png'},{brand:'B',families:25,logo_url:null},{brand:'EMPTY',families:1,logo_url:null}]});
  if(resource==='catalog_families'){
   const brand=u.searchParams.get('brand'), offset=Number(u.searchParams.get('offset'));
   if(brand==='eq.A'){oldStarted();await gate;return route.fulfill({json:[row('A',0)]})}
   if(brand==='eq.B'){if(failB)return route.fulfill({status:503,json:{}});return route.fulfill({json:Array.from({length:offset?1:24},(_,i)=>row('B',offset+i))})}
   return route.fulfill({json:[]});
  }
  return route.fulfill({json:[]});
 });
 await page.route('https://logos.invalid/**',r=>r.abort());
 await page.goto((process.argv[2]??'http://localhost:3000/')+'?lang=en');
 await page.locator('[data-brands-retry]').waitFor();stripFails=false;await page.click('[data-brands-retry]');
 await page.locator('[data-brand="A"]').waitFor();
 await page.waitForFunction(()=>!document.querySelector('[data-brand="A"] img'));
 assert.equal(await page.locator('[data-brand="A"] i span').innerText(),'A');
 await page.click('[data-brand="A"]');await started;
 await page.click('#brand [data-screen="home"]');await page.click('[data-brand="B"]');
 releaseOld();await page.locator('[data-brand-retry]').waitFor();
 assert.equal(await page.locator('#brand .card').count(),0,'stale A response discarded');
 failB=false;await page.click('[data-brand-retry]');
 await page.waitForFunction(()=>document.querySelectorAll('#brand .card').length>=24);
 await page.locator('#brand-more').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelectorAll('#brand .card').length===25);
 assert.ok((await page.locator('#brand .card .brand').allTextContents()).every(x=>x==='B'));
 assert.equal(await page.locator('#brand-more').count(),0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
 await page.click('#brand [data-screen="home"]');await page.click('[data-brand="EMPTY"]');
 await page.waitForFunction(()=>document.querySelector('#brand .empty')?.textContent.includes('No'));
 assert.equal(await page.locator('[data-brand-retry]').count(),0,'empty differs from request failure');
 assert.deepEqual(errors,[]);
 console.log('ok - mobile brand strip retry, logo fallback, stale switch, page retry, pagination, empty state and width');
} finally {await browser.close()}
