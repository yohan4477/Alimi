import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBeautyGameHandler,GAME_COOKIE} from '../server/beauty-game-api.mjs';
import {resolveGameStart} from '../web/beauty-play/game-start.js';

// Synthetic UUIDs only. No production invitations or private source data.
const oldId='11111111-1111-4111-8111-111111111111';
const newId='22222222-2222-4222-8222-222222222222';
const play='33333333-3333-4333-8333-333333333333';
const origin='https://seoulbeauty-muse-play.yohan4477.chatgpt.site';
const env={BEAUTY_GAME_LEGACY_REDIRECT_ENABLED:'true',BEAUTY_GAME_LEGACY_INVITE_IDS:oldId,BEAUTY_GAME_LEGACY_INVITE_PATH:'/'};
const failure=status=>Object.assign(new Error('private upstream details'),{status});
const run=async(handler,{id=oldId,reveal=false,body,headers={}}={})=>{
  const route=body?'record':'invite';
  const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(v){this.body=JSON.parse(v);}};
  await handler({url:`/api/beauty-play?route=${route}&id=${id}&play=${play}${reveal?'&reveal=1':''}`,method:body?'POST':'GET',
    headers:{cookie:`${GAME_COOKIE}=${'a'.repeat(64)}`,origin:'https://seoulbeauty.me','content-type':'application/json',...headers},body},response);
  return response;
};
const redirecting=(options={})=>createBeautyGameHandler({env,rpc:async()=>{throw failure(404);},fetchImpl:async()=>{throw Error('No legacy fetch is allowed');},...options});

test('old invitations stay missing even with stale legacy configuration, with no fetch or navigation',async()=>{
 let fetches=0;const calls=[];
 const handler=redirecting({fetchImpl:async()=>{fetches++;throw Error();},rpc:async(...args)=>{calls.push(args);throw failure(404);}});
 for(const options of [{},{id:newId},{reveal:true},{id:oldId.toUpperCase()}]){
  const response=await run(handler,options);
  assert.equal(response.statusCode,404);assert(!response.body.legacyInviteUrl);
  assert.equal(response.headers.location,undefined);assert.equal(response.headers['cache-control'],'private, no-store');
 }
 assert.equal(fetches,0);assert.equal(calls.length,4);assert(calls.every(call=>call[0]==='invite'));
});

test('existing Supabase share always wins, even if a UUID also appears in legacy configuration',async()=>{
  const data={id:oldId,character:'mona',test:false,snapshot:{character:{id:'mona'}}};
  const response=await run(redirecting({rpc:async()=>data}));
  assert.equal(response.statusCode,200);assert.equal(response.body.id,oldId);assert(!response.body.legacyInviteUrl);
});

test('auth failures, invalid input, unavailable backend, rate limits, and disabled bridge never redirect',async()=>{
  for(const status of [400,401,403,409,429,503]) {
    const response=await run(redirecting({rpc:async()=>{throw failure(status);}}));
    assert.equal(response.statusCode,status);assert(!response.body.legacyInviteUrl);
  }
  assert.equal((await run(redirecting({env:{}}))).statusCode,404);
  assert.equal((await run(redirecting(),{headers:{cookie:''}})).statusCode,401);
  assert.equal((await run(redirecting(),{id:'invalid'})).statusCode,400);
  assert.equal((await run(redirecting({env:{...env,BEAUTY_GAME_LEGACY_INVITE_PATH:undefined}}))).statusCode,404);
});

test('a legacy-linked write never redirects or writes to another database',async()=>{
  const calls=[];const handler=redirecting({rpc:async(...args)=>{calls.push(args);throw failure(404);}});
  const response=await run(handler,{body:{kind:'share',invite:oldId,play,character:'mona',test:false,channel:'copy'}});
  assert.equal(response.statusCode,404);assert(!response.body.legacyInviteUrl);
  assert.deepEqual(calls.map(call=>call[0]),['invite']);
});

test('frontend direct and new-invitation startup preserve session and snapshot contracts',async()=>{
  const sessionInfo={ok:true,accountLinkEnabled:false};
  assert.deepEqual(await resolveGameStart({fetchImpl:async()=>Response.json(sessionInfo)}),{sessionInfo,invitation:null});
  const invitation={id:newId,character:'mona',test:0,snapshot:{character:{id:'mona'},products:[],advice:[]}};
  const result=await resolveGameStart({invite:newId,play,fetchImpl:async url=>Response.json(url==='/api/session'?sessionInfo:invitation)});
  assert.deepEqual(result,{sessionInfo,invitation});
});

test('frontend never treats failed lookups or untrusted redirect destinations as ready gameplay',async()=>{
  for(const status of [401,403,404,409,429,503]) {
    await assert.rejects(()=>resolveGameStart({invite:oldId,play,fetchImpl:async url=>url==='/api/session'?Response.json({ok:true}):Response.json({error:'legacy_invite',legacyInviteUrl:`${origin}/?invite=${oldId}`},{status})}));
  }
  await assert.rejects(()=>resolveGameStart({invite:oldId,play,fetchImpl:async url=>url==='/api/session'?Response.json({ok:true}):Response.json({error:'legacy_invite',legacyInviteUrl:'https://evil.invalid/'},{status:409})}));
  let calls=0;
  await assert.rejects(()=>resolveGameStart({invite:oldId,play,fetchImpl:async()=>{calls++;return Response.json({error:'unavailable'},{status:503});}}));
  assert.equal(calls,1);
});

test('page gates all game records and early interactions until invitation resolution, before first analytics',()=>{
  const page=readFileSync(new URL('../web/beauty-play/page.tsx',import.meta.url),'utf8');
  assert.match(page,/async function post\(body:any\)\{if\(!canWrite\.current\)throw/);
  assert.match(page,/if\(!play\.current\|\|!canWrite\.current\)return/);
  assert.equal((page.match(/if\(canWrite\.current\)recordFirstChoice/g)||[]).length,2);
  assert.match(page,/<button key=\{a.id\} disabled=\{!ready\}/);
  assert.match(page,/<button className=\{'product '\+\(pick===p.id\?'selected':''\)\}[^>]* disabled=\{!ready\}/);
  assert.doesNotMatch(page,/<select className="story-switch"/);
  const startup=page.slice(page.indexOf('const start=await resolveGameStart'),page.indexOf("useEffect(()=>{if(!ready"));
  assert(startup.indexOf('if(!alive)return')<startup.indexOf('canWrite.current=true'));
  assert.doesNotMatch(page,/legacyInviteUrl|location.replace/);
  assert.match(page,/이 초대 링크는 더 이상 사용할 수 없어요/);
  assert.match(page,/This invite link is unavailable/);
  assert(startup.indexOf('canWrite.current=true')<startup.indexOf("event('pilot_view'"));
  assert.match(startup,/return\(\)=>\{alive=false;canWrite\.current=false;controller\.abort\(\);\}/);
});
