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
  for(const name of ['전략','서비스 기획','디자인 리뷰','개발','실행 로드맵','관리 대시보드']) {
    await page.getByRole('tab',{name,exact:true}).click();assert.equal(await page.locator('[role="tabpanel"]:visible').count(),1);
    assert.equal(await page.getByRole('tab',{name,exact:true}).getAttribute('aria-selected'),'true');
  }

  // Developer board: priority × platform filtering, links and tab jumps are presentational.
  await page.getByRole('tab',{name:'개발',exact:true}).click();
  const development=page.locator('#sb-dev');
  await development.locator(':scope > details > summary').click();
  assert.equal(await development.locator('[data-dev-item]:visible').count(),10);
  await development.locator('[data-dev-filter="priority"][data-dev-value="P0"]').click();
  assert.equal(await development.locator('[data-dev-item]:visible').count(),6);
  await development.locator('[data-dev-filter="platform"][data-dev-value="ios"]').click();
  assert.equal(await development.locator('[data-dev-item]:visible').count(),3);
  await development.locator('[data-dev-filter="priority"][data-dev-value="P1"]').click();
  assert.equal(await development.locator('[data-dev-item]:visible').count(),4);
  await development.locator('[data-dev-filter="platform"][data-dev-value="backend"]').click();
  assert.equal(await development.locator('[data-dev-item]:visible').count(),0);
  assert.equal(await development.locator('#sb-dev-empty').isVisible(),true);
  await development.locator('[data-dev-filter="priority"][data-dev-value="all"]').click();
  await development.locator('[data-dev-filter="platform"][data-dev-value="all"]').click();
  assert.equal(await development.locator('[data-dev-item]:visible').count(),10);
  for (const width of [320,390,1024]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'developer board overflows at '+width);
  }
  await page.setViewportSize({width:390,height:844});
  await development.locator('[data-dev-jump="sb-plan-tab"]').click();
  assert.equal(await page.getByRole('tab',{name:'서비스 기획',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:'개발',exact:true}).click();
    await page.getByRole('tab',{name:'전략',exact:true}).click();await page.getByRole('tab',{name:'전략',exact:true}).press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'서비스 기획',exact:true}).getAttribute('aria-selected'),'true');
  // New pixel-character onboarding is a local admin-only simulation, not a customer signup.
  assert.equal(await page.locator('#sb-planning-review').getAttribute('src'),null,'collapsed historical preview does not start a request');
  await page.locator('#sb-plan > details > summary').click();
  assert.equal(await page.locator('#sb-planning-review').getAttribute('src'),null,'nested preview stays unloaded until explicitly opened');
  const guide = page.locator('#sb-pixel-guide-demo');
  await guide.waitFor();
  assert.equal(await guide.locator('[data-guide-locale="ko"][data-guide-stage="0"]').isVisible(),true);
  const sprite=guide.locator('img');
  await sprite.scrollIntoViewIfNeeded();
  await sprite.evaluate(img=>img.decode());
  assert.ok(await sprite.evaluate(img=>img.complete&&img.naturalWidth>0),'pixel guide asset resolves');
  assert.equal((await page.request.get(base+'/assets/hanbok-guide-pixel.svg')).status(),200);
  await guide.locator('[data-guide-locale="ko"][data-guide-stage="0"] [data-guide-interest="skin"]').click();
  await guide.locator('[data-guide-locale="ko"][data-guide-stage="0"] [data-guide-interest="makeup"]').click();
  await guide.locator('#sb-guide-next').click();
  assert.ok(await guide.locator('[data-guide-locale="ko"][data-guide-stage="1"] [data-guide-group="skin"]').isVisible());
  assert.ok(await guide.locator('[data-guide-locale="ko"][data-guide-stage="1"] [data-guide-group="makeup"]').isVisible());
  await guide.locator('[data-guide-locale="ko"][data-guide-stage="1"] [data-guide-concern="skin_acne"]').click();
  await guide.locator('[data-guide-lang="en"]').click();
  assert.ok(await guide.locator('[data-guide-locale="en"][data-guide-stage="1"]').isVisible());
  assert.ok(await guide.locator('[data-guide-locale="ko"][data-guide-stage="1"]').isHidden());
  assert.equal(await guide.locator('[data-guide-locale="en"][data-guide-stage="1"] [data-guide-concern="skin_acne"]').getAttribute('aria-pressed'),'true');
  await guide.locator('[data-guide-locale="en"][data-guide-stage="1"] [data-guide-concern="makeup_tint"]').click();
  await guide.locator('#sb-guide-next').click();
  assert.ok(await guide.locator('[data-guide-locale="en"][data-guide-stage="2"] [data-guide-room="skin"]').isVisible());
  assert.ok(await guide.locator('[data-guide-locale="en"][data-guide-stage="2"] [data-guide-room="makeup"]').isVisible());
  await guide.locator('#sb-guide-back').click();
  assert.ok(await guide.locator('[data-guide-locale="en"][data-guide-stage="1"]').isVisible());
  await guide.locator('#sb-guide-skip').click();
  assert.ok(await guide.locator('[data-guide-locale="en"][data-guide-stage="2"] [data-guide-room="generic"]').isVisible());
  assert.ok(await guide.locator('[data-guide-locale="en"][data-guide-stage="2"] [data-guide-room="skin"]').isHidden());
  await guide.locator('#sb-guide-next').click();
  assert.ok(await guide.locator('[data-guide-locale="en"][data-guide-stage="0"]').isVisible());
  for (const width of [320,390,1024]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`pixel-guide page has no horizontal overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await guide.locator('[data-guide-lang="ko"]').click();
  await page.getByText('기존 기획 설명 보기',{exact:true}).click();
  await page.getByText('대화 · 익명으로 묻고 답하기',{exact:true}).click();assert.ok(await page.getByText('사진형 프로필은 필수로 두지 않는 안을 우선 검토',{exact:true}).isVisible());
  await page.getByText('관심 분야·고민 복수 선택 인터랙티브 시안과 기존 화면 보기',{exact:true}).click();
  const preview=page.frameLocator('#sb-planning-review');
  await preview.locator('#sb-onboard-phone').waitFor();
  await page.waitForFunction(()=>document.querySelector('#sb-planning-review').previousElementSibling.textContent==='');
  await preview.locator('[data-onboard-group="skin"]').click();
  await preview.locator('[data-onboard-group="makeup"]').click();
  assert.equal(await preview.locator('[data-onboard-group="skin"]').getAttribute('aria-pressed'),'true');
  assert.equal(await preview.locator('[data-onboard-group="makeup"]').getAttribute('aria-pressed'),'true');
  await preview.locator('[data-onboard-step="1"]').click();
  await preview.locator('[data-onboard-concern="acne"]').click();
  await preview.locator('[data-onboard-concern="cushion"]').click();
  assert.equal(await preview.locator('[data-onboard-concern="acne"]').getAttribute('aria-pressed'),'true');
  assert.equal(await preview.locator('[data-onboard-concern="cushion"]').getAttribute('aria-pressed'),'true');
  await preview.locator('[data-onboard-lang="en"]').click();
  assert.equal(await preview.locator('[data-onboard-concern="acne"]').getAttribute('aria-pressed'),'true');
  await preview.locator('[data-onboard-lang="ko"]').click();
  await preview.locator('[data-onboard-step="2"]').click();
  assert.ok(await preview.getByText('트러블 피부의 베이스 메이크업',{exact:false}).isVisible());
  await preview.locator('[data-onboard-create]').click();
  await preview.locator('[data-onboard-room-title]').fill('자유로운 K-뷰티 이야기');
  await preview.locator('[data-onboard-save-room]').click();
  assert.ok(await preview.getByText('자유로운 K-뷰티 이야기',{exact:false}).first().isVisible());
  await preview.locator('[data-onboard-room="demo-1"]').click();
  assert.ok(await preview.getByText('이 방은 기획 시안에서만 열립니다.',{exact:false}).isVisible());
  await page.getByRole('tab',{name:'디자인 리뷰',exact:true}).click();
  await page.locator('#sb-design > details > summary').click();
  assert.ok(await page.getByText('맞춤 추천을 추가하되,',{exact:false}).first().isVisible());
  assert.equal(await page.locator('#sb-design [data-design-priority]:visible').count(),8);
  // Loading preview reuses launch assets; costume/avatar controls are gone.
  const loader = page.locator('#sb-loading-design-review');
  await loader.scrollIntoViewIfNeeded();
  await loader.locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode())));
  assert.equal(await loader.locator('[data-loader-next]').count(),0);
  assert.equal(await loader.locator('img[src="/assets/splash-photo.webp"]').count(),1);
  assert.equal(await loader.locator('img[src="/assets/seoul-beauty-logo.webp"]').count(),1);
  await page.locator('#sb-design [data-design-filter="P0"]').click();
  assert.equal(await page.locator('#sb-design [data-design-priority]:visible').count(),4);
  await page.locator('#sb-design [data-design-filter="P1"]').click();
  assert.equal(await page.locator('#sb-design [data-design-priority]:visible').count(),4);
  await page.locator('#sb-design [data-design-filter="all"]').click();
  await page.locator('#sb-design [data-design-lang="en"]').click();
  assert.ok(await page.locator('#sb-design [data-design-locale="en"]').first().isVisible());
  assert.ok(await page.locator('#sb-design [data-design-locale="ko"]').first().isHidden());
  await page.locator('#sb-design [data-design-lang="ko"]').click();
  assert.ok(await page.locator('#sb-design [data-design-locale="ko"]').first().isVisible());
  await mkdir('artifacts',{recursive:true});
  await page.getByRole('tab',{name:'디자인 리뷰',exact:true}).click();
  for(const width of [320,390,1024]) {
    await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/admin-mobile.png',fullPage:true});
  await page.setViewportSize({width:1024,height:900});await page.screenshot({path:'artifacts/admin-desktop.png',fullPage:true});
  // An expired/failed preview must recover explicitly instead of showing a blank loading frame.
  await page.route('**/api/admin?view=planning-review', route=>route.fulfill({status:401,contentType:'text/html',body:'<main>Session expired</main>'}));
  await page.reload();
  await page.getByRole('tab',{name:'서비스 기획',exact:true}).click();
  await page.locator('#sb-plan > details > summary').click();
  await page.getByText('관심 분야·고민 복수 선택 인터랙티브 시안과 기존 화면 보기',{exact:true}).click();
  await page.getByText('시안을 열 수 없습니다. 로그인 상태를 확인하세요.',{exact:false}).waitFor();
  assert.equal(await page.locator('#sb-planning-review').getAttribute('src'),null);
  assert.ok(await page.getByRole('button',{name:'다시 불러오기',exact:true}).isVisible());
  revoked=true;r=await page.reload();assert.equal(r.status(),403);assert.equal(await page.locator('[role="tab"]').count(),0);
  revoked=false;await login('admin@example.test');
  await Promise.all([page.waitForNavigation(),page.getByRole('button',{name:'로그아웃',exact:true}).click()]);assert.equal(await page.locator('[role="tab"]').count(),0);
  r=await page.goto(base+'/api/admin');assert.equal(r.status(),401);
  assert.ok(authCalls.filter(x=>x.endsWith('/user')).length>=4);assert.deepEqual(errors,[]);
  console.log('ok - anonymous/direct URL/regular account denied; admin tabs, keyboard, mobile widths, role revocation and logout (mocked Auth)');
} finally {if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
