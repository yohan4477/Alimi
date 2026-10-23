import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');

test('the physical deployment index is sample even when hosting serves it before rewrites',()=>{
 // Read the deployed artifact directly. Do not use the dev server or staticEntryPath.
 const index=read('dist/index.html');
 assert.match(index,/<script type="module" src="public-entry\.js"><\/script>/);
 assert.doesNotMatch(index,/visitor-entry\.js|src="app\.js"|id="browse"/);
 assert.equal(index,read('dist/sample.html'),'the direct sample.html alias serves the same isolated entry');
});

test('actual service shell is separate and only live rewrites target it',()=>{
 const live=read('dist/live.html'),config=JSON.parse(read('vercel.json'));
 assert.match(live,/<script type="module" src="visitor-entry\.js"><\/script>/);
 assert.doesNotMatch(live,/public-entry\.js|sample-app\.js/);
 assert.equal(config.outputDirectory,'dist');
 assert.equal(config.rewrites.some(rule=>rule.source==='/'),false,'root must not depend on rewrite ordering');
 for(const url of ['/live','/live/'])assert.equal(config.rewrites.find(rule=>rule.source===url)?.destination,'/live.html');
 for(const url of ['/kr','/kr/','/us','/us/'])assert.equal(config.rewrites.find(rule=>rule.source===url)?.destination,'/sample.html');
 assert.deepEqual(config.rewrites.filter(rule=>rule.destination==='/live.html').map(rule=>rule.source),['/live','/live/']);
});

test('browser isolation fixture exercises the physical root index rather than hiding it behind the dev mapper',()=>{
 const source=read('e2e/sample-live-boundary.e2e.mjs');
 assert.match(source,/url\.pathname === '\/' \? '\/index\.html' : staticEntryPath/);
});
