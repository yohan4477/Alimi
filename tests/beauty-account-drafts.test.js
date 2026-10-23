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
