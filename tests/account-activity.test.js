import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AccountActivityState,ACCOUNT_ACTIVITY_ENABLED,loadAccountActivity} from '../dist/account-activity.js';
const json=(data,status=200)=>({ok:status<400,status,json:async()=>data});
const auth=()=>({user:{id:'user-a'},session:{access_token:'access-a'},epoch:0});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('released account activity is gated and never contacts backend or reads guest identity',async()=>{
 assert.equal(ACCOUNT_ACTIVITY_ENABLED,false);
 let calls=0;const options={fetchImpl:async()=>{calls++;throw Error('unexpected')},storage:{getItem(){throw Error('must not read secret')}}};
 assert.equal(await loadAccountActivity(auth(),options),null);
 assert.equal(await loadAccountActivity({user:null,session:null},{...options,enabled:true}),null);
 const state=new AccountActivityState(auth(),options);await state.load();
 assert.deepEqual(state.snapshot(),{activity:null,status:'local'});assert.equal(calls,0);
});
test('opt-in read uses verified bearer and never calls the linking RPC',async()=>{
 const calls=[],a=auth();
 const result=await loadAccountActivity(a,{enabled:true,fetchImpl:async(url,opts)=>{calls.push({url,opts});return json({posts:[{id:1}],votes:[]});}});
 assert.equal(result.posts[0].id,1);assert.equal(calls.length,1);
 assert.match(calls[0].url,/get_my_account_activity$/);
 assert.equal(calls[0].opts.headers.Authorization,'Bearer access-a');assert.deepEqual(JSON.parse(calls[0].opts.body),{});
});
test('read failure is surfaced by loader',async()=>{
 await assert.rejects(loadAccountActivity(auth(),{enabled:true,fetchImpl:async()=>json({},403)}),/account_activity_403/);
});
for(const change of ['logout','account switch','same-user re-login'])test(`change during response JSON parsing drops stale data: ${change}`,async()=>{
 const a=auth(),parsing=deferred(),started=deferred();
 const pending=loadAccountActivity(a,{enabled:true,fetchImpl:async()=>({ok:true,status:200,json:()=>{started.resolve();return parsing.promise}})});
 await started.promise;
 if(change==='logout'){a.user=null;a.session=null;}
 if(change==='account switch'){a.user={id:'user-b'};a.session={access_token:'access-b'};}
 if(change==='same-user re-login'){a.epoch++;}
 parsing.resolve({posts:[{id:1}]});assert.equal(await pending,null);
});
test('state retains successfully loaded rows rather than clearing after restore',async()=>{
 const a=auth(),state=new AccountActivityState(a,{enabled:true,fetchImpl:async()=>json({posts:[{id:1}]})});
 await state.load();assert.deepEqual(state.snapshot(),{activity:{posts:[{id:1}]},status:'ready'});
});
test('changed owner synchronously hides rendered activity before another request completes',async()=>{
 const a=auth(),state=new AccountActivityState(a,{enabled:true,fetchImpl:async()=>json({posts:[{id:1}]})});
 await state.load();a.user={id:'user-b'};assert.deepEqual(state.snapshot(),{activity:null,status:'local'});
});
test('logout invalidates a pending activity request',async()=>{
 const a=auth(),response=deferred(),state=new AccountActivityState(a,{enabled:true,fetchImpl:()=>response.promise});
 const pending=state.load();state.clear();response.resolve(json({posts:[{id:1}]}));await pending;
 assert.deepEqual(state.snapshot(),{activity:null,status:'local'});
});
test('a late request cannot overwrite a newer request',async()=>{
 const a=auth(),first=deferred();let calls=0;
 const state=new AccountActivityState(a,{enabled:true,fetchImpl:()=>++calls===1?first.promise:Promise.resolve(json({posts:[{id:2}]}))});
 const pending=state.load();await state.load();first.resolve(json({posts:[{id:1}]}));await pending;
 assert.equal(state.snapshot().activity.posts[0].id,2);
});
test('application clears activity on signout, retains drafts wiring and uses no invented deletion contact',()=>{
 const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 assert.match(app,/const accountActivityState=new AccountActivityState\(auth\)/);
 assert.match(app,/await accountActivityState\.load\(\)/);
 assert.match(app,/accountRestoreGeneration;accountActivityState\.clear\(\)/);
 assert.match(app,/configureBeautyDraftAccount\(auth\)/);assert.match(app,/refreshBeautyDraftAccount\(\)/);
 assert.doesNotMatch(app,/link_my_chat_identity|mailto:support@|data-set="account-deletion-request"/);
 assert.match(app,/Account deletion · contact option pending/);
});
