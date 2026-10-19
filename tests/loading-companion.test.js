import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadingMarkup} from '../dist/loading-companion.js';

test('loading preserves escaped localized status with decorative launch images', () => {
  const html = loadingMarkup('<img src=x onerror=alert(1)> 한국어');
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; 한국어/);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(loadingMarkup('Finding conversations'), /Finding conversations/);
});

test('every loading render uses the original portrait and logo with no costume cycling', () => {
  const first = loadingMarkup('Loading');
  assert.equal(loadingMarkup('Loading'), first);
  assert.match(first, /assets\/splash-photo.webp/);
  assert.match(first, /assets\/seoul-beauty-logo.webp/);
  assert.doesNotMatch(first, /sprite|avatar-|loading-characters|sb-look-offset/);
});

test('native and web content loaders cannot render the former character atlas', async () => {
  const native = await readFile(new URL('../ios/Alimi/LoadingCompanion.swift', import.meta.url), 'utf8');
  const css = await readFile(new URL('../dist/style.css', import.meta.url), 'utf8');
  assert.match(native, /Image\("SplashPhoto"\)/);
  assert.match(native, /Image\("SeoulBeautyLogo"\)/);
  assert.match(native, /\.milliseconds\(400\)/);
  assert.doesNotMatch(native, /LoadingCharacters|TimelineView|LoadingOutfitSprite/);
  assert.doesNotMatch(css, /loading-characters-sprite|sb-sprite-change/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('admin loader preview follows the same launch artwork decision', async () => {
  const html = await readFile(new URL('../server/admin-page.html', import.meta.url), 'utf8');
  const section = html.match(/<section id="sb-loading-design-review"[\s\S]*?<\/section>/)[0];
  assert.match(section, /splash-photo.webp/);
  assert.match(section, /seoul-beauty-logo.webp/);
  assert.doesNotMatch(section, /data-loader-next|sb-design-loader-character/);
});
