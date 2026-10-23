import test from 'node:test';
import assert from 'node:assert/strict';
import {BeautyAccountDrafts,draftPayload} from '../dist/beauty-account-drafts.js';
const id='340c78fa-03ca-42f2-857e-f8b70a1a4654';
const draft={id,region:'kr',language:'ko',body:'private text',title:'title'};
const auth=()=>({user:{id:'owner-a'},session:{access_token:'test-token'},async restore(){}});
test('payload excludes game notes, secrets, profile and owner fields',()=>{assert.deepEqual(draftPayload({...draft,user_id:'other',secret:'no',notes:'no'}),draft);assert.throws(()=>draftPayload({...draft,body:'x'.repeat(2001)}));});
test('explicit saves carry auth and revision, never publish, detect conflicts',async()=>{
 const requests=[],a=auth();let revision=1;
 const client=new BeautyAccountDrafts(a,{fetchImpl:async(url,opt)=>{requests.push({url,opt});return {ok:true,json:async()=>revision?[{...draft,revision}]:[]}}});
 await client.save(draft);assert.equal(requests.length,1);assert.match(requests[0].url,/rpc\/save_beauty_account_draft$/);assert.equal(JSON.parse(requests[0].opt.body).p_revision,0);assert.equal(requests[0].opt.headers.Authorization,'Bearer test-token');
 revision=2;await client.save(draft);assert.equal(JSON.parse(requests[1].opt.body).p_revision,1);
 revision=0;await assert.rejects(client.save(draft),/draft_conflict/);
});
test('new device can list saved drafts but signed-out client never requests them',async()=>{
 const a=auth(),requests=[];const client=new BeautyAccountDrafts(a,{fetchImpl:async(url)=>{requests.push(url);return{ok:true,json:async()=>[{...draft,revision:4}]}}});
 assert.equal((await client.list('kr'))[0].body,'private text');assert.match(requests[0],/region=eq.kr/);assert.equal(client.revisions.get(id),4);
 a.user=null;await assert.rejects(client.list('kr'),/login_required/);assert.equal(requests.length,1);
});
test('account switching discards revisions and rejects in-flight private results',async()=>{
 const a=auth();const client=new BeautyAccountDrafts(a,{fetchImpl:async()=>{a.user={id:'owner-b'};return{ok:true,json:async()=>[{...draft,revision:1}]}}});
 await assert.rejects(client.list('kr'),/account_changed/);
});
test('server errors are not mistaken for saved or deleted drafts',async()=>{
 const client=new BeautyAccountDrafts(auth(),{fetchImpl:async()=>({ok:false,status:503})});await assert.rejects(client.save(draft),/draft_503/);await assert.rejects(client.remove(id),/draft_503/);
});


const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const authWithEpoch=()=>({...auth(),epoch:0,session:{access_token:'access-a',refresh_token:'refresh-a'}});
const transitions={
  'account changes during JSON parsing':a=>{a.user={id:'owner-b'};},
  'same-owner access token is replaced during JSON parsing':a=>{a.session={...a.session,access_token:'access-b'};},
  'same-owner refresh token is replaced during JSON parsing':a=>{a.session={...a.session,refresh_token:'refresh-b'};},
  'logout starts but old user and credentials remain during JSON parsing':a=>{a.epoch++;},
  'session is cleared during JSON parsing':a=>{a.user=null;a.session=null;},
  'logout and same-owner sign-in make the response stale':a=>{a.epoch+=2;a.user={id:'owner-a'};a.session={access_token:'access-a',refresh_token:'refresh-a'};},
};
for(const [name,transition] of Object.entries(transitions)){
  test(`private draft list rejects when ${name}`,async()=>{
    const a=authWithEpoch(),bodyStarted=deferred(),body=deferred();
    const client=new BeautyAccountDrafts(a,{fetchImpl:async()=>({ok:true,status:200,json:()=>{bodyStarted.resolve();return body.promise;}})});
    const pending=client.list('kr');
    await bodyStarted.promise;
    transition(a);
    body.resolve([{...draft,revision:9}]);
    await assert.rejects(pending,/account_changed/);
    assert.equal(client.revisions.size,0,'stale response must not populate revision cache');
  });
}
test('unchanged session accepts a delayed JSON response',async()=>{
  const a=authWithEpoch(),bodyStarted=deferred(),body=deferred();
  const client=new BeautyAccountDrafts(a,{fetchImpl:async()=>({ok:true,status:200,json:()=>{bodyStarted.resolve();return body.promise;}})});
  const pending=client.list('kr');await bodyStarted.promise;
  body.resolve([{...draft,revision:9}]);
  assert.equal((await pending)[0].body,draft.body);
  assert.equal(client.revisions.get(id),9);
});
test('stale save acknowledgement never updates revision cache',async()=>{
  const a=authWithEpoch(),bodyStarted=deferred(),body=deferred();
  const client=new BeautyAccountDrafts(a,{fetchImpl:async()=>({ok:true,status:200,json:()=>{bodyStarted.resolve();return body.promise;}})});
  const pending=client.save(draft);await bodyStarted.promise;
  a.epoch++;body.resolve([{...draft,revision:1}]);
  await assert.rejects(pending,/account_changed/);
  assert.equal(client.revisions.has(id),false);
});
test('logout epoch change during auth restore prevents the draft request',async()=>{
  const a=authWithEpoch();a.restore=async()=>{a.epoch++;};let requests=0;
  const client=new BeautyAccountDrafts(a,{fetchImpl:async()=>{requests++;throw Error('must not send');}});
  await assert.rejects(client.list('kr'),/account_changed/);
  assert.equal(requests,0);
});


