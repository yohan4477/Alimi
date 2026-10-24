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
function readAnswers(storage,scope){try{const all=JSON.parse(storage.getItem(answersKey(scope))||'{}');return all&&typeof all==='object'?all:{}}catch{return {}}}
export function answerFor(character,scope='live',storage=browserStorage()){const a=readAnswers(storage,scope)[character];return a&&uuid.test(a.play)&&typeof a.product==='string'?a:null}
export function rememberAnswer(character,answer,scope='live',storage=browserStorage()){const all=readAnswers(storage,scope);all[character]={...all[character],...answer};try{storage.setItem(answersKey(scope),JSON.stringify(all))}catch{}return all[character]}
export function startCharacter(character,scope='live',storage=browserStorage()){const done=answerFor(character,scope,storage);return write(storage,scope,done?{character,play:done.play,shared:done.shared===true}:{character,play:crypto.randomUUID(),shared:false})}
export function advanceRun(run,ids,scope='live',storage=browserStorage()){
 const saved=read(storage,scope);
 if(!saved||saved.play!==run.play||!saved.shared)throw Error('Share this scenario first');
 return write(storage,scope,{character:randomNextCharacter(ids,run.character),play:crypto.randomUUID(),shared:false});
}
