// Fixture-only locale regression. No external requests or live writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createLocalServer} from '../scripts/dev-server.mjs';
const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
 for(const lang of ['ko','en']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  let answer=null,failSave=true;const writes=[];
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort('blockedbyclient');
   if(url.pathname.includes('/api/')){
    if(url.pathname.endsWith('/record')){
     const body=req.postDataJSON();assert.equal(body.test,true,'all fixture events/answers must stay test-only');writes.push(body);
     if(body.kind==='answer'){
      if(failSave)return route.fulfill({status:503,json:{error:'요청을 처리할 수 없어요. INTERNAL-DO-NOT-SHOW'}});
      answer=body;
     }
     return route.fulfill({json:{ok:true,id:'11111111-1111-4111-8111-111111111111'}});
    }
    if(url.pathname.endsWith('/stats'))return route.fulfill({json:{votes:[{product:answer.product,n:3}],experienced:[],choices:[{character:answer.character,product:answer.product,shade:answer.shade,advice:answer.advice,n:3,usedN:0,reasons:[{reason:answer.reasons[0]||'촉촉함이 중요해서',n:2}]}]}});
    return route.fulfill({json:{ok:true,accountLinkEnabled:false,kakaoKey:null}});
   }
   if(!['GET','HEAD'].includes(req.method()))return route.abort('blockedbyclient');
   return route.continue();
  });
  await page.goto(base+'/beauty-play/?lang='+lang+'&test=1');
  await page.locator('.pilot-cards a').first().click();
  assert.equal(new URL(page.url()).searchParams.get('test'),'1');
  assert.equal(new URL(page.url()).searchParams.get('lang'),lang);
  await page.locator('.testflag').waitFor();
  await page.locator('.advice-choices button').first().click();await page.locator('.staged-dock .primary').click();
  if(await page.locator('.catalog-pages').count()){const text=await page.locator('.catalog-pages').innerText();if(lang==='en'){assert.doesNotMatch(text,/[가-힣]/);assert.match(text,/items/);}else assert.match(text,/개/);}
  await page.locator('.staged-products .product').first().click();await page.locator('.staged-dock .primary').click();
  if(await page.locator('.staged-atelier').getAttribute('data-stage')==='option'){
   await page.locator('.shade-option').first().click();await page.locator('.staged-dock .primary').click();
  }
  await page.locator('.staged-dock .primary').click();await page.locator('.error[role="alert"]').waitFor();
  const error=await page.locator('.error').innerText();
  assert.equal(error,lang==='en'?'Could not save your choice. Please try again.':'선택을 저장하지 못했어요. 다시 시도해 주세요.');
  assert(!error.includes('INTERNAL-DO-NOT-SHOW'));
  // Switching language translates the same persisted app error state.
  await page.locator('.language-switch').click();
  assert.equal(await page.locator('.error').innerText(),lang==='ko'?'Could not save your choice. Please try again.':'선택을 저장하지 못했어요. 다시 시도해 주세요.');
  await page.locator('.language-switch').click();
  failSave=false;await page.locator('.staged-dock .primary').click();await page.locator('.choice-path-head').waitFor();
  assert.match(await page.locator('.choice-path-head>span').innerText(),lang==='en'?/^3 responses · 100%$/:/^3건 · 100%$/);
  assert.match(await page.locator('.reason-tag').first().innerText(),lang==='en'?/2 responses$/:/2건$/);
  if(lang==='en')assert.doesNotMatch(await page.locator('.result-votes').innerText(),/[가-힣]/);
  assert.equal(await page.locator('.friend-share-buttons .primary').innerText(),lang==='en'?'Send to a friend':'친구는 뭘 고를까?');
  assert(writes.some(body=>body.kind==='answer'));assert(writes.every(body=>body.test===true));
  // The random entry button must preserve test mode as well as the explicit cards.
  await page.goto(base+'/beauty-play/?lang='+lang+'&test=1');await page.locator('.pilot-entry>.primary').click();
  await page.locator('.testflag').waitFor();assert.equal(new URL(page.url()).searchParams.get('test'),'1');
  console.log(`ok - ${lang}: test entry, localized failure/language switch, dynamic result counts, share label; fixture only`);
  await context.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
