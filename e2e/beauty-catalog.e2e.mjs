// Fixture-only browser regression. No live writes or public messages.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ko=JSON.parse(readFileSync('web/beauty-play/translations.json','utf8')).ko;
import {createLocalServer} from '../scripts/dev-server.mjs';
import {shareSnapshot,validateCommand} from '../server/beauty-game-domain.mjs';
const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true});const page=await context.newPage(),writes=[];
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==base)return route.abort();if(u.pathname.includes('/api/')){
  if(u.pathname.endsWith('/record')){const body=r.postDataJSON();validateCommand('record',body);if(body.kind!=='event')writes.push(body);return route.fulfill({json:{ok:true,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}});}
  if(u.pathname.endsWith('/stats'))return route.fulfill({json:{votes:[],experienced:[]}});
  return route.fulfill({json:{accountLinkEnabled:false}});
 }return route.continue();});
 await page.goto(base+'/beauty-play/?character=mona&test=1');await page.locator('.advice-choices button').first().click();await page.locator('.staged-dock .primary').click();
 const snapshot=shareSnapshot('mona'),seen=new Set();
 while(true){const cards=page.locator('.staged-products .product');assert(await cards.count()<=10);for(const name of await cards.locator('.product-copy strong').allTextContents())seen.add(name);const next=page.locator('.catalog-pages button').last();if(await next.isDisabled())break;await next.click();}
 assert.equal(seen.size,new Set(snapshot.products.map(p=>p.name)).size);
 // A brand whose product was outside the initial ten remains selectable.
 const target=snapshot.products.find(p=>p.id==='69092');await page.locator('.brand-track button').filter({hasText:ko[target.brand]||target.brand}).click();
 await page.locator('.staged-products .product').filter({has:page.getByText(target.name,{exact:true})}).click();await page.locator('.staged-dock .primary').click();
 if(await page.locator('.staged-atelier').getAttribute('data-stage')==='option'){await page.locator('.shade-option').first().click();await page.locator('.staged-dock .primary').click();}
 await page.locator('.staged-dock .primary').click();await page.locator('.result-screen').waitFor();assert.equal(writes.find(x=>x.kind==='answer').product,target.id);
 assert((await page.locator('.mini-product').textContent()).includes(target.name));
 console.log('ok - all products reachable, ten per page, cross-scenario brand and save, result retains selection');
 await context.close();
}finally{await browser?.close();await new Promise(r=>server.close(r));}
