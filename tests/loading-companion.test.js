import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadingMarkup} from '../dist/loading-companion.js';

test('loading companion preserves localized status, escapes markup and hides artwork from assistive tech', () => {
  const html = loadingMarkup('<img src=x onerror=alert(1)> 한국어');
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; 한국어/);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(loadingMarkup('Finding conversations'), /Finding conversations/);
});

test('a different costume can start each separate real loading state', () => {
  const positions = new Set(Array.from({length: 10}, () => {
    const html = loadingMarkup('Loading');
    const x = html.match(/--sb-static-x:(-?\d+)px/)?.[1];
    const y = html.match(/--sb-static-y:(-?\d+)px/)?.[1];
    return x + ',' + y;
  }));
  assert.equal(positions.size, 10);
});

test('the ten-character atlas is tiny, transparently encoded and the same on web and iOS', async () => {
  const web = await readFile(new URL('../dist/assets/loading-characters-sprite.png', import.meta.url));
  const ios = await readFile(new URL('../ios/Alimi/Assets.xcassets/LoadingCharacters.imageset/loading-characters-sprite.png', import.meta.url));
  assert.deepEqual(web, ios);
  assert.ok(web.length < 10_000, 'keep the atlas small for mobile');
  assert.equal(web.subarray(1, 4).toString(), 'PNG');
  assert.equal(web.readUInt32BE(16), 160); // 5 columns × 32 px
  assert.equal(web.readUInt32BE(20), 96);  // 2 rows × 48 px
});

test('both web motion reduction and native loading delay are declared', async () => {
  const css = await readFile(new URL('../dist/style.css', import.meta.url), 'utf8');
  const native = await readFile(new URL('../ios/Alimi/LoadingCompanion.swift', import.meta.url), 'utf8');
  assert.match(css, /sb-loading-sprite/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /sb-sprite-change 22s/);
  assert.match(native, /\.milliseconds\(400\)/);
  assert.match(native, /accessibilityReduceMotion/);
  assert.match(native, /\.periodic\(from: \.now, by: 2\.2\)/);
});
