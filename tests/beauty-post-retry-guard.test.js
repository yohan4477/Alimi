import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuardedPost, knownPostRejection} from '../dist/beauty-post-retry-guard.js';
import {RpcError, rpc} from '../dist/supabase.js';
const id = '340c78fa-03ca-42f2-857e-f8b70a1a4654';
const key = 'seoulbeauty-post-pending:' + id;
const draft = {kind:'question',title:'Fixture title',body:'Private text fixture',beautyHandoffId:id};
const storage = (values = new Map()) => ({getItem: key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)});
const ok = () => ({ok:true,status:200,json:async()=>({id:99})});
const submit = (store, fetchImpl, data=draft) => createGuardedPost('fixture','room',data,{storage:store,fetchImpl});
const hasCode = code => error => error.code === code;

test('successful publication posts once and blocks reopening the same handoff even after reload', async () => {
  const values = new Map(), store = storage(values); let requests = 0;
  const fetchImpl = async () => {requests++; return ok();};
  assert.deepEqual(await submit(store,fetchImpl), {id:99});
  assert.equal(store.getItem(key), 'posted');
  await assert.rejects(submit(store,fetchImpl),hasCode('post:already'));
  const reloaded = await import('../dist/beauty-post-retry-guard.js?reload=success');
  await assert.rejects(reloaded.createGuardedPost('fixture','room',draft,{storage:storage(values),fetchImpl}),hasCode('post:already'));
  assert.equal(requests, 1);
  assert.equal(JSON.stringify([...values]).includes(draft.body), false, 'guard stores no title, body, account or profile');
});
test('structured RPC rejection retains domain message and permits correction after reload', async () => {
  for (const status of [400,401,403,404,409,422,429]) {
    const values = new Map(), store = storage(values); let requests = 0;
    await assert.rejects(submit(store,async()=>{requests++;return {ok:false,status,json:async()=>({message:'chat:short',code:'P0001'})};}),error=>{
      assert.equal(error.message, 'chat:short');assert.equal(error.status,status);assert.equal(error.code,'P0001');assert.equal(knownPostRejection(error),true);return true;
    });
    assert.equal(store.getItem(key),null);
    const reloaded = await import('../dist/beauty-post-retry-guard.js?reload=rejection');
    await reloaded.createGuardedPost('fixture','room',draft,{storage:storage(values),fetchImpl:async()=>{requests++;return ok();}});
    assert.equal(requests,2);
  }
});
test('HTTP status survives empty, malformed and non-JSON error bodies', async () => {
  for (const json of [async()=>null,async()=>({message:{bad:true}}),async()=>{throw Error('not JSON');}]) {
    await assert.rejects(rpc('create_post',{},async()=>({ok:false,status:400,json})),error=>error instanceof RpcError && error.status===400 && error.message==='HTTP 400');
  }
  assert.equal(knownPostRejection(Error('HTTP 400')),false,'message text never proves a rejection');
});
test('lost response, timeout, 5xx, HTTP 408 and malformed success stay pending across reload', async () => {
  const cases = [
    async()=>{throw new TypeError('Failed to fetch');},
    async()=>{throw Object.assign(Error('Timeout'),{name:'TimeoutError'});},
    async()=>({ok:false,status:503,json:async()=>({message:'chat:short'})}),
    async()=>({ok:false,status:408,json:async()=>({message:'request timeout'})}),
    async()=>({ok:true,status:200,json:async()=>{throw Error('truncated response');}}),
    async()=>({ok:true,status:200,json:async()=>null})
  ];
  for (const fail of cases) {
    const values = new Map(), store=storage(values); let requests=0;
    const fetchImpl=async()=>{requests++;return fail();};
    await assert.rejects(submit(store,fetchImpl),hasCode('post:uncertain'));
    assert.equal(store.getItem(key),'pending');
    const reloaded=await import('../dist/beauty-post-retry-guard.js?reload=lost');
    await assert.rejects(reloaded.createGuardedPost('fixture','room',draft,{storage:storage(values),fetchImpl}),hasCode('post:uncertain'));
    assert.equal(requests,1);
  }
});
test('invalid products never acquire a pending lock or send a request', async () => {
  const store=storage();let requests=0;
  await assert.rejects(submit(store,async()=>{requests++;return ok();},{...draft,item:{sku:'missing-retailer'}}),/chat:item/);
  assert.equal(store.getItem(key),null);assert.equal(requests,0);
  await submit(store,async()=>{requests++;return ok();},{...draft,item:{retailer:'R',market:'US',sku:'valid'}});
  assert.equal(requests,1);
});
test('missing, blocked, read-only and silently ignored storage refuse publication', async () => {
  for (const store of [null,undefined,{}, {getItem(){throw Error();},setItem(){},removeItem(){}}, {getItem:()=>null,setItem(){throw Error();},removeItem(){}}, {getItem:()=>null,setItem(){},removeItem(){}}]) {
    let requests=0;
    await assert.rejects(submit(store,async()=>{requests++;return ok();}),hasCode('post:storage'));
    assert.equal(requests,0);
  }
});
test('repeated submissions during one pending request create exactly one RPC', async () => {
  const store=storage();let resolve,requests=0;
  const first=submit(store,()=>{requests++;return new Promise(r=>{resolve=r;});});
  for(let i=0;i<9;i++)await assert.rejects(submit(store,async()=>{requests++;return ok();}),hasCode('post:uncertain'));
  resolve(ok());await first;assert.equal(requests,1);
});
test('storage failing after acknowledged success cannot create a duplicate after reload', async () => {
  const values=new Map(),store=storage(values);let sets=0,requests=0;
  const safeSet=store.setItem;store.setItem=(key,value)=>{if(++sets>1)throw Error('storage lost');safeSet(key,value);};
  await submit(store,async()=>{requests++;return ok();});
  assert.equal(store.getItem(key),'pending');
  await assert.rejects(submit(storage(values),async()=>{requests++;return ok();}),hasCode('post:uncertain'));
  assert.equal(requests,1);
});
test('a failed lock removal after a known rejection remains conservative', async () => {
  const store=storage();store.removeItem=()=>{throw Error('storage lost');};let requests=0;
  await assert.rejects(submit(store,async()=>{requests++;return {ok:false,status:400,json:async()=>({message:'chat:short'})};}),/chat:short/);
  await assert.rejects(submit(store,async()=>{requests++;return ok();}),hasCode('post:uncertain'));
  assert.equal(requests,1);
});
test('ordinary community posts without handoffs do not require session storage', async () => {
  assert.deepEqual(await submit(null,async()=>ok(),{kind:'question',title:'Fixture'}),{id:99});
});
