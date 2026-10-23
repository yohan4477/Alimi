import test from 'node:test';
import assert from 'node:assert/strict';
import {readHandoff,writeHandoff,updateHandoff,clearHandoff,HANDOFF_KEY,HANDOFF_TTL} from '../dist/beauty-handoff.js';
const id='340c78fa-03ca-42f2-857e-f8b70a1a4654', other='0b76ab05-2832-4073-893d-84e1c623d953';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
test('same-tab transfer puts only an opaque id in the regional URL and allowlists private draft fields',()=>{
 const s=memory(),now=Date.now();
 const href=writeHandoff(s,{id,now,body:'  My own experience <script>  ',language:'en',region:'kr',note:'private game note',account_id:'forbidden'});
 assert.equal(href,`/kr?lang=en&beautyDraft=${id}&demo=0`);
 assert.ok(!href.includes('experience'));
 assert.deepEqual(readHandoff(s,{id,region:'kr',now}),{id,region:'kr',language:'en',body:'My own experience <script>',createdAt:now});
 assert.ok(!s.getItem(HANDOFF_KEY).includes('private game note'));
});
test('a copied link, another draft id, another market and expiry cannot expose the draft',()=>{
 const s=memory(),now=Date.now();writeHandoff(s,{id,now,body:'private',language:'ko',region:'kr'});
 assert.equal(readHandoff(memory(),{id,region:'kr',now}),null);
 assert.equal(readHandoff(s,{id:other,now}),null);
 assert.equal(readHandoff(s,{id,region:'us',now}),null);
 assert.equal(readHandoff(s,{id,now:now+HANDOFF_TTL}),null);
 assert.equal(s.getItem(HANDOFF_KEY),null);
});
test('malformed, oversized and future-dated storage is rejected without propagating errors',()=>{
 const s=memory(),now=Date.now();
 for(const value of ['{','null',JSON.stringify({id,region:'us',language:'en',body:'x'.repeat(2001),createdAt:now}),JSON.stringify({id,region:'us',language:'en',body:'x',createdAt:now+1})]){s.setItem(HANDOFF_KEY,value);assert.equal(readHandoff(s,{now}),null);}
 assert.equal(readHandoff({getItem(){throw Error('Blocked')}}),null);
 assert.throws(()=>writeHandoff({setItem(){throw Error('Blocked')}},{id,body:'x',language:'en',region:'us'}));
});
test('unsent edits survive reopening, and only the matching draft is cleared after success or explicit deletion',()=>{
 const s=memory();writeHandoff(s,{id,body:'first',language:'en',region:'us'});
 assert.equal(updateHandoff(s,id,'edited','My title'),true);assert.equal(readHandoff(s,{id}).body,'edited');assert.equal(readHandoff(s,{id}).title,'My title');
 clearHandoff(s,other);assert.equal(readHandoff(s,{id}).body,'edited');
 assert.equal(updateHandoff(s,other,'no'),false);
 clearHandoff(s,id);assert.equal(readHandoff(s,{id}),null);
});
