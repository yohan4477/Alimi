import test from 'node:test';import assert from 'node:assert/strict';
import {activeRun,advanceRun,switchRun,rememberAnswer,availableCharacterIds,LEGACY_CHARACTER_IDS} from '../web/beauty-play/play-progress.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
test('legacy sessions exclude unsupported new characters; explicit capabilities only add known IDs',()=>{
 const all=[...LEGACY_CHARACTER_IDS,'school_photo_friend','school_last_minute_friend'];
 assert.deepEqual(availableCharacterIds({},all),LEGACY_CHARACTER_IDS);
 assert.deepEqual(availableCharacterIds({supportedCharacterIds:[...all,'injected']},all),all);
 assert.deepEqual(availableCharacterIds({supportedCharacterIds:[]},all),[]);
});
test('reload and direct URL changes keep one active scenario until it is answered',()=>{
 const storage=memory(),scope=crypto.randomUUID(),a=activeRun(['mona','pearl'],'mona',scope,storage);
 assert.deepEqual(activeRun(['mona','pearl'],'pearl',scope,storage),a);
 assert.throws(()=>advanceRun(a,['mona','pearl'],scope,storage),/Answer/);
 rememberAnswer('mona',{play:crypto.randomUUID(),product:'x'},scope,storage);
 assert.throws(()=>advanceRun(a,['mona','pearl'],scope,storage),/Answer/,'an answer from another play does not count');
 rememberAnswer('mona',{play:a.play,product:'x'},scope,storage);
 const b=advanceRun(a,['mona','pearl'],scope,storage);
 assert.equal(b.character,'pearl');assert.notEqual(b.play,a.play);assert.equal(b.shared,false);
 assert.throws(()=>advanceRun(b,['mona','pearl'],scope,storage),/Answer/);
});
test('sharing is not required, and unanswered paintings come first',()=>{
 const storage=memory(),scope=crypto.randomUUID(),ids=['mona','pearl','venus'];
 rememberAnswer('pearl',{play:crypto.randomUUID(),product:'y'},scope,storage);
 const a=activeRun(ids,'mona',scope,storage);rememberAnswer('mona',{play:a.play,product:'x'},scope,storage);
 assert.equal(advanceRun(a,ids,scope,storage).character,'venus');
});
test('answers in invitation or test scopes do not unlock live runs',()=>{
 const storage=memory(),scope=crypto.randomUUID(),a=activeRun(['mona'],'mona',scope,storage),b=activeRun(['mona'],'mona',scope+':invite',storage);
 rememberAnswer('mona',{play:b.play,product:'x'},scope+':invite',storage);
 assert.throws(()=>advanceRun(a,['mona'],scope,storage),/Answer/);
});
test('swiping moves in order, wraps around, and reopens an answered painting in its own play',()=>{
 const storage=memory(),scope=crypto.randomUUID(),ids=['mona','pearl','venus'],a=activeRun(ids,'mona',scope,storage);
 const next=switchRun(a,ids,1,scope,storage);assert.equal(next.character,'pearl');assert.notEqual(next.play,a.play);
 assert.equal(switchRun(a,ids,-1,scope,storage).character,'venus');
 rememberAnswer('pearl',{play:next.play,product:'x'},scope,storage);
 assert.equal(switchRun(a,ids,1,scope,storage).play,next.play);
});
test('storage denial still permits answering and the next scenario on the same page',()=>{
 const storage={getItem(){throw Error()},setItem(){throw Error()}},scope=crypto.randomUUID();const a=activeRun(['mona','pearl'],'mona',scope,storage);rememberAnswer('mona',{play:a.play,product:'x'},scope,storage);assert.equal(advanceRun(a,['mona','pearl'],scope,storage).character,'pearl');
});
