import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const logo='<img className="game-brand-logo" src="/assets/seoul-beauty-logo.webp" alt="Seoul Beauty" width="398" height="120"/>';

test('both game entry headers use the existing accessible brand asset',()=>{
 const landing=read('web/beauty-play/landing.tsx'),game=read('web/beauty-play/page.tsx');
 assert.ok(landing.includes('<a href="/beauty-play/">'+logo+'</a>'));
 assert.ok(game.includes('<a className="brand" href={pilot?"/beauty-play/":"/"}>'+logo+'<span>Beauty is personal. Let’s talk.</span></a>'));
 assert.ok(game.includes('<footer className="site-footer"><strong>서울뷰티</strong>'));
 const asset=readFileSync(new URL('../dist/assets/seoul-beauty-logo.webp',import.meta.url));
 assert.equal(asset.toString('ascii',0,4),'RIFF');
 assert.equal(asset.toString('ascii',8,12),'WEBP');
});

test('brand styling preserves proportions and reduces width for narrow screens',()=>{
 const css=read('web/beauty-play/game.css');
 assert.match(css,/\.game-brand-logo\{display:block;width:144px;max-width:100%;height:auto\}/);
 assert.match(css,/@media\(max-width:650px\)\{\.game-brand-logo\{width:112px\}\}/);
});

test('existing browser CI covers loaded logos in both locales and narrow headers',()=>{
 const e2e=read('e2e/beauty-first-choice.e2e.mjs');
 assert.ok(e2e.includes("for(const width of [320,390])for(const lang of ['ko','en'])"));
 assert.ok(e2e.includes("header:'.play-top'"));
 assert.ok(e2e.includes("header:'.pilot-top'"));
 assert.ok(e2e.includes('img.naturalWidth>0'));
 assert.ok(e2e.includes('geometry.naturalRatio'));
 assert.ok(e2e.includes("await noHorizontalOverflow(page,label)"));
 assert.ok(read('.github/workflows/web.yml').includes('node e2e/beauty-first-choice.e2e.mjs'));
});
