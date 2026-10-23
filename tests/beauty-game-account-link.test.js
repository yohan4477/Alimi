import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GoogleAuth,AUTH_STORAGE_KEYS} from '../dist/auth.js';
import {linkGameAccount} from '../web/beauty-play/account-link-flow.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function setup(){
  const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const session=(token)=>storage.setItem(AUTH_STORAGE_KEYS.SESSION_KEY,JSON.stringify({access_token:token,expires_at:Date.now()/1000+3600}));
  session('token-A');
  const auth=new GoogleAuth({storage,fetchImpl:async(_url,{headers})=>({ok:true,json:async()=>({id:headers.Authorization==='Bearer token-A'?'account-A':'account-B',is_anonymous:false})})});
  const calls=[],navigations=[];
  return {auth,session,calls,navigations,options:{consent:true,displayedUserId:'account-A',auth,fetchImpl:async(...args)=>{calls.push(args);return {ok:true,json:async()=>({ok:true})};},navigate:url=>navigations.push(url)}};
}
test('no explicit consent means no restore, no request, no navigation',async()=>{
  const s=setup();s.auth.restore=()=>{throw Error('must not restore');};
  assert.equal((await linkGameAccount({...s.options,consent:false})).status,'consent_required');
  assert.equal(s.calls.length,0);assert.equal(s.navigations.length,0);
});
test('account A displayed then storage becomes B: recheck blocks stale consent',async()=>{
  const s=setup();assert.equal((await s.auth.restore()).id,'account-A');s.session('token-B');
  assert.equal((await linkGameAccount(s.options)).status,'account_changed');
  assert.equal(s.calls.length,0);assert.equal(s.navigations.length,0);
});
test('logout before click blocks linking',async()=>{
  const s=setup();s.auth.clearSession();
  assert.equal((await linkGameAccount(s.options)).status,'account_changed');assert.equal(s.calls.length,0);
});
test('account change while restore is pending blocks stale token and does not send',async()=>{
  const s=setup(),gate=deferred();
  s.auth.fetch=async()=>{await gate.promise;return {ok:true,json:async()=>({id:'account-A'})};};
  const running=linkGameAccount(s.options);s.session('token-B');gate.resolve();
  assert.equal((await running).status,'account_changed');assert.equal(s.calls.length,0);
});
test('successful explicit link sends only consent and redirects only after confirmed response',async()=>{
  const s=setup(),response=deferred(),parsed=deferred();
  const running=linkGameAccount({...s.options,fetchImpl:async(...args)=>{s.calls.push(args);return response.promise;}});
  await new Promise(r=>setImmediate(r));
  assert.equal(s.calls.length,1);assert.equal(s.navigations.length,0);
  const [url,request]=s.calls[0];assert.equal(url,'/api/link-account');assert.equal(request.headers.Authorization,'Bearer token-A');assert.deepEqual(JSON.parse(request.body),{consent:true});
  response.resolve({ok:true,json:()=>parsed.promise});await new Promise(r=>setImmediate(r));assert.equal(s.navigations.length,0);
  parsed.resolve({ok:true});assert.equal((await running).status,'linked');assert.deepEqual(s.navigations,['/beauty-play/']);
});
test('failed or malformed response never redirects',async()=>{
  for(const response of [{ok:false},{ok:true,json:async()=>({ok:false})}]){
    const s=setup();await assert.rejects(()=>linkGameAccount({...s.options,fetchImpl:async()=>response}),/Account link failed/);assert.equal(s.navigations.length,0);
  }
});
test('account change after dispatch is reported as uncertain, never claimed for new account',async()=>{
  const s=setup(),gate=deferred();
  const running=linkGameAccount({...s.options,fetchImpl:()=>gate.promise});await new Promise(r=>setImmediate(r));
  s.session('token-B');gate.resolve({ok:true,json:async()=>({ok:true})});
  assert.equal((await running).status,'account_changed_after_send');assert.equal(s.navigations.length,0);
});
test('component is feature-gated and never auto-links during restore',()=>{
  const source=readFileSync(new URL('../web/beauty-play/account-link.tsx',import.meta.url),'utf8');
  assert.match(source,/accountLinkEnabled=false/);assert.match(source,/if\(!accountLinkEnabled\)return null/);
  assert.match(source,/type="checkbox"/);assert.match(source,/disabled=\{!consent\|\|busy\}/);
  assert.equal((source.match(/await linkGameAccount\(/g)||[]).length,1);
  assert.match(source,/onClick=\{link\}/);
});


test('a pending token refresh cannot overwrite account B or a logout',async()=>{
  for(const logout of [false,true]){
    const s=setup(),gate=deferred();
    s.auth.storage.setItem(AUTH_STORAGE_KEYS.SESSION_KEY,JSON.stringify({access_token:'token-A',refresh_token:'refresh-A',expires_at:1}));
    s.auth.fetch=async()=>{await gate.promise;return {ok:true,json:async()=>({access_token:'refreshed-A',expires_in:3600})};};
    const originalStorage=s.auth.storage;
    const running=linkGameAccount(s.options);
    if(logout)originalStorage.removeItem(AUTH_STORAGE_KEYS.SESSION_KEY);else s.session('token-B');
    gate.resolve();await assert.rejects(()=>running,/Account changed/);
    const persisted=JSON.parse(s.auth.storage.getItem(AUTH_STORAGE_KEYS.SESSION_KEY)||'null');
    assert.equal(persisted?.access_token||null,logout?null:'token-B');assert.equal(s.calls.length,0);
  }
});
