import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBeautyGameHandler,createGameRpc,GAME_COOKIE} from '../server/beauty-game-api.mjs';
import {createHash} from 'node:crypto';
const token='a'.repeat(64),cookie=`${GAME_COOKIE}=${token}`,hash=createHash('sha256').update(token).digest('hex');
const play='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const run=async(handler,route,{method='GET',headers={},body,query=''}={})=>{const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(body){this.body=JSON.parse(body);}};await handler({url:'/api/beauty-play?route='+route+query,method,headers:{cookie,...headers},body},res);return res;};
const post={method:'POST',headers:{origin:'https://seoulbeauty.me','content-type':'application/json'}};
test('new opaque cookie session does not trust legacy device ID or leak its hash',async()=>{
  let call;const h=createBeautyGameHandler({randomToken:()=>token,rpc:async(...args)=>(call=args,{ok:true,device_id:'private'})});
  const res=await run(h,'session',{headers:{cookie:'muse_device='+play}});
  assert.deepEqual(call,['session',hash,{}]);assert.deepEqual(res.body,{ok:true});assert.match(res.headers['set-cookie'],/^__Host-beauty_game=/);assert.match(res.headers['set-cookie'],/Path=\/; HttpOnly; SameSite=Lax; Secure/);assert(!JSON.stringify(res.body).includes(token));
});
test('method, origin, content type, oversized body and ambiguous cookie fail before RPC',async()=>{
  let calls=0;const h=createBeautyGameHandler({rpc:async()=>{calls++;return {ok:true};}});
  assert.equal((await run(h,'missing')).statusCode,404);
  assert.equal((await run(h,'record')).statusCode,405);
  assert.equal((await run(h,'record',{...post,headers:{...post.headers,origin:'https://evil.invalid'},body:{}})).statusCode,403);
  assert.equal((await run(h,'record',{...post,headers:{...post.headers,'content-type':'text/plain'},body:{}})).statusCode,415);
  assert.equal((await run(h,'record',{...post,body:'x'.repeat(4097)})).statusCode,413);
  assert.equal((await run(h,'stats',{headers:{cookie:cookie+'; '+cookie},query:'&character=mona'})).statusCode,401);
  assert.equal(calls,0);
});
test('stats sends no auth identity downstream and only aggregated fields outward',async()=>{
  let call;const h=createBeautyGameHandler({rpc:async(...args)=>(call=args,{answers:[{character:'mona',product:'64960',reason:'촉촉함이 중요해서',experience:'지금 쓰고 있어',test:false,device_id:'secret-device'}]})});
  const res=await run(h,'stats',{headers:{authorization:'Bearer private'},query:'&character=mona&scope=character&test=0'});
  assert.equal(res.statusCode,200);assert.deepEqual(call,['stats',hash,{characters:['mona'],test:false}]);assert.equal(res.body.votes[0].n,1);assert.equal(res.body.experienced[0].n,1);assert(!JSON.stringify(res.body).includes('secret-device'));
});
test('DB errors are generic, rate-limit is explicit, unavailable never falls back',async()=>{
  for(const status of [429,503]){let calls=0;const h=createBeautyGameHandler({rpc:async()=>{calls++;throw Object.assign(new Error('private raw SQL'),{status});}});const r=await run(h,'session');assert.equal(r.statusCode,status);assert(!JSON.stringify(r.body).includes('SQL'));assert.equal(calls,1);if(status===429)assert.equal(r.headers['retry-after'],'60');}
});
test('account linking requires explicit consent and fresh verified nonanonymous identity',async()=>{
  const calls=[];let verifies=0;const h=createBeautyGameHandler({env:{BEAUTY_GAME_ACCOUNT_LINK_ENABLED:'true'},rpc:async(...args)=>(calls.push(args),{ok:true}),verifyAccount:async()=>{verifies++;return {id,is_anonymous:false};}});
  assert.equal((await run(h,'link-account',{...post,body:{consent:false}})).statusCode,400);
  assert.equal(verifies,0);
  assert.equal((await run(h,'link-account',{...post,body:{consent:true}})).statusCode,401);
  const r=await run(h,'link-account',{...post,headers:{...post.headers,authorization:'Bearer a.b.c'},body:{consent:true}});
  assert.equal(r.statusCode,200);assert.deepEqual(calls,[['link',hash,{user_id:id,consent:true}]]);
});
test('account linking stays unavailable until account-switch/session-rotation integration is released',async()=>{
  let calls=0;const h=createBeautyGameHandler({env:{},rpc:async()=>{calls++;return {ok:true};}});
  assert.equal((await run(h,'link-account',{...post,body:{consent:true}})).statusCode,404);assert.equal(calls,0);
});
test('secret stays in fixed server RPC headers, not payload, and HTTP errors never expose bodies',async()=>{
  let request;const rpc=createGameRpc({env:{SUPABASE_SECRET_KEY:'sb_secret_fixture'},fetchImpl:async(url,init)=>(request={url,init},new Response('{"ok":true}'))});
  await rpc('session',hash,{});assert.equal(request.url,'https://mqsnshnlfwsgabrsmqsz.supabase.co/rest/v1/rpc/beauty_game_command');assert.equal(request.init.headers.apikey,'sb_secret_fixture');assert(!request.init.body.includes('fixture'));assert.equal(request.init.redirect,'error');
  const bad=createGameRpc({env:{SUPABASE_SECRET_KEY:'fixture'},fetchImpl:async()=>new Response('private',{status:403})});await assert.rejects(()=>bad('session',hash,{}),e=>e.status===503&&!e.message.includes('private'));
});
test('invitation HTTP projection never forwards accidental private fields',async()=>{
  const h=createBeautyGameHandler({rpc:async()=>({id,character:'mona',test:false,snapshot:{character:{id:'mona'}},product:'64960',reason:'safe',shade:null,advice:null,note:'secret-note',session_hash:hash})});
  const r=await run(h,'invite',{query:`&id=${id}&play=${play}&reveal=1`});assert.equal(r.statusCode,200);assert(!JSON.stringify(r.body).includes('secret-note'));assert(!JSON.stringify(r.body).includes(hash));
});
