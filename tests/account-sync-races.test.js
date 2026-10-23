import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountSync,SYNC_KEYS} from '../dist/account-sync.js';
class Store {data=new Map();getItem(k){return this.data.get(k)??null}setItem(k,v){this.data.set(k,String(v))}removeItem(k){this.data.delete(k)}}
const KEY=SYNC_KEYS[0],OWNER='seoulbeauty-data-owner';
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject};};
const makeAuth=()=>({user:{id:'A'},session:{access_token:'A-token'},epoch:0,async restore(){return this.user}});
const select=(auth,id)=>{auth.user=id?{id}:null;auth.session=id?{access_token:id+'-token'}:null;auth.epoch++;};
for(const change of ['B','logout','A'])test(`preferences parsed after ${change==='A'?'same-account re-login':change} cannot install a stale response`,async()=>{
 const storage=new Store(),auth=makeAuth(),body=deferred(),parsing=deferred(),statuses=[];
 const sync=new AccountSync(auth,{storage,onStatus:s=>statuses.push(s),fetchImpl:async()=>({ok:true,status:200,json:()=>{parsing.resolve();return body.promise}})});
 const pending=sync.start();await parsing.promise;select(auth,change==='logout'?null:change);
 body.resolve([{key:KEY,value:'private-A'}]);await pending;
 assert.notEqual(storage.getItem(KEY),'private-A');assert.equal(sync.ready,false);assert.notEqual(statuses.at(-1),'ready');
 assert.equal(storage.getItem('seoulbeauty-account-cache:B'),null);
});
test('late A JSON cannot replace an already installed B cache or status',async()=>{
 const storage=new Store(),auth=makeAuth(),body=deferred(),parsing=deferred(),statuses=[];let calls=0;
 const sync=new AccountSync(auth,{storage,onStatus:s=>statuses.push(s),fetchImpl:async()=>++calls===1?{ok:true,status:200,json:()=>{parsing.resolve();return body.promise}}:response([{key:KEY,value:'private-B'}])});
 const first=sync.start();await parsing.promise;select(auth,'B');await sync.start();assert.equal(storage.getItem(KEY),'private-B');
 body.resolve([{key:KEY,value:'private-A'}]);await first;
 assert.equal(storage.getItem(OWNER),'B');assert.equal(storage.getItem(KEY),'private-B');assert.equal(statuses.at(-1),'ready');
 assert.doesNotMatch(storage.getItem('seoulbeauty-account-cache:B')||'',/private-A/);
});
test('same-account auth epoch changes force a new restore instead of reusing ready state',async()=>{
 const storage=new Store(),auth=makeAuth();let calls=0;
 const sync=new AccountSync(auth,{storage,fetchImpl:async()=>response([{key:KEY,value:'cloud-'+ ++calls}])});
 await sync.start();select(auth,'A');await sync.start();assert.equal(calls,2);assert.equal(storage.getItem(KEY),'cloud-2');
});
test('a foreign storage owner invalidates a pending response without overwriting that cache',async()=>{
 const storage=new Store(),auth=makeAuth(),body=deferred(),parsing=deferred();
 const sync=new AccountSync(auth,{storage,fetchImpl:async()=>({ok:true,status:200,json:()=>{parsing.resolve();return body.promise}})});
 const first=sync.start();await parsing.promise;storage.setItem(OWNER,'B');storage.setItem(KEY,'other-tab-B');
 body.resolve([{key:KEY,value:'private-A'}]);await first;
 assert.equal(storage.getItem(OWNER),'B');assert.equal(storage.getItem(KEY),'other-tab-B');assert.equal(sync.ready,false);
});
test('account switch during pre-write auth refresh never sends an A payload as B',async()=>{
 const storage=new Store(),auth=makeAuth(),refresh=deferred(),started=deferred(),posts=[];
 const sync=new AccountSync(auth,{storage,fetchImpl:async(u,o)=>{if(o.method==='POST'){posts.push(JSON.parse(o.body));return response(null,204)}return response([{key:KEY,value:'cloud-A'}])}});
 await sync.start();auth.restore=async()=>{started.resolve();await refresh.promise;return auth.user};
 storage.setItem(KEY,'edited-A');sync.changed();await started.promise;select(auth,'B');refresh.resolve();await sync.queue;
 assert.equal(posts.length,0);assert.notEqual(storage.getItem(OWNER),'B');
 assert.match(storage.getItem('seoulbeauty-account-pending:A'),/edited-A/);
});
test('old A POST failure cannot write B dirty state to A pending cache',async()=>{
 const storage=new Store(),auth=makeAuth(),write=deferred(),started=deferred();
 const sync=new AccountSync(auth,{storage,fetchImpl:async(u,o)=>{if(o.method==='POST'){started.resolve();return write.promise}return response([{key:KEY,value:auth.user.id+'-server'}])}});
 await sync.start();storage.setItem(KEY,'A-edit');sync.changed();await started.promise;
 select(auth,'B');const newer=sync.start();await new Promise(resolve=>setImmediate(resolve));
 storage.setItem(KEY,'B-edit');sync.changed();write.reject(Error('offline'));await newer;await sync.queue;
 assert.doesNotMatch(storage.getItem('seoulbeauty-account-pending:A'),/B-edit/);
 assert.match(storage.getItem('seoulbeauty-account-pending:A'),/A-edit/);
 assert.equal(storage.getItem(OWNER),'B');assert.equal(storage.getItem(KEY),'B-edit');
});
test('changed() cannot collect another owners local choices and strips unapproved pending keys',async()=>{
 const storage=new Store(),auth=makeAuth();storage.setItem('seoulbeauty-account-pending:A',JSON.stringify({[KEY]:'pending-A','alimi-chat-secret':'never-sync'}));const posts=[];
 const sync=new AccountSync(auth,{storage,fetchImpl:async(u,o)=>{if(o.method==='POST'){posts.push(JSON.parse(o.body));return response(null,204)}return response([])}});
 await sync.start();assert(posts.flat().every(x=>SYNC_KEYS.includes(x.key)));
 select(auth,'B');storage.setItem(KEY,'foreign-edit');sync.changed();
 assert.doesNotMatch(storage.getItem('seoulbeauty-account-pending:A'),/foreign-edit|never-sync/);
});
