// Fixture-only progression checks; never writes to production.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createLocalServer} from '../scripts/dev-server.mjs';
import {supportedCharacterIds,shareSnapshot} from '../server/beauty-game-domain.mjs';
const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,channel:process.env.CHROME_PATH?undefined:'chrome'});
try {
 for(const character of ['mona','school_photo_friend','school_last_minute_friend']){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const records=[],errors=[];let failShare=true;
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/beauty-play/api/')){
 if(url.pathname.endsWith('/session'))return route.fulfill({json:{supportedCharacterIds}});
 if(url.pathname.endsWith('/record')){const body=req.postDataJSON();records.push(body);if(body.kind==='share'&&failShare)return route.fulfill({status:503,json:{error:'fixture unavailable'}});return route.fulfill({json:{ok:true,id:'fixture-share'}});}
 if(url.pathname.endsWith('/stats'))return route.fulfill({json:{votes:[],reasons:[],experienced:[],shades:[]}});
 if(url.pathname.endsWith('/invite'))return route.fulfill({json:{id:'fixture-share',character,test:1,snapshot:shareSnapshot(character)}});
 return route.fulfill({json:{}});
 }
 return route.continue();
 });
 await page.goto(base+'/beauty-play/?character='+character+'&test=1&lang=ko');
 await page.locator('.advice-choices button').first().click();
 await page.locator('.staged-dock .primary').click();
 await page.locator('.staged-products .product').first().click();
 await page.locator('.staged-dock .primary').click();
 if(await page.locator('.staged-options').count()){await page.locator('.shade-option').first().click();await page.locator('.staged-dock .primary').click();}
 await page.locator('.staged-reasons').waitFor();await page.locator('.staged-dock .primary').click();
 const next=page.locator('.result-next .primary');await next.waitFor();assert(await next.isDisabled());
 await page.locator('.friend-share-buttons .outline').first().click();
 await page.waitForFunction(()=>document.querySelector('.friend-share-panel [role=status]'));
 assert(await next.isDisabled(),'failed share must not unlock');
 failShare=false;await page.locator('.friend-share-buttons .outline').first().click();
 await page.waitForFunction(()=>!document.querySelector('.result-next .primary').disabled);
 const answer=records.find(r=>r.kind==='answer');assert.equal(answer.character,character);
 await next.click();await page.locator('.advice-choices').waitFor();
 await page.locator('.advice-choices button').first().click();
 await page.waitForTimeout(100);
 const event=records.filter(r=>r.name==='advice_select').at(-1);assert.notEqual(event.character,character);
 assert.equal(await page.locator('.story-switch,.result-muse-track').count(),0);assert.deepEqual(errors,[]);
 await context.close();console.log('ok progression',character);
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
