import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadingMarkup} from '../dist/loading-companion.js';

test('loader uses localized text, escapes markup, and hides pixel costumes from assistive tech', () => {
  const html = loadingMarkup('<img src=x onerror=alert(1)> 한국어');
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; 한국어/);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(loadingMarkup('Finding conversations'), /Finding conversations/);
});

test('outfit start index alternates across separate waits without revealing any names', () => {
  const samples = Array.from({length:10}, () => loadingMarkup('Loading'));
  const positions = new Set(samples.map(html => {
    const x = html.match(/--sb-static-x:(-?\d+)px/)?.[1];
    const y = html.match(/--sb-static-y:(-?\d+)px/)?.[1];
    return [x,y].join(',');
  }));
  assert.equal(positions.size, 10);
  assert.ok(samples.every(html => !/WONI|JENNIE|ZENA|WONYOUNG|MINAMI/.test(html)));
});

test('10-character sprite is bundled once, compressed and identical for web and native iOS', async () => {
  const web = await readFile(new URL('../dist/assets/loading-characters.svg', import.meta.url), 'utf8');
  const native = await readFile(new URL('../ios/Alimi/PixelLoadingView.swift', import.meta.url), 'utf8');
  const webBase64 = web.match(/data:image\/png;base64,([^"]+)/)?.[1];
  const nativeBase64 = native.match(/static let encoded = "([^"]+)"/)?.[1];
  assert.ok(webBase64 && nativeBase64, 'both platforms include an actual character atlas');
  assert.equal(webBase64, nativeBase64, 'both platforms use the same 10 outfits');
  const atlas = Buffer.from(webBase64, 'base64');
  assert.ok(atlas.length < 10_000, 'character atlas stays small for mobile');
  assert.equal(atlas.subarray(1,4).toString(), 'PNG');
  assert.equal(atlas.readUInt32BE(16), 180); // 5 columns × 36 source pixels
  assert.equal(atlas.readUInt32BE(20), 108); // 2 rows × 54 source pixels
});

test('web and iOS show characters only after 400ms, rotate every 2.2s, honor motion reduction', async () => {
  const css = await readFile(new URL('../dist/style.css', import.meta.url), 'utf8');
  const adminCSS = await readFile(new URL('../dist/admin.css', import.meta.url), 'utf8');
  const native = await readFile(new URL('../ios/Alimi/PixelLoadingView.swift', import.meta.url), 'utf8');
  const wrapper = await readFile(new URL('../ios/Alimi/LoadingCompanion.swift', import.meta.url), 'utf8');
  assert.match(css, /sb-sprite-appear \.01s linear \.4s/);
  assert.match(css, /sb-sprite-change 22s/); // 10 frames × 2.2sec
  assert.match(css, /loading-characters\.svg/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /background-position:-192px -72px/);
  assert.match(adminCSS, /loading-characters\.svg/);
  assert.match(native, /\.milliseconds\(400\)/);
  assert.match(native, /\.milliseconds\(2200\)/);
  assert.match(native, /accessibilityReduceMotion/);
  assert.match(native, /scenePhase == \.active/);
  assert.match(wrapper, /PixelLoadingView\(compact: compact, message: message\)/);
});
