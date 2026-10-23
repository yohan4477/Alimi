// Synthetic startup/routing fixtures only. Every API and external navigation is
// intercepted before network; this does not contact or verify the old Sites app.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createLocalServer} from '../scripts/dev-server.mjs';
import {shareSnapshot} from '../server/beauty-game-domain.mjs';

const id='11111111-1111-4111-8111-111111111111';
const legacyOrigin='https://seoulbeauty-muse-play.yohan4477.chatgpt.site';
const target=legacyOrigin+'/?invite='+id; // Stale legacy-response fixture only.
const server=createLocalServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser,currentPage;
function latch(){let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};}
async function until(predicate,label){const deadline=Date.now()+5000;while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert(predicate(),label);}
async function disabled(page){
  assert.equal(await page.locator('.story-switch').count(),0);
  assert.equal(await page.locator('.staged-dock .primary').isDisabled(),true);
  for(const control of await page.locator('.advice-choices button, .staged-products .product').all())assert.equal(await control.isDisabled(),true);
}
async function fixture({status=200,snapshot=shareSnapshot('mona'),redirect=target,lang='ko'}={}){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();currentPage=page;
  const session=latch(),invite=latch(),records=[],navigations=[],legacyRequests=[],errors=[];let sessionReads=0,inviteReads=0;
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===legacyOrigin)legacyRequests.push(request.url());
    if(url.origin!==base){
      if(request.isNavigationRequest())navigations.push(request.url());
      return route.abort('blockedbyclient');
    }
    if(url.pathname.startsWith('/beauty-play/api/')||url.pathname.startsWith('/api/')){
      if(url.pathname.endsWith('/session')){sessionReads++;await session.promise;return route.fulfill({json:{ok:true,accountLinkEnabled:false}});}
      if(url.pathname.endsWith('/invite')){inviteReads++;await invite.promise;return route.fulfill({status,json:status===200?{id,character:'mona',test:1,snapshot}:status===409?{error:'legacy_invite',legacyInviteUrl:redirect}:{error:'unavailable'}});}
      if(url.pathname.endsWith('/record')){records.push(request.postDataJSON());return route.fulfill({json:{ok:true}});}
      return route.fulfill({status:404,json:{error:'Unexpected fixture API'}});
    }
    if(!['GET','HEAD'].includes(request.method()))return route.abort('blockedbyclient');
    return route.continue();
  });
  return {page,context,session,invite,records,navigations,legacyRequests,errors,
    async begin(){
      await page.goto(base+'/beauty-play/?lang='+lang+'&character=mona&test=1&invite='+id);
      await page.locator('.advice-choices button').first().waitFor();
      await until(()=>sessionReads===1,'session request must be in flight');
      await disabled(page);assert.equal(inviteReads,0);assert.deepEqual(records,[]);
      // Disabled first-choice controls must not consume the one-per-play marker.
      await page.locator('.advice-choices button').first().dispatchEvent('click');
      assert.deepEqual(records,[]);
      session.release();await until(()=>inviteReads===1,'invite request must follow session');
      await disabled(page);assert.deepEqual(records,[]);
      await page.locator('.advice-choices button').first().dispatchEvent('click');
      assert.deepEqual(records,[]);
    },
    async close(){session.release();invite.release();await context.close();}
  };
}
try{
  browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
  for(const productFirst of [false,true]){
    const snapshot=shareSnapshot('mona');if(productFirst)snapshot.advice=[];
    const f=await fixture({snapshot});
    try{
      await f.begin();f.invite.release();
      await until(()=>f.records.some(record=>record.name==='landing_view'),'normal invitation enables startup analytics');
      assert.equal(await f.page.locator('.story-switch').count(),0);
      const choices=f.page.locator(productFirst?'.staged-products .product':'.advice-choices button');
      assert.equal(await choices.first().isDisabled(),false);
      assert.equal(f.records.filter(record=>record.name==='game_start').length,0);
      await choices.first().click();await until(()=>f.records.filter(record=>record.name==='game_start').length===1,'first real choice emits once');
      const selectName=productFirst?'product_select':'advice_select';
      await choices.first().click();await until(()=>f.records.filter(record=>record.name===selectName).length===2,'second selection observed');
      assert.equal(f.records.filter(record=>record.name==='game_start').length,1);
      assert.deepEqual(f.navigations,[]);assert.deepEqual(f.legacyRequests,[]);assert.deepEqual(f.errors,[]);
      console.log(`ok - delayed session/invite gates ${productFirst?'product':'advice'} first choice; first real choice emits once`);
    }finally{await f.close();}
  }
  const frozen=shareSnapshot('mona');delete frozen.catalogPolicy;
  const historical=await fixture({snapshot:frozen});
  try{
    await historical.begin();historical.invite.release();
    await until(()=>historical.records.some(record=>record.name==='landing_view'),'historical invitation ready');
    await historical.page.locator('.advice-choices button').first().click();
    await historical.page.locator('.staged-dock .primary').click();
    const ids=await historical.page.locator('.staged-products .product').evaluateAll(nodes=>nodes.map(node=>node.dataset.productId));
    assert.deepEqual(new Set(ids),new Set(frozen.advice[0].productIds));
    assert.deepEqual(historical.errors,[]);
    console.log('ok - unmarked historical snapshot retains its captured advice-product restriction');
  }finally{await historical.close();}
  for(const options of [{status:404},{status:404,lang:'en'},{status:503},{status:409},{status:409,redirect:'https://untrusted.invalid/?invite='+id}]){
    const f=await fixture(options);
    try{
      await f.begin();f.invite.release();await f.page.getByRole('alert').waitFor({state:'visible'});
      assert.match(await f.page.getByRole('alert').innerText(),options.lang==='en'?/This invite link is unavailable/:/이 초대 링크는 더 이상 사용할 수 없어요/);
      await disabled(f.page);assert.deepEqual(f.records,[]);assert.deepEqual(f.navigations,[]);assert.deepEqual(f.legacyRequests,[]);assert.deepEqual(f.errors,[]);
      assert(f.page.url().startsWith(base+'/beauty-play/'));
      console.log(`ok - ${options.status}${options.redirect?' untrusted destination':''} stays fail-closed with disabled controls`);
    }finally{await f.close();}
  }
}catch(error){
  if(currentPage&&!currentPage.isClosed())await currentPage.screenshot({path:'e2e-failure.png',fullPage:true}).catch(()=>{});
  throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
