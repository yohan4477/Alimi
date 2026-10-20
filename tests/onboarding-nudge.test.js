import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldSuggestSetup,snoozeSetup} from '../dist/onboarding-nudge.js';
test('setup suggestion stays hidden for 24 hours across visits and reappears at expiry',()=>{
 const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const now=100000;
 assert.equal(shouldSuggestSetup(null,storage,now),true);
 snoozeSetup(storage,now);
 assert.equal(shouldSuggestSetup(null,storage,now+86399999),false);
 assert.equal(shouldSuggestSetup(null,storage,now+86400000),true);
 assert.equal(shouldSuggestSetup({done:true},storage,now+86400000),false);
});
test('unavailable device storage never prevents chatting',()=>{
 const storage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.doesNotThrow(()=>snoozeSetup(storage));
 assert.equal(shouldSuggestSetup(null,storage),true);
});
