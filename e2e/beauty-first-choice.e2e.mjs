// Mobile viewport regression only, not physical iOS/Safari certification.
// Every API call is intercepted and external requests are blocked: no live writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createLocalServer} from '../scripts/dev-server.mjs';
import {shareSnapshot} from '../server/beauty-game-domain.mjs';
const viewports = [
 {name:'iPhone SE',width:320,height:568},
 {name:'iPhone 13',width:390,height:844},
 {name:'Android',width:360,height:640}
];
const legacySnapshot = {...shareSnapshot('mona'), advice:[]};
const server=createLocalServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
let browser, currentPage;
const starts = events => events.filter(e=>e.name==='game_start');
async function waitForEvent(events,name,count=1) {
 const deadline=Date.now()+5000;
 while(events.filter(e=>e.name===name).length<count && Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
 assert.equal(events.filter(e=>e.name===name).length,count,`expected ${count} ${name} events`);
}
async function noHorizontalOverflow(page,label) {
 const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
 assert.ok(dimensions.document<=dimensions.viewport+1 && dimensions.body<=dimensions.viewport+1,`${label}: horizontal page overflow ${JSON.stringify(dimensions)}`);
}
async function reachable(locator,label) {
 await locator.waitFor({state:'visible'});
 // Normal page/carousel scrolling is allowed; hidden/clip ancestors must not conceal a control.
 await locator.scrollIntoViewIfNeeded();
 const geometry=await locator.evaluate(element=>{
  const rect=element.getBoundingClientRect(), x=rect.left+rect.width/2, y=rect.top+rect.height/2;
  const hit=document.elementFromPoint(x,y), clipped=[];
  for(let parent=element.parentElement;parent;parent=parent.parentElement){
   const style=getComputedStyle(parent),bounds=parent.getBoundingClientRect();
   if(['hidden','clip'].includes(style.overflowY)&&(rect.top<bounds.top-1||rect.bottom>bounds.bottom+1))clipped.push(parent.className||parent.tagName);
  }
  return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height,viewportWidth:innerWidth,viewportHeight:innerHeight,hit:element===hit||element.contains(hit),clipped};
 });
 assert.ok(geometry.width>0&&geometry.height>0&&geometry.left>=-1&&geometry.right<=geometry.viewportWidth+1&&geometry.top>=-1&&geometry.bottom<=geometry.viewportHeight+1,`${label}: control outside viewport ${JSON.stringify(geometry)}`);
 assert.deepEqual(geometry.clipped,[],`${label}: control clipped by an ancestor`);
 assert.equal(geometry.hit,true,`${label}: control is covered or not hit-testable`);
}
async function clickEvent(locator,events,name,label) {
 const count=events.filter(e=>e.name===name).length+1;
 await reachable(locator,label);await locator.click();await waitForEvent(events,name,count);
}
function assertStarts(events,count,label) {
 const rows=starts(events);
 assert.equal(rows.length,count,`${label}: game_start count`);
 assert.ok(rows.every(e=>e.step==='selection'),`${label}: retain existing backend step contract`);
 assert.equal(new Set(rows.map(e=>e.play)).size,count,`${label}: exactly one game_start per play`);
 assert.equal(new Set(rows.map(e=>e.id)).size,count,`${label}: event IDs stay unique`);
}
try {
 browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
 // Brand regression: landing, regular game and pilot game retain their destinations.
 for(const width of [320,390])for(const lang of ['ko','en']){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();currentPage=page;
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==base)return route.abort('blockedbyclient');
   if(url.pathname.startsWith('/beauty-play/api/')||url.pathname.startsWith('/api/'))return route.fulfill({json:{ok:true,accountLinkEnabled:false}});
   if(!['GET','HEAD'].includes(request.method()))return route.abort('blockedbyclient');
   return route.continue();
  });
  for(const entry of [{query:'',header:'.play-top',destination:'/beauty-play/'},{query:'&character=mona',header:'.top',destination:'/'},{query:'&character=mona&pilot=1',header:'.pilot-top',destination:'/beauty-play/'}]){
   const label=`brand ${width}px ${lang} ${entry.header}`;
   await page.goto(base+'/beauty-play/?test=1&lang='+lang+entry.query);
   const header=page.locator(entry.header),logo=header.getByRole('img',{name:'Seoul Beauty',exact:true});
   await logo.waitFor({state:'visible'});
   await page.waitForFunction(()=>{const img=document.querySelector('header .game-brand-logo');return img?.complete&&img.naturalWidth>0;});
   assert.equal(await logo.getAttribute('src'),'/assets/seoul-beauty-logo.webp');
   assert.equal(await header.locator('a').first().evaluate(a=>new URL(a.href).pathname),entry.destination);
   assert.ok(!(await header.locator('a').first().innerText()).includes('서울뷰티'),label+' uses the logo, not the old text');
   const geometry=await logo.evaluate(img=>{const r=img.getBoundingClientRect(),h=img.closest('header').getBoundingClientRect();return {ratio:r.width/r.height,naturalRatio:img.naturalWidth/img.naturalHeight,inside:r.left>=h.left&&r.right<=h.right&&r.top>=h.top&&r.bottom<=h.bottom};});
   assert.ok(geometry.inside,label+' logo stays inside header');
   assert.ok(Math.abs(geometry.ratio-geometry.naturalRatio)<0.01,label+' preserves logo proportions');
   await reachable(header.locator('a').first(),label+' brand link');
   await reachable(header.locator('.language-switch'),label+' language switch');
   await noHorizontalOverflow(page,label);
   if(entry.header==='.top')assert.equal(await header.locator('.brand span').textContent(),'Beauty is personal. Let’s talk.');
  }
  await context.close();
 }
 console.log('Brand matrix passed: landing and both game headers × Korean/English × 320/390px.');
 for(const viewport of viewports)for(const lang of ['ko','en'])for(const path of ['advice-first','product-first']){
  const label=`${viewport.name} ${viewport.width}x${viewport.height} ${lang} ${path}`;
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:true,hasTouch:true});
  const page=await context.newPage(),events=[],errors=[],unexpectedWrites=[];currentPage=page;
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==base)return route.abort('blockedbyclient');
   if(url.pathname.startsWith('/beauty-play/api/')||url.pathname.startsWith('/api/')){
    if(url.pathname.endsWith('/record')){
     const body=request.postDataJSON();
     if(body.kind==='event')events.push(body);else unexpectedWrites.push(body.kind);
     return route.fulfill({json:{ok:true}});
    }
    if(url.pathname.endsWith('/invite'))return route.fulfill({json:{id:'fixture-legacy-invite',character:'mona',test:1,snapshot:legacySnapshot}});
    return route.fulfill({json:{accountLinkEnabled:false}});
   }
   // Only local static assets may pass through. Unexpected write routes fail closed.
   if(!['GET','HEAD'].includes(request.method())){unexpectedWrites.push(url.pathname);return route.abort('blockedbyclient');}
   return route.continue();
  });
  await page.goto(base+'/beauty-play/?character=mona&lang='+lang+'&test=1'+(path==='product-first'?'&invite=fixture-legacy-invite':''));
  await waitForEvent(events,'landing_view');
  await page.locator(`.staged-atelier[data-stage="${path==='advice-first'?'advice':'product'}"]`).waitFor();
  await noHorizontalOverflow(page,label+' initial');
  assertStarts(events,0,label+' before any choice');
  assert.equal(await page.locator('.story-switch').count(),0);
  if(path==='advice-first'){
   if(lang==='en')assert.match(await page.locator('.game-reward-hint').textContent(),/Make a choice/);
   for(const control of await page.locator('.advice-choices button').all())await reachable(control,label+' advice control');
   await clickEvent(page.locator('.advice-choices button').first(),events,'advice_select',label+' first advice');
   await waitForEvent(events,'game_start',1);
   await clickEvent(page.locator('.advice-choices button').last(),events,'advice_select',label+' changed advice');
   assertStarts(events,1,label+' repeated advice');
   await reachable(page.locator('.staged-dock .primary'),label+' advice continue');
   await page.locator('.staged-dock .primary').click();
   await page.locator('.staged-atelier[data-stage="product"]').waitFor();
  }else{
   assert.equal(await page.locator('.advice-choices').count(),0,'legacy invitation must genuinely start at product selection');
  }
  await noHorizontalOverflow(page,label+' product stage');
  await clickEvent(page.locator('.staged-products .product').first(),events,'product_select',label+' first product');
  await waitForEvent(events,'game_start',1);
  await clickEvent(page.locator('.staged-products .product').nth(1),events,'product_select',label+' changed product');
  await reachable(page.locator('.staged-dock .primary'),label+' product continue');
  assertStarts(events,1,label+' repeated product choices');
  assert.equal(starts(events)[0].source,path==='product-first'?'friend':'preview',label+' source preserved');
  await noHorizontalOverflow(page,label+' after choices');
  assert.equal(await page.locator('.story-switch,.other-muses,.result-muse-track').count(),0);
  assertStarts(events,1,label+' no scenario bypass');
  await noHorizontalOverflow(page,label+' final');
  assert.equal(await page.locator('.account-link').count(),0);
  assert.deepEqual(unexpectedWrites,[],label+' must not write answers/shares/reflections');
  assert.deepEqual(errors,[],label+' runtime errors');
  console.log(`ok - ${label}: reachable controls, no horizontal overflow, no impression starts, unique first-choice telemetry`);
  await context.close();
 }
 console.log('First-choice matrix passed: 3 mobile viewports × 2 languages × 2 entry paths; fixture-only API. Physical device/browser QA remains separate.');
} catch(error) {
 if(currentPage&&!currentPage.isClosed())await currentPage.screenshot({path:'e2e-failure.png',fullPage:true}).catch(()=>{});
 throw error;
} finally {await browser?.close();await new Promise(r=>server.close(r));}
