import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../dist/journey.css',import.meta.url),'utf8');
const strings=JSON.parse(readFileSync(new URL('../dist/strings.json',import.meta.url),'utf8'));
test('hero aligns original portrait to headline padding and preserves only the Korean body break',()=>{
 const rules=css.slice(css.lastIndexOf('/* Align the existing portrait'));
 assert.match(rules,/padding-top:var\(--hero-copy-top\)/);
 assert.match(rules,/top:var\(--hero-copy-top\);bottom:auto;height:auto/);
 assert.match(rules,/width:46vw;max-width:230px;text-indent:0;white-space:normal/);
 assert.match(rules,/html:lang\(ko\) \.home-hero p\{white-space:pre-line\}/);
 assert.match(strings['home.hero.sub'].ko,/묻고,\n직접 써본/);
 assert.match(readFileSync(new URL('../dist/chat.js',import.meta.url),'utf8'),/assets\/seoul-beauty-model\.webp/);
});

test('header actions and bottom navigation retain consistent touch targets and single-line labels',()=>{
 assert.match(css,/\.sb-head \.sb-head-actions \.icon-btn\{flex:0 0 44px;min-width:44px;min-height:44px/);
 assert.match(css,/\.sb-head \.home-alerts svg\{position:relative;top:-1\.375px\}/);
 assert.match(css,/#tabbar button i\{display:block;line-height:14px;white-space:nowrap\}/);
});
