import test from 'node:test';
import assert from 'node:assert/strict';
import {draftTokens,suggestDraftRooms} from '../dist/beauty-room-suggest.js';

test('draft matching ranks overlapping actual room titles ahead of others',()=>{
 const rooms=[{id:'a',title_en:'Sunscreen help',intro_en:'Daily SPF'},{id:'b',title_en:'Lip tint shades',intro_en:'Which shade is best?'},{id:'c',title_en:'Makeup chat'}];
 assert.deepEqual(suggestDraftRooms('I want lip tint shades',rooms).map(x=>x.room.id),['b']);
});
test('empty/unrelated text does not invent recommendations',()=>{
 assert.deepEqual(suggestDraftRooms('   ',[{id:1,title_en:'Lip'}]),[]);
 assert.deepEqual(suggestDraftRooms('eyeliner',[{id:1,title_en:'Lip'}]),[]);
});
test('room suggestions remain bounded, stable, and never mutate input',()=>{
 const rooms=Array.from({length:15},(_,i)=>({id:i,title_en:'Lip help'}));
 const before=JSON.stringify(rooms);
 assert.deepEqual(suggestDraftRooms('lip',rooms,{limit:3}).map(x=>x.room.id),[0,1,2]);
 assert.equal(JSON.stringify(rooms),before);
});
test('tokenizer handles Korean and filters generic words',()=>{
 assert.deepEqual(draftTokens('립스틱 립스틱 추천'),['립스틱']);
});