test('save never sends account A draft under account B after a second restore',async()=>{
  const a=authWithEpoch();let restores=0,requests=0;
  a.restore=async()=>{if(++restores===2){a.user={id:'owner-b'};a.session={access_token:'access-b',refresh_token:'refresh-b'};}};
  const client=new BeautyAccountDrafts(a,{fetchImpl:async()=>{requests++;return {ok:true,status:200,json:async()=>[{...draft,revision:1}]};}});
  await assert.rejects(client.save(draft),/account_changed/);
  assert.equal(requests,0,'private text must never be sent using the new account');
  assert.equal(client.revisions.has(id),false);
});
test('save permits same-owner token refresh during its second restore',async()=>{
  const a=authWithEpoch();let restores=0,requests=0;
  a.restore=async()=>{if(++restores===2)a.session={access_token:'fresh-access-a',refresh_token:'fresh-refresh-a'};};
  const client=new BeautyAccountDrafts(a,{fetchImpl:async(_url,options)=>{
    requests++;assert.equal(options.headers.Authorization,'Bearer fresh-access-a');
    return {ok:true,status:200,json:async()=>[{...draft,revision:1}]};
  }});
  assert.equal((await client.save(draft)).revision,1);
  assert.equal(requests,1);assert.equal(client.revisions.get(id),1);
});
test('save rejects a changed login epoch at the second restore even for the same owner',async()=>{
  const a=authWithEpoch();let restores=0,requests=0;
  a.restore=async()=>{if(++restores===2)a.epoch++;};
  const client=new BeautyAccountDrafts(a,{fetchImpl:async()=>{requests++;throw Error('must not send');}});
  await assert.rejects(client.save(draft),/account_changed/);assert.equal(requests,0);
});
for(const operation of ['list','save','remove']){
  test(`${operation} rechecks ownership after request resolves before changing revision cache`,async()=>{
    const a=authWithEpoch();
    const client=new BeautyAccountDrafts(a,{fetchImpl:async()=>({ok:true,status:operation==='remove'?204:200,json:async()=>[{...draft,revision:2}]})});
    client.owner='owner-a';client.revisions.set(id,1);
    const request=client.request.bind(client);
    client.request=async(...args)=>{
      const result=await request(...args);
      // Simulates another auth operation queued between request completion and
      // the caller continuation. Preserve the new account's independent cache.
      a.user={id:'owner-b'};a.session={access_token:'access-b',refresh_token:'refresh-b'};
      client.owner='owner-b';client.revisions.set(id,99);
      return result;
    };
    await assert.rejects(operation==='list'?client.list('kr'):operation==='save'?client.save(draft):client.remove(id),/account_changed/);
    assert.equal(client.revisions.get(id),99,'stale continuation must not overwrite or delete another account revision');
  });
}
