// Cross-device UI contract with isolated browser contexts and an owner-scoped fixture store.
// The mock is not a substitute for running the database RLS tests on staging.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const origin=new URL(process.argv[2]||'http://127.0.0.1:3000/').origin;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
const id='340c78fa-03ca-42f2-857e-f8b70a1a4654', key='seoulbeauty-game-draft-v1', cloud=new Map(), writes=[], errors=[];
async function device(owner){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(owner=>{
  localStorage.setItem('seoulbeauty-interests-v1',JSON.stringify({version:1,skincare:false,makeup:false,concerns:[],done:true}));
  if(owner)localStorage.setItem('alimi-auth-session-v1',JSON.stringify({access_token:owner,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600}));
 },owner);
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin)return route.continue();
  const token=req.headers().authorization?.replace('Bearer ','');
  if(url.pathname==='/auth/v1/user')return route.fulfill({json:{id:owner,email:owner+'@example.invalid',app_metadata:{provider:'google'}}});
  if(url.pathname.endsWith('/save_beauty_account_draft')){
   assert.equal(token,owner);const p=req.postDataJSON();writes.push(p);
   cloud.set(owner,{id:p.p_id,region:p.p_region,language:p.p_language,title:p.p_title,body:p.p_body,revision:1,expires_at:new Date(Date.now()+86400000).toISOString()});
   return route.fulfill({json:[{revision:1}]});
  }
  if(url.pathname.endsWith('/beauty_account_drafts')){
   assert.equal(token,owner);
   if(req.method()==='DELETE'){cloud.delete(owner);return route.fulfill({status:204});}
   return route.fulfill({json:cloud.has(owner)?[cloud.get(owner)]:[]});
  }
  if(url.pathname.endsWith('/app_events'))return route.fulfill({status:204});
  return route.fulfill({json:[]});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/us?lang=en&demo=0');
 return {context,page};
}
async function openAccountRecovery(page){
 await page.locator('#tabbar [data-screen="saved"]').click();
 await page.locator('#saved [data-screen="settings"]').click();
 await page.locator('[data-auth="drafts"]').click();
 await page.locator('#beauty-account-drafts[open]').waitFor();
}
try{
 const guest=await device(null);
 assert.equal(await guest.page.locator('[data-chat-action="beauty-account-list"]').count(),0,'no unconditional recovery CTA on home');
 await guest.page.locator('#tabbar [data-screen="saved"]').click();
 await guest.page.locator('#saved [data-screen="settings"]').click();
 assert.equal(await guest.page.locator('[data-auth="drafts"]').count(),0,'guest account section has no recovery action');
 const first=await device('fixture-owner');
 await first.page.evaluate(({key,id})=>sessionStorage.setItem(key,JSON.stringify({id,region:'us',language:'en',body:'Private account draft',createdAt:Date.now()})),{key,id});
 await first.page.goto(origin+'/us?lang=en&demo=0&beautyDraft='+id);
 await first.page.locator('[data-chat-action="beauty-account-save"]').waitFor();
 assert.equal(writes.length,0,'no implicit upload at arrival or sign-in');
 await first.page.locator('[data-chat-action="beauty-account-save"]').click();
 await first.page.waitForFunction(()=>document.body.innerText.includes('Saved privately for 30 days'));
 assert.equal(writes.length,1);assert.equal(cloud.get('fixture-owner').body,'Private account draft');
 assert.ok(!JSON.stringify(writes).includes('p_secret'),'anonymous chat secrets never enter cloud drafts');
 const second=await device('fixture-owner');
 assert.equal(await second.page.locator('[data-chat-action="beauty-account-list"]').count(),0,'signed-in home does not fetch or advertise unknown private drafts');
 assert.equal(await second.page.evaluate(key=>sessionStorage.getItem(key),key),null,'second device starts with no tab draft');
 await openAccountRecovery(second.page);
 await second.page.locator('[data-account-draft-restore]').click();
 await second.page.locator('.beauty-draft-text').waitFor();
 assert.equal(await second.page.locator('.beauty-draft-text').innerText(),'Private account draft');
 assert.equal(new URL(second.page.url()).searchParams.get('beautyDraft'),id);
 assert.equal(writes.length,1,'recovery never uploads again or publishes');
 assert.equal(await second.page.locator('#post-write[open]').count(),0);
 const other=await device('different-owner');
 await openAccountRecovery(other.page);
 await other.page.locator('#beauty-account-drafts[open]').waitFor();
 assert.equal(await other.page.locator('[data-account-draft-restore]').count(),0);
 assert.ok(!(await other.page.locator('#beauty-account-drafts').innerText()).includes('Private account draft'));
 await second.page.locator('[data-chat-action="beauty-account-list"]').click();
 await second.page.locator('[data-account-draft-delete]').click();
 await second.page.waitForFunction(()=>document.querySelector('#beauty-account-drafts')?.innerText.includes('No saved drafts'));
 assert.equal(cloud.has('fixture-owner'),false);
 assert.equal(await second.page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).body,key),'Private account draft','cloud deletion does not destroy an open tab draft');
 assert.deepEqual(errors,[]);
 console.log('ok - explicit cloud save, isolated-device restore, account isolation fixture, deletion, no publication');
}finally{await browser.close();}
