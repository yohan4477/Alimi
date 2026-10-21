import test from 'node:test';import assert from 'node:assert/strict';
import {GoogleAuth,AUTH_STORAGE_KEYS as K} from '../dist/auth.js';
import {AccountSync,SYNC_KEYS} from '../dist/account-sync.js';
class Store {data=new Map();getItem(k){return this.data.get(k)??null}setItem(k,v){this.data.set(k,String(v))}removeItem(k){this.data.delete(k)}}
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
for(const provider of ['google','kakao','naver'])test(provider+' PKCE authorization and callback',async()=>{
 const storage=new Store(),sessionStorage=new Store(),calls=[];const location={origin:'https://seoulbeauty.me',pathname:'/kr',search:'?lang=ko',assign(url){this.assigned=url},replace(url){this.replaced=url}};
 const auth=new GoogleAuth({storage,sessionStorage,location,fetchImpl:async(url,options)=>{calls.push({url,options});return url.includes('/authorize?')?response({url:'https://provider.example/authorize'}):url.includes('/token?')?response({access_token:'access',refresh_token:'refresh',expires_in:3600}):response({id:'user-A'});}});
 await auth.startLogin(provider);assert.equal(calls.length,0);const u=new URL(location.assigned),redirect=new URL(u.searchParams.get('redirect_to'));assert.equal(u.searchParams.get('provider'),provider==='naver'?'custom:naver':provider);assert.equal(u.searchParams.has('state'),false);assert.match(u.searchParams.get('code_challenge'),/^[A-Za-z0-9_-]{43}$/);assert.equal(redirect.searchParams.get('sb_login_state'),sessionStorage.getItem(K.STATE_KEY));redirect.searchParams.set('code','authcode');location.href=redirect.href;
 assert.equal(await auth.handleCallback(),true);assert.equal(auth.user.id,'user-A');assert(storage.getItem(K.SESSION_KEY));assert.equal(sessionStorage.getItem(K.VERIFIER_KEY),null);assert(!location.replaced.includes('authcode'));
});
test('wrong nonce rejects callback without exchanging code',async()=>{let count=0;const ss=new Store();ss.setItem(K.VERIFIER_KEY,'verifier');ss.setItem(K.STATE_KEY,'correct');ss.setItem(K.FLOW_TIME,Date.now());const auth=new GoogleAuth({storage:new Store(),sessionStorage:ss,location:{href:'https://example.com/?code=x&sb_login_state=wrong',replace(){}},fetchImpl:async()=>{count++}});await assert.rejects(auth.handleCallback());assert.equal(count,0);assert.equal(ss.getItem(K.VERIFIER_KEY),null);});
test('expired session refreshes and network failure retains recoverable login',async()=>{const storage=new Store();storage.setItem(K.SESSION_KEY,JSON.stringify({access_token:'old',refresh_token:'refresh',expires_at:1}));const auth=new GoogleAuth({storage,sessionStorage:new Store(),fetchImpl:async url=>url.includes('/token?')?response({access_token:'new',refresh_token:'new-refresh',expires_in:3600}):response({id:'A'})});await auth.restore();assert.equal(auth.session.access_token,'new');auth.fetch=async()=>{throw Error('offline')};await assert.rejects(auth.restore());assert(storage.getItem(K.SESSION_KEY));});
test('cloud preferences restore and accounts do not inherit another account',async()=>{const storage=new Store();storage.setItem(SYNC_KEYS[0],'guest');let posted=[];const auth={user:{id:'A'},session:{access_token:'A-token'},async restore(){return this.user}};const sync=new AccountSync(auth,{storage,fetchImpl:async(url,o)=>{if(o.method==='POST'){posted.push(JSON.parse(o.body));return response(null,204)}return response(auth.user.id==='A'?[{key:SYNC_KEYS[0],value:'cloud-A'}]:[])}});await sync.start();assert.equal(storage.getItem(SYNC_KEYS[0]),'cloud-A');storage.setItem(SYNC_KEYS[0],'edited-A');sync.changed();await sync.flush();assert(posted.flat().some(r=>r.value==='edited-A'&&r.user_id==='A'));auth.user={id:'B'};await sync.start();assert.equal(storage.getItem(SYNC_KEYS[0]),null);assert(!posted.flat().some(r=>r.value==='edited-A'&&r.user_id==='B'));sync.stop();assert.equal(storage.getItem(SYNC_KEYS[0]),'guest');});
test('failed sync keeps pending edits and never announces ready',async()=>{const storage=new Store(),statuses=[];const auth={user:{id:'A'},session:{access_token:'a'},async restore(){}};const sync=new AccountSync(auth,{storage,onStatus:s=>statuses.push(s),fetchImpl:async(u,o)=>o.method==='POST'?response({},503):response([])});await sync.start();storage.setItem(SYNC_KEYS[0],'pending');sync.changed();await sync.flush();assert.match(storage.getItem('seoulbeauty-account-pending:A'),/pending/);assert.equal(statuses.at(-1),'failed');});
test('account sync default fetch is unbound-safe',async()=>{const original=globalThis.fetch;globalThis.fetch=function(){if(this!==undefined&&this!==globalThis)throw new TypeError('Illegal invocation');return Promise.resolve(response([]))};try{const auth={user:{id:'A'},session:{access_token:'t'}};const sync=new AccountSync(auth,{storage:new Store()});sync.userId='A';assert.deepEqual(await sync.request('?select=key'),[]);}finally{globalThis.fetch=original;}});
const OP='seoulbeauty-opinions-v1',answer=(choice,date)=>({choice,updatedAt:new Date(date).toISOString()});
const old=answer('want_to_try','2026-10-20T00:00:00Z'),fresh=answer('tried_liked','2026-10-21T00:00:00Z');
test('guest answers merge with server and newer local answer survives sign-in',async()=>{
 const storage=new Store();storage.setItem(OP,JSON.stringify({a:fresh}));const auth={user:{id:'A'},session:{access_token:'t'},async restore(){}};let posted;
 const sync=new AccountSync(auth,{storage,fetchImpl:async(u,o)=>o.method==='POST'?(posted=JSON.parse(o.body),response(null,204)):response([{key:OP,value:JSON.stringify({a:old,b:old})}])});
 await sync.start();assert.deepEqual(JSON.parse(storage.getItem(OP)),{a:fresh,b:old});assert.deepEqual(JSON.parse(posted.find(x=>x.key===OP).value),{a:fresh,b:old});
});
test('guest import survives failed read and retry with an existing account cache',async()=>{
 const storage=new Store();storage.setItem(OP,JSON.stringify({a:fresh}));storage.setItem('seoulbeauty-account-cache:A',JSON.stringify({[OP]:JSON.stringify({b:old})}));const auth={user:{id:'A'},session:{access_token:'t'},async restore(){}};let fail=true;
 const sync=new AccountSync(auth,{storage,fetchImpl:async(u,o)=>{if(fail)throw Error('offline');return response(o.method==='POST'?null:[{key:OP,value:JSON.stringify({c:old})}],o.method==='POST'?204:200)}});
 await sync.start();assert.deepEqual(JSON.parse(storage.getItem(OP)),{b:old,a:fresh});fail=false;await sync.start();assert.deepEqual(JSON.parse(storage.getItem(OP)),{c:old,b:old,a:fresh});
});
test('answer made during pending server read is not overwritten by guest snapshot',async()=>{
 const storage=new Store();storage.setItem(OP,JSON.stringify({a:old}));const auth={user:{id:'A'},session:{access_token:'t'},async restore(){}};let resolve;
 const sync=new AccountSync(auth,{storage,fetchImpl:async(u,o)=>o.method==='POST'?response(null,204):new Promise(r=>{resolve=r})});
 const started=sync.start();storage.setItem(OP,JSON.stringify({a:fresh}));sync.changed();resolve(response([{key:OP,value:JSON.stringify({b:old})}]));await started;assert.deepEqual(JSON.parse(storage.getItem(OP)),{b:old,a:fresh});
});
test('late old-account failed request cannot change new-account status',async()=>{
 const storage=new Store(),statuses=[];const auth={user:{id:'A'},session:{access_token:'t'},async restore(){}};let reject;
 const sync=new AccountSync(auth,{storage,onStatus:s=>statuses.push(s),fetchImpl:async()=>auth.user.id==='A'?new Promise((r,j)=>{reject=j}):response([])});
 const first=sync.start();auth.user={id:'B'};await sync.start();reject(Error('old offline'));await first;assert.equal(statuses.at(-1),'ready');
});
