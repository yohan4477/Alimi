import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {responseCount,itemCount,SAVE_ERROR,gameEntryUrl} from '../web/beauty-play/locale-feedback.js';
const dict=JSON.parse(readFileSync(new URL('../web/beauty-play/translations.json',import.meta.url)));
const page=readFileSync(new URL('../web/beauty-play/page.tsx',import.meta.url),'utf8');
test('dynamic count labels render completely in either language',()=>{
 for(const count of [0,1,3,120])for(const lang of ['ko','en']){
  const html=renderToStaticMarkup(React.createElement('span',null,responseCount(count,lang),' · 75%'));
  assert.equal(html,`<span>${count}${lang==='en'?' responses':'건'} · 75%</span>`);
  assert.equal(renderToStaticMarkup(React.createElement('span',null,itemCount(count,lang))),`<span>${count}${lang==='en'?' items':'개'}</span>`);
 }
 assert.doesNotMatch(page,/\{[xr]\.n\}건/);
 assert.match(page,/responseCount\(x\.n,lang\)/);assert.match(page,/responseCount\(r\.n,lang\)/);
});
test('save failure uses a localizable app message, never raw server or browser diagnostics',()=>{
 assert.equal(dict.en[SAVE_ERROR],'Could not save your choice. Please try again.');
 assert.match(page,/catch\{setError\(SAVE_ERROR\);\}/);
 assert.doesNotMatch(page,/setError\(\(e as Error\)\.message\)/);
 assert.equal(dict.en['연결을 확인해 주세요.'],'Please check your connection.');
});
test('all landing game entry paths preserve explicit test mode and locale only',()=>{
 for(const lang of ['ko','en'])for(const search of ['', '?test=0', '?test=1&invite=private&other=ignored']){
  const u=new URL(gameEntryUrl('mona',lang,search),'https://example.test');
  assert.equal(u.pathname,'/beauty-play/');assert.equal(u.searchParams.get('character'),'mona');
  assert.equal(u.searchParams.get('lang'),lang);assert.equal(u.searchParams.get('pilot'),'1');
  assert.equal(u.searchParams.get('test'),search.includes('test=1')?'1':null);
  assert.equal(u.searchParams.has('invite'),false);assert.equal(u.searchParams.has('other'),false);
 }
 const landing=readFileSync(new URL('../web/beauty-play/landing.tsx',import.meta.url),'utf8');
 assert.match(landing,/location.href=gameEntryUrl\(id,lang,location.search\)/);
 assert.doesNotMatch(landing,/className="pilot-cards"/);
 assert.match(landing,/availableCharacterIds/);
 assert.match(landing,/activeRun/);
});
