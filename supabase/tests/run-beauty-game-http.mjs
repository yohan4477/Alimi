// Real HTTP-contract → domain → RPC → PostgreSQL integration, isolated fixture data only.
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createBeautyGameHandler} from '../../server/beauty-game-api.mjs';
import {shareSnapshot} from '../../server/beauty-game-domain.mjs';
const db=new PGlite();
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');`);
  await db.exec(await readFile(new URL('../migrations/20261023075137_beauty_game_backend.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  const rpc=async(action,hash,payload)=>{const {rows}=await db.query('select public.beauty_game_command($1,$2,$3::jsonb) data',[action,hash,JSON.stringify(payload)]);const data=rows[0].data;if(data.error)throw Object.assign(new Error('DB rejection'),{status:data.status});return data;};
  let serial=0;const h=createBeautyGameHandler({env:{BEAUTY_GAME_ACCOUNT_LINK_ENABLED:'true'},rpc,randomToken:()=>String(++serial).padStart(64,'0'),verifyAccount:async()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',is_anonymous:false})});
  const request=async(route,{cookie,body,query='',auth}={})=>{const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};await h({url:'/api/beauty-play?route='+route+query,method:body?'POST':'GET',headers:{cookie,origin:'https://seoulbeauty.me','content-type':'application/json',...(auth?{authorization:'Bearer a.b.c'}:{})},body},res);return res;};
  const s1=await request('session'),s2=await request('session');assert.equal(s1.statusCode,200);const a=s1.headers['Set-Cookie'].split(';')[0],b=s2.headers['Set-Cookie'].split(';')[0];assert.notEqual(a,b);
  const play='11111111-1111-4111-8111-111111111111',play2='22222222-2222-4222-8222-222222222222';
  const snapshot=shareSnapshot('mona'),advice=snapshot.advice[0],product=snapshot.products.find(p=>p.id==='69092');
  const answer={kind:'answer',play,character:'mona',test:false,product:product.id,shade:product.options[0].id,advice:advice.id,reasons:[advice.reasonOptions[0]],note:'PRIVATE-NOTE'};
  assert.equal((await request('record',{cookie:a,body:answer})).statusCode,200);
  assert.equal((await request('record',{cookie:a,body:answer})).statusCode,200);
  assert.equal((await request('record',{cookie:a,body:{kind:'experience',play,character:'mona',test:false,experience:'지금 쓰고 있어'}})).statusCode,200);
  const stats=await request('stats',{cookie:a,query:'&character=mona&test=0&scope=character'});assert.equal(stats.statusCode,200);assert.equal(stats.body.votes[0].n,1);assert.equal(stats.body.experienced[0].n,1);assert(!JSON.stringify(stats.body).includes('PRIVATE-NOTE'));
  const shareBody={kind:'share',play,character:'mona',test:false,channel:'copy'};
  const share=await request('record',{cookie:a,body:shareBody}),retry=await request('record',{cookie:a,body:shareBody});assert.equal(share.statusCode,200);assert.equal(share.body.id,retry.body.id);
  const invite=`&id=${share.body.id}&play=${play2}`;
  assert.equal((await request('invite',{cookie:b,query:invite+'&reveal=1'})).statusCode,403);
  const blind=await request('invite',{cookie:b,query:invite});assert.equal(blind.statusCode,200);assert(blind.body.snapshot.products.some(p=>p.id==='69092'));assert.equal(blind.body.snapshot.products.length,snapshot.products.length);assert(!Object.hasOwn(blind.body,'product'));assert(!JSON.stringify(blind.body).includes('PRIVATE-NOTE'));
  assert.equal((await request('record',{cookie:b,body:{...answer,play:play2,invite:share.body.id,note:'OTHER-PRIVATE'}})).statusCode,200);
  const reveal=await request('invite',{cookie:b,query:invite+'&reveal=1'});assert.equal(reveal.statusCode,200);assert.equal(reveal.body.product,product.id);assert(!JSON.stringify(reveal.body).includes('PRIVATE'));
  assert.equal((await request('reflection',{cookie:a,body:{character:'mona',play,test:false,mode:'used',text:'PRIVATE-REFLECTION',criteria:['사용감'],language:'ko'}})).statusCode,200);
  const linked=await request('link-account',{cookie:a,body:{consent:true},auth:true});assert.equal(linked.statusCode,200);
  const fresh=linked.headers['Set-Cookie'].split(';')[0];assert.notEqual(fresh,a);
  assert.equal((await request('record',{cookie:a,body:answer})).statusCode,401);
  const finalStats=await request('stats',{cookie:b,query:'&character=mona&scope=group&test=0'});assert.equal(finalStats.statusCode,200);assert.equal(finalStats.body.votes[0].n,2);assert(!JSON.stringify(finalStats.body).includes('PRIVATE'));
  assert.equal((await request('record',{cookie:fresh,body:{...answer,play:'33333333-3333-4333-8333-333333333333',note:''}})).statusCode,200);
  const later=await db.query("select s.user_id from beauty_game.answers a join beauty_game.sessions s using(session_hash) where play='33333333-3333-4333-8333-333333333333'");assert.equal(later.rows[0].user_id,null);
  const recovered=await request('session',{cookie:a});assert.equal(recovered.statusCode,200);assert.notEqual(recovered.headers['Set-Cookie'].split(';')[0],a);
  console.log('beauty-game-http: anonymous save/retry, experiences, aggregates, immutable share, recipient reveal, reflection and explicit account proof passed');
}finally{await db.close();}
