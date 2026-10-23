// Same-origin fixtures only. No real geolocation, accounts, or application writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createLocalServer} from '../scripts/dev-server.mjs';
const server=createLocalServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;let browser;
async function fixture({countryLanguage='en',locale='en-US',fail=false,privateMode=false}={}){
 const context=await browser.newContext({viewport:{width:390,height:844},locale});
 if(privateMode)await context.addInitScript(()=>{Object.defineProperty(document,'cookie',{get(){throw Error('blocked');},set(){throw Error('blocked');}});Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}});});
 let release,start;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{start=r;});let localeRequests=0;
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort('blockedbyclient');
  if(url.pathname==='/api/language'){localeRequests++;start();await gate;if(fail)return route.abort('failed');return route.fulfill({json:{language:countryLanguage}});}
  if(url.pathname.includes('/api/'))return route.abort('blockedbyclient');
  if(!['GET','HEAD'].includes(req.method()))return route.abort('blockedbyclient');
  return route.continue();
 });
 return {context,page:await context.newPage(),release,started,count:()=>localeRequests};
}
try{
 browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
 for(const [path,lang] of [['/beauty-play/','en'],['/beauty-play/','ko'],['/kr','en'],['/us','ko']]){
  const f=await fixture({countryLanguage:lang,locale:lang==='en'?'ko-KR':'en-US'});
  await f.page.goto(base+path,{waitUntil:'domcontentloaded'});await f.started;
  if(path.startsWith('/beauty-play'))assert.equal(await f.page.locator('#root').innerText(),'');
  else assert.equal(await f.page.locator('body').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  f.release();await f.page.waitForFunction(value=>document.documentElement.lang===value,lang);
  if(path.startsWith('/beauty-play'))await f.page.locator('.pilot-entry').waitFor();
  else{await f.page.waitForFunction(()=>!document.documentElement.hasAttribute('data-locale-pending'));assert.equal(new URL(f.page.url()).pathname,path);}
  assert.equal(f.count(),1);await f.context.close();
 }
 // Explicit link doesn't replace a remembered manual choice; manual toggle does.
 const f=await fixture();f.release();await f.page.goto(base+'/beauty-play/');await f.page.locator('.language-switch').waitFor();
 await f.page.locator('.language-switch').click();assert.equal(await f.page.locator('html').getAttribute('lang'),'ko');
 const cookie=(await f.context.cookies()).find(c=>c.name==='seoulbeauty-language');assert.equal(cookie.value,'ko');assert.equal(cookie.path,'/');
 await f.page.goto(base+'/beauty-play/?lang=en');await f.page.locator('.pilot-entry').waitFor();assert.equal(await f.page.locator('html').getAttribute('lang'),'en');
 assert.equal((await f.context.cookies()).find(c=>c.name==='seoulbeauty-language').value,'ko');
 await f.page.goto(base+'/us');await f.page.waitForFunction(()=>!document.documentElement.hasAttribute('data-locale-pending'));
 assert.equal(await f.page.locator('html').getAttribute('lang'),'ko');assert.equal(new URL(f.page.url()).pathname,'/us');assert.equal(f.count(),1);
 await f.context.close();
 for(const locale of ['en-US','ko-KR']){
  const g=await fixture({fail:true,privateMode:true,locale});g.release();await g.page.goto(base+'/beauty-play/');await g.page.locator('.pilot-entry').waitFor();
  assert.equal(await g.page.locator('html').getAttribute('lang'),locale.startsWith('ko')?'ko':'en');
  await g.page.locator('.language-switch').click();assert.equal(await g.page.locator('html').getAttribute('lang'),locale.startsWith('ko')?'en':'ko');
  await g.context.close();
 }
 console.log('ok - delayed server first draw, country versus browser, explicit link, manual shared cookie, region isolation, failed API and blocked storage fixtures');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
