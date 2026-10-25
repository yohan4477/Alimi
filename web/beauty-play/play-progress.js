import {randomNextCharacter} from './random-character.ts';
export const LEGACY_CHARACTER_IDS=['mona','pearl','venus','madame','camille','ophelia'];
export function availableCharacterIds(session,allIds){
 const advertised=Array.isArray(session?.supportedCharacterIds)?session.supportedCharacterIds:LEGACY_CHARACTER_IDS;
 return [...new Set(advertised)].filter(id=>allIds.includes(id));
}
const volatile=new Map();
function browserStorage(){try{return globalThis.localStorage}catch{return undefined}}
const keyFor=scope=>'beauty-play-active-run-v1:'+scope;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function read(storage,scope){try{const value=storage.getItem(keyFor(scope));return value?JSON.parse(value):volatile.get(keyFor(scope))||null}catch{return volatile.get(keyFor(scope))||null}}
function write(storage,scope,run){volatile.set(keyFor(scope),run);try{storage.setItem(keyFor(scope),JSON.stringify(run))}catch{}return run}
export function persistRun(run,scope='live',storage=browserStorage()){return write(storage,scope,run)}
export function activeRun(ids,preferred,scope='live',storage=browserStorage()){
 if(!ids.length)throw Error('No supported characters');
 const saved=read(storage,scope);
 if(saved&&ids.includes(saved.character)&&uuid.test(saved.play))return {...saved,shared:saved.shared===true};
 return write(storage,scope,{character:ids.includes(preferred)?preferred:randomNextCharacter(ids),play:crypto.randomUUID(),shared:false});
}
export function markRunShared(run,shared,scope='live',storage=browserStorage()){
 const saved=read(storage,scope);
 if(!saved||saved.play!==run.play||saved.character!==run.character)return false;
 write(storage,scope,{...saved,shared:shared===true});
 const done=answerFor(saved.character,scope,storage);if(done&&done.play===run.play)rememberAnswer(saved.character,{shared:shared===true},scope,storage);
 return true;
}
// Last saved answer per painting on this device, so a finished painting reopens its result
// in the same play (answering again overwrites it instead of adding a second vote).
const answersKey=scope=>'beauty-play-answers-v1:'+scope;
function readAnswers(storage,scope){try{const raw=storage.getItem(answersKey(scope));if(raw){const all=JSON.parse(raw);if(all&&typeof all==='object')return all}}catch{}return volatile.get(answersKey(scope))||{}}
export function answerFor(character,scope='live',storage=browserStorage()){const a=readAnswers(storage,scope)[character];return a&&uuid.test(a.play)&&typeof a.product==='string'?a:null}
export function rememberAnswer(character,answer,scope='live',storage=browserStorage()){const all=readAnswers(storage,scope);all[character]={...all[character],...answer};volatile.set(answersKey(scope),all);try{storage.setItem(answersKey(scope),JSON.stringify(all))}catch{}return all[character]}
export function startCharacter(character,scope='live',storage=browserStorage()){const done=answerFor(character,scope,storage);return write(storage,scope,done?{character,play:done.play,shared:done.shared===true}:{character,play:crypto.randomUUID(),shared:false})}
// After answering, the next painting opens without sharing; paintings not yet answered come first.
export function advanceRun(run,ids,scope='live',storage=browserStorage()){
 const saved=read(storage,scope),done=saved&&answerFor(saved.character,scope,storage);
 if(!saved||saved.play!==run.play||!done||done.play!==run.play)throw Error('Answer this scenario first');
 const unplayed=ids.filter(id=>!answerFor(id,scope,storage));
 return write(storage,scope,{character:randomNextCharacter(unplayed.length?unplayed:ids,run.character),play:crypto.randomUUID(),shared:false});
}
// Before choosing, swiping moves through the paintings in order; an answered one reopens its own play.
export function switchRun(run,ids,step,scope='live',storage=browserStorage()){
 const i=Math.max(0,ids.indexOf(run.character)),n=ids.length;
 return startCharacter(ids[(i+step+n)%n],scope,storage);
}

