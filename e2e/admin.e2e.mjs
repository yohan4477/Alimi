import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createAdminHandler} from '../api/admin.js';
import {createLocalServer} from '../scripts/dev-server.mjs';

// Auth is injected only into this local test server. Production never accepts a mock header/flag.
const env={NODE_ENV:'test',ADMIN_ORIGIN:'http://127.0.0.1'};
let revoked=false;const authCalls=[];
const fetchImpl=async(url,options={})=>{
  authCalls.push(url);
  if(url.includes('/token')) {
    const {email,password}=JSON.parse(options.body);
    if(password!=='test-only-password') return new Response('{}',{status:400});
    return Response.json({access_token:email==='admin@example.test'?'admin.signed.test':'regular.signed.test',expires_in:3600});
  }
  if(url.includes('/logout')) return new Response(null,{status:204});
  const admin=options.headers.Authorization==='Bearer admin.signed.test'&&!revoked;
  return Response.json({id:'test-user',email_confirmed_at:'2026-10-19T00:00:00Z',is_anonymous:false,app_metadata:{seoulbeauty_admin:admin},user_metadata:{seoulbeauty_admin:true}});
};
const server=createLocalServer({adminHandler:createAdminHandler({fetchImpl,env})});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;env.ADMIN_ORIGIN=base;
let browser;
try {
  browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let r=await page.goto(base+'/admin');assert.equal(r.status(),401);assert.equal(await page.locator('[role="tab"]').count(),0);
  assert.equal((await page.request.get(base+'/api/admin')).status(),401);
  for(const path of ['/server/admin-page.html','/admin.html','/server/admin-auth.js'])assert.equal((await page.request.get(base+path)).status(),404);
  async function login(email) {
    await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill('test-only-password');
    await Promise.all([page.waitForNavigation(),page.getByRole('button',{name:'로그인',exact:true}).click()]);
  }
  await login('regular@example.test');assert.match(await page.locator('[role="status"]').innerText(),/관리자 접근 권한/);assert.equal(await page.locator('[role="tab"]').count(),0);
  await login('admin@example.test');await page.getByRole('tab',{name:'전략',exact:true}).waitFor();
  const cookies=await page.context().cookies();const session=cookies.find(c=>c.name==='__Host-sb-admin');assert.ok(session?.httpOnly&&session.secure&&session.sameSite==='Strict');
  assert.equal(await page.evaluate(()=>document.cookie.includes('__Host-sb-admin')),false);
  for(const name of ['전략','서비스 기획','실행 로드맵','관리 대시보드']) {
    await page.getByRole('tab',{name,exact:true}).click();assert.equal(await page.locator('[role="tabpanel"]:visible').count(),1);
    assert.equal(await page.getByRole('tab',{name,exact:true}).getAttribute('aria-selected'),'true');
  }
  await page.getByRole('tab',{name:'전략',exact:true}).click();await page.getByRole('tab',{name:'전략',exact:true}).press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'서비스 기획',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByText('대화 · 익명으로 묻고 답하기',{exact:true}).click();assert.ok(await page.getByText('사진형 프로필은 필수로 두지 않는 안을 우선 검토',{exact:true}).isVisible());
  await mkdir('artifacts',{recursive:true});
  await page.getByRole('tab',{name:'관리 대시보드',exact:true}).click();
  for(const width of [320,390,1024]) {
    await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/admin-mobile.png',fullPage:true});
  await page.setViewportSize({width:1024,height:900});await page.screenshot({path:'artifacts/admin-desktop.png',fullPage:true});
  revoked=true;r=await page.reload();assert.equal(r.status(),403);assert.equal(await page.locator('[role="tab"]').count(),0);
  revoked=false;await login('admin@example.test');
  await Promise.all([page.waitForNavigation(),page.getByRole('button',{name:'로그아웃',exact:true}).click()]);assert.equal(await page.locator('[role="tab"]').count(),0);
  r=await page.goto(base+'/api/admin');assert.equal(r.status(),401);
  assert.ok(authCalls.filter(x=>x.endsWith('/user')).length>=4);assert.deepEqual(errors,[]);
  console.log('ok - anonymous/direct URL/regular account denied; admin tabs, keyboard, mobile widths, role revocation and logout (mocked Auth)');
} finally {if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
