import test from 'node:test';
import assert from 'node:assert/strict';
import {recordFirstChoice} from '../web/beauty-play/first-choice.js';
import {readFileSync} from 'node:fs';
test('first active choice counts once per play using the existing backend step',()=>{const seen=new Set(),calls=[],event=(...a)=>calls.push(a);assert.equal(recordFirstChoice(seen,'',event),false);assert.equal(recordFirstChoice(seen,'a',event),true);assert.equal(recordFirstChoice(seen,'a',event),false);assert.equal(recordFirstChoice(seen,'b',event),true);assert.deepEqual(calls,[['game_start','selection'],['game_start','selection']]);});
test('both advice-first and legacy product-first choices are instrumented, not page load',()=>{const s=readFileSync(new URL('../web/beauty-play/page.tsx',import.meta.url),'utf8');assert.equal((s.match(/recordFirstChoice\(sentViews.current,play.current,event\)/g)||[]).length,2);assert.doesNotMatch(s,/event\('game_start'/);assert.match(s,/setAccountLinkEnabled\(sessionInfo.accountLinkEnabled===true\)/);});
