// Local mocked-country headers only. This does not prove a real visitor's geography.
// No production writes or external network; community module is a bounded fixture.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createLocalServer} from '../scripts/dev-server.mjs';
const server=createLocalServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;let browser;
async function fixture({country='KR',locale='en-US',saved={},width=390,failApp=false}={}) {
 const context=await browser.newContext({locale,viewport:{width,height:844},extraHTTPHeaders:{'x-vercel-ip-country':country}});
 await context.addInitScript(values=>{for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);},saved);
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort('blockedbyclient');
  if(url.pathname==='/app.js'&&failApp)return route.abort('failed');
  if(url.pathname==='/app.js')return route.fulfill({contentType:'text/javascript',body:"import {region} from './region.js'; import {lang} from './i18n.js'; window.fixtureRegion=region; window.fixtureLanguage=lang; document.body.dataset.appLoaded='true';"});
  if(url.pathname.startsWith('/api/')&&url.pathname!=='/api/language')return route.abort('blockedbyclient');
  return route.continue();
 });
 return {context,page:await context.newPage()};
}
try {
 browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
 for(const scenario of [
  {country:'KR',path:'/',lang:'ko',market:'kr'},
  {country:'JP',path:'/',lang:'en',market:null},
  {country:'XX',locale:'ko-KR',path:'/',lang:'ko',market:null},
  {country:'KR',path:'/',saved:{'seoulbeauty-region':'us'},lang:'ko',market:null},
  {country:'KR',path:'/',saved:{'seoulbeauty-region-manual':'us','seoulbeauty-language':'en'},lang:'en',market:'us'},
  {country:'KR',path:'/us?lang=ko&room=fixture',lang:'ko',market:'us'},
  {country:'US',path:'/kr?lang=en',lang:'en',market:'kr'},
 ]) {
  const f=await fixture(scenario);await f.page.goto(base+scenario.path);
  await f.page.waitForFunction(()=>!document.documentElement.hasAttribute('data-locale-pending'));
  assert.equal(await f.page.locator('html').getAttribute('lang'),scenario.lang);
  if(scenario.market){assert.equal(await f.page.evaluate(()=>window.fixtureRegion),scenario.market);assert.equal(await f.page.evaluate(()=>window.fixtureLanguage),scenario.lang);}
  else{assert.equal(await f.page.locator('[data-market-choice]').count(),2);assert.equal(await f.page.evaluate(()=>window.fixtureRegion),undefined);}
  await f.context.close();
 }
 for(const width of [320,390]){
  const gated=await fixture({country:'JP',width});await gated.page.goto(base+'/');await gated.page.locator('[data-market-choice="kr"]').waitFor();
  assert.equal(await gated.page.locator('#tabbar').isVisible(),false);
  assert.equal(await gated.page.locator('.screen:visible').count(),0);
  assert.equal(await gated.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await gated.context.close();
  const failed=await fixture({country:'KR',width,failApp:true});await failed.page.goto(base+'/');
  await failed.page.getByRole('button',{name:'다시 시도',exact:true}).waitFor();
  assert.equal(await failed.page.locator('html').getAttribute('data-locale-pending'),null);
  assert.equal(await failed.page.locator('#tabbar').isVisible(),false);
  assert.equal(await failed.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await failed.context.close();
 }
 const choose=await fixture({country:'KR',saved:{'seoulbeauty-region':'us'}});
 await choose.page.goto(base+'/?lang=en&room=synthetic&code=oauth-fixture');await choose.page.locator('[data-market-choice="kr"]').click();
 await choose.page.waitForURL(url=>url.pathname==='/kr');await choose.page.waitForFunction(()=>window.fixtureRegion==='kr');
 const chosen=new URL(choose.page.url());assert.equal(chosen.searchParams.get('room'),'synthetic');assert.equal(chosen.searchParams.get('code'),'oauth-fixture');assert.equal(chosen.searchParams.get('lang'),'en');
 assert.equal(await choose.page.evaluate(()=>localStorage.getItem('seoulbeauty-region-manual')),'kr');await choose.context.close();
 for(const [country,language] of [['KR','ko'],['JP','en']]){
  const game=await fixture({country});await game.page.goto(base+'/beauty-play/');await game.page.locator('.language-switch').waitFor();assert.equal(await game.page.locator('html').getAttribute('lang'),language);
  await game.page.locator('.language-switch').click();const opposite=language==='ko'?'en':'ko';await game.page.waitForFunction(value=>document.documentElement.lang===value,opposite);
  await game.page.reload();await game.page.locator('.language-switch').waitFor();assert.equal(await game.page.locator('html').getAttribute('lang'),opposite);await game.context.close();
 }
 console.log('ok - actual local locale handler, KR/non-KR/unknown, ambiguous legacy, explicit/manual/share, chooser preservation and game provider fixtures');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
