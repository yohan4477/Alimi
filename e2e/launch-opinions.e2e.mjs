// Browser UI coverage with mocked backend. Not real Google OAuth or production DB verification.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const base=process.argv[2]??'http://127.0.0.1:3000/';
try {
 for(const [lang,width] of [['ko',390],['en',320]]) {
  const ctx=await browser.newContext({viewport:{width,height:844}}),page=await ctx.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/**',r=>{if(r.request().method()!=='GET'&&!r.request().url().includes('app_events'))writes.push(r.request().url());return r.fulfill({json:[]})});
  await page.goto(base+'us?lang='+lang);
  await page.locator('#tabbar [data-screen="saved"]').click();
  await page.locator('[data-activity-profile]').click();await page.locator('[data-activity-opinions]').click();
  const ob=page.locator('#onboarding');
  await ob.locator('[data-onb-opinion="want_to_try"]').click();
  assert.equal(await ob.locator('[data-onb-opinion="want_to_try"]').getAttribute('aria-pressed'),'true');
  await ob.locator('[data-onb="brand-next"]').click();await ob.locator('[data-onb-opinion="tried_liked"]').click();
  await ob.locator('[data-onb="brand-skip"]').click();
  assert.equal(await ob.locator('li').count(),2);assert.equal(await ob.locator('[data-onb="save-google"]').count(),1);
  await ob.locator('[data-onb="back"]').click();assert.equal(await ob.locator('[data-onb-opinion="want_to_try"]').getAttribute('aria-pressed'),'true');
  await ob.locator('[data-onb="brand-skip"]').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'/tmp/seoulbeauty-opinion-'+lang+'.png'});
  await ob.locator('[data-onb="explore"]').click();assert.equal(await ob.isHidden(),true);
  await page.reload();assert.equal(await ob.isHidden(),true,'survey remains optional on revisit');
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('seoulbeauty-opinions-v1'))).length),2);
  // Cancelled OAuth callback preserves the guest snapshot, without creating a fake session.
  await page.goto(base+'us?lang='+lang+'&error=access_denied');
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('seoulbeauty-opinions-v1'))).length),2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('alimi-auth-session-v1')),null);
  assert.deepEqual(writes,[],'guest opinions must never write public or account records');assert.deepEqual(errors,[]);
  await ctx.close();
 }
 console.log('PASS: optional brand answers → own summary → edit/skip/explore, reload and cancelled OAuth preservation, ko/en 320/390px, no guest writes. Mocked REST.');
}finally{await browser.close();}
