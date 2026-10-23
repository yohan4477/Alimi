import test from 'node:test';import assert from 'node:assert/strict';
import {activeRun,advanceRun,markRunShared,availableCharacterIds,LEGACY_CHARACTER_IDS} from '../web/beauty-play/play-progress.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
test('legacy sessions exclude unsupported new characters; explicit capabilities only add known IDs',()=>{
 const all=[...LEGACY_CHARACTER_IDS,'school_photo_friend','school_last_minute_friend'];
 assert.deepEqual(availableCharacterIds({},all),LEGACY_CHARACTER_IDS);
 assert.deepEqual(availableCharacterIds({supportedCharacterIds:[...all,'injected']},all),all);
 assert.deepEqual(availableCharacterIds({supportedCharacterIds:[]},all),[]);
});
test('reload and direct URL changes keep one active scenario until successful sharing',()=>{
 const storage=memory(),scope=crypto.randomUUID(),a=activeRun(['mona','pearl'],'mona',scope,storage);
 assert.deepEqual(activeRun(['mona','pearl'],'pearl',scope,storage),a);
 assert.throws(()=>advanceRun(a,['mona','pearl'],scope,storage),/Share/);
 assert.equal(markRunShared({...a,play:crypto.randomUUID()},true,scope,storage),false);
 markRunShared(a,true,scope,storage);const b=advanceRun(a,['mona','pearl'],scope,storage);
 assert.equal(b.character,'pearl');assert.notEqual(b.play,a.play);assert.equal(b.shared,false);
 assert.throws(()=>advanceRun(b,['mona','pearl'],scope,storage),/Share/);
});
test('answer edits relock progression; invitation and test scopes do not unlock live runs',()=>{
 const storage=memory(),scope=crypto.randomUUID(),a=activeRun(['mona'],'mona',scope,storage),b=activeRun(['mona'],'mona',scope+':invite',storage);
 markRunShared(b,true,scope+':invite',storage);assert.throws(()=>advanceRun(a,['mona'],scope,storage),/Share/);
 markRunShared(a,true,scope,storage);markRunShared(a,false,scope,storage);assert.throws(()=>advanceRun(a,['mona'],scope,storage),/Share/);
});
test('storage denial still permits same-page sharing and next scenario',()=>{
 const storage={getItem(){throw Error()},setItem(){throw Error()}},scope=crypto.randomUUID();const a=activeRun(['mona','pearl'],'mona',scope,storage);markRunShared(a,true,scope,storage);assert.equal(advanceRun(a,['mona','pearl'],scope,storage).character,'pearl');
});
