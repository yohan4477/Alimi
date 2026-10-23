import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomNextCharacter} from '../web/beauty-play/random-character.ts';
const ids=['mona','pearl','venus','madame','camille','ophelia'];
function session(){const values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};return values;}
test('six characters all appear before deck repeats',()=>{session();const seen=[];for(let i=0;i<6;i++)seen.push(randomNextCharacter(ids,seen.at(-1)));assert.equal(new Set(seen).size,6);});
test('current selection excluded but kept for later picks',()=>{const store=session();store.set('beauty-play-character-deck-v1',JSON.stringify({remaining:['mona','pearl','venus']}));const first=randomNextCharacter(ids,'mona');assert.notEqual(first,'mona');const remaining=JSON.parse(store.get('beauty-play-character-deck-v1')).remaining;assert.ok(remaining.includes('mona'));});
test('never immediately repeat when alternatives exist',()=>{session();let last='mona';for(let i=0;i<50;i++){const next=randomNextCharacter(ids,last);assert.notEqual(next,last);last=next;}});
test('malformed or stale storage is harmless',()=>{const store=session();store.set('beauty-play-character-deck-v1','not-json');assert.ok(ids.includes(randomNextCharacter(ids)));store.set('beauty-play-character-deck-v1',JSON.stringify({remaining:['removed','removed','mona']}));assert.ok(ids.includes(randomNextCharacter(ids)));});
