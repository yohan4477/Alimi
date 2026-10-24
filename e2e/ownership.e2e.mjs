// Browser fixtures only. No public votes, telemetry or remote database access.
import {chromium} from 'playwright-core';import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';
import {createLocalServer} from '../scripts/dev-server.mjs';import {copy} from '../dist/owned-poll/model.js';
const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
const products=[{id:'64960',brand:'Example',name:'Gloss',image:'/beauty-play/assets/p-64960.jpg'},{id:'second',brand:'Other',name:'Cream',image:'/missing-product.jpg'}];
try{browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});await mkdir('e2e-artifacts',{recursive:true});
 for(const width of [375,390,430])for(const lang of ['ko','en']){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true});const page=await context.newPage(),t=copy[lang],votes=new Map(),writes=[];
  await context.route('**/*',async route=>{const request=route.request(),u=new URL(request.url());if(u.origin!==base)return route.abort();if(u.pathname==='/api/owned-poll'){
   if(u.searchParams.has('catalog')){let list=u.searchParams.get('source')==='catalog'?[{id:'catalog:store:US:one',brand:'Example',name:'Full Catalog Product',image:products[0].image}]:products;const q=(u.searchParams.get('q')||'').toLowerCase(),brand=u.searchParams.get('brand');list=list.filter(p=>(!q||(p.brand+' '+p.name).toLowerCase().includes(q))&&(!brand||p.brand===brand));return route.fulfill({json:{products:list,brands:['Example','Other'],hasMore:false}});}
   const id=u.searchParams.get('product');if(request.method()==='POST'){const body=request.postDataJSON();writes.push({id,...body});if(body.event)return route.fulfill({json:{ok:true}});votes.set(id,{mine:body.choice,mineFollowup:body.followup||null});}
   const v=votes.get(id)||{mine:null,mineFollowup:null};return route.fulfill({json:{product:id,productInfo:{...(products.find(p=>p.id===id)||{id,brand:'Example',name:'Full Catalog Product'}),options:[{id:'pink',label:'Pink'}]},...v,total:v.mine?1:0,counts:{owned:v.mine==='owned'?1:0,past:v.mine==='past'?1:0,want:v.mine==='want'?1:0,unknown:v.mine==='unknown'?1:0},followupCounts:{owned:{daily:1},past:{rebuy_yes:1},want:{looks:1},unknown:{curious:1}}}});
  }return route.continue();});
  await page.goto(base+'/owned-poll/?lang='+lang+'&test=1&product=64960&option=pink');await page.getByRole('button',{name:t.labels.owned,exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-choice="owned"]').disabled);
  assert((await page.locator('#option').innerText()).includes('Pink'));assert.equal(await page.locator('#results').isVisible(),false);
  for(const [choice,followup]of [['owned','daily'],['past',null],['want','looks'],['unknown','curious']]){
   await page.getByRole('button',{name:t.labels[choice],exact:true}).click();await page.locator('#followup').waitFor();assert(await page.locator('#skip-follow').evaluate(el=>el.getBoundingClientRect().height)>=44);
   assert(writes.some(w=>w.choice===choice),'first answer must save before follow-up');
   if(followup)await page.getByRole('button',{name:t.followups[choice].options[followup],exact:true}).click();else await page.getByRole('button',{name:t.skip,exact:true}).click();
   await page.locator('#results').waitFor();assert.equal(votes.get('64960').mine,choice);
  }
  await page.locator('#note').fill('Private fixture note');await page.getByRole('button',{name:t.saveNote,exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#save-note').disabled);assert(writes.some(w=>w.note==='Private fixture note'));
  await page.reload();await page.locator('#results').waitFor();assert.equal(await page.locator('[data-choice="unknown"]').getAttribute('aria-pressed'),'true');
  await page.locator('#catalog-list button').filter({hasText:'Cream'}).click();await page.waitForFunction(()=>!document.querySelector('[data-choice="owned"]').disabled);await page.locator('#image-fallback').waitFor();assert((await page.locator('#language').getAttribute('href')).includes('product=second'));assert.equal(await page.locator('#results').isVisible(),false);
  await page.locator('#catalog-search').fill('[] unmatched !');await page.getByText(t.empty,{exact:true}).waitFor();await page.locator('#catalog-search').fill('');await page.locator('#catalog-list button').first().waitFor();
  await page.locator('#catalog-source').selectOption('catalog');await page.locator('#catalog-list button').filter({hasText:'Full Catalog Product'}).click();await page.waitForFunction(()=>!document.querySelector('[data-choice="owned"]').disabled);await page.getByRole('button',{name:t.labels.owned,exact:true}).click();await page.locator('#followup').waitFor();assert(writes.some(w=>w.id==='catalog:store:US:one'&&w.choice==='owned'));assert(writes.some(w=>w.event==='explore'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile horizontal overflow');
  await page.screenshot({path:`e2e-artifacts/ownership-${lang}-${width}.png`,fullPage:true});await context.close();
 }
 const context=await browser.newContext({viewport:{width:375,height:844}}),page=await context.newPage();await context.route('**/api/owned-poll?**',r=>r.fulfill({status:404,json:{error:'Feature not available'}}));await page.goto(base+'/owned-poll/?lang=en');await page.getByText(copy.en.unavailable,{exact:true}).waitFor();assert.equal(await page.locator('[data-choice="owned"]').isEnabled(),false);await context.close();
 const failedContext=await browser.newContext(),failedPage=await failedContext.newPage();
 await failedContext.route('**/api/owned-poll?**',route=>{const u=new URL(route.request().url());return u.searchParams.has('catalog')?route.fulfill({json:{products:[products[0]],brands:['Example'],hasMore:false}}):route.fulfill({status:503,json:{error:'Unavailable'}});});
 await failedPage.goto(base+'/owned-poll/?lang=en');await failedPage.getByText(copy.en.loadFailed,{exact:true}).waitFor();
 await failedPage.locator('#catalog-brand').selectOption('Example');await failedPage.waitForTimeout(250);
 assert.equal(await failedPage.locator('[data-choice="owned"]').isEnabled(),false,'successful catalog must not override failed product load');await failedContext.close();
 console.log('ownership browser: 375/390/430 ko/en, four branches, first answer persistence, skip, note, revisit, catalog identity, fallback image, search and disabled release passed');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
