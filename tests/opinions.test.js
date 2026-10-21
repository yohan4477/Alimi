import test from 'node:test';
import assert from 'node:assert/strict';
import {saveOpinion,readOpinion,brandSeed} from '../dist/opinions.js';
test('brand onboarding saves only explicit choices',()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 assert.equal(readOpinion('brand:COSRX',storage),null);
 saveOpinion('brand:COSRX','want_to_try',storage);
 assert.equal(readOpinion('brand:COSRX',storage).choice,'want_to_try');
 assert.throws(()=>saveOpinion('brand:COSRX','fake',storage));
 assert.ok(brandSeed.includes('COSRX'));
});
