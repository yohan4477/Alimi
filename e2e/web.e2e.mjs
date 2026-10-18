// Browser smoke test for the web app against the live public API. Run in CI on every web change:
//   node e2e/web.e2e.mjs http://localhost:3000/
// Fails on JS errors, an empty catalog, wrong category filtering or missing photos in the favorites view.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:3000/';
const withLang = l => { const u = new URL(base); u.searchParams.set('lang', l); return u.href; };
const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 390, height: 844}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/rest/v1/app_events', r => r.fulfill({status: 201, body: ''})); // keep test traffic out of metrics
const step = async (name, fn) => { await fn(); console.log('ok -', name); };

try {
  await page.goto(withLang('ko')); // flows below assert the Korean copy
  await step('tracked products and first catalog page render without scrolling', async () => {
    await page.waitForSelector('#products > .card', {timeout: 20000});
    await page.waitForSelector('.catalog-grid .card', {timeout: 20000});
    assert.equal(await page.locator('.catalog-grid .card').count(), 24);
  });
  await step('scrolling loads the next catalog page', async () => {
    await page.mouse.wheel(0, 8000);
    await page.waitForFunction(() => document.querySelectorAll('.catalog-grid .card').length >= 48, null, {timeout: 15000});
  });
  await step('category tab filters tracked and catalog items', async () => {
    await page.click('[data-category="립"]');
    await page.waitForFunction(() => document.querySelectorAll('.catalog-grid .card').length > 0, null, {timeout: 15000});
    const metas = await page.locator('.catalog-grid .card .meta').allTextContents();
    assert.ok(metas.every(m => m.startsWith('립')), 'catalog under 립 must be 립');
    const tracked = await page.locator('#products > .card .product-name').allTextContents();
    assert.ok(tracked.length > 0 && !tracked.some(n => /Essence|Serum/.test(n)), 'tracked under 립 must not include essence/serum');
  });
  await step('a product family opens its sizes / options with prices', async () => {
    await page.click('[data-category="클렌징"]');
    const card = page.locator('.catalog-grid .card', {hasText: '옵션'}).first();
    await card.waitFor({timeout: 15000});
    await card.locator('button').click();
    await page.waitForSelector('#family-body .variant-row', {timeout: 10000});
    const rows = await page.locator('#family-body .variant-row').allInnerTexts();
    assert.ok(rows.length >= 2, 'family with options lists at least two variants');
    assert.ok(rows.every(r => /\$\d/.test(r)), 'every variant shows a price');
    await page.click('#family-dialog .close-dialog');
  });
  await step('favorite shows up in the favorites view with a loaded photo', async () => {
    await page.click('[data-category="전체"]');
    const heart = page.locator('#products > .card .heart').first();
    await heart.click();
    await page.click('nav [data-view="saved"]');
    await page.waitForSelector('#products > .card img', {timeout: 10000});
    await page.waitForFunction(() => [...document.querySelectorAll('#products > .card img')].every(i => i.complete && i.naturalWidth > 0), null, {timeout: 20000});
  });
  await step('English UI for US users', async () => {
    await page.goto(withLang('en'));
    await page.waitForSelector('.catalog-grid .card', {timeout: 20000});
    assert.equal(await page.textContent('#list-title'), 'Watching prices');
    assert.ok((await page.locator('#categories .chip').allTextContents()).includes('Sun care'));
    assert.match(await page.textContent('.notice'), /Official Stylevana US prices/);
    assert.equal(await page.locator('text=/[가-힣]/').count(), 0, 'no Korean text in the English UI');
  });
  assert.deepEqual(errors, [], 'no JavaScript errors');
  console.log('web e2e passed');
} catch (e) {
  await page.screenshot({path: 'e2e-failure.png', fullPage: true}).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
