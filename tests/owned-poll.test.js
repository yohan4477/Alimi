import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnedPollHandler} from '../api/owned-poll.js';
async function invoke(handler,{method='GET',url='/api/owned-poll?product=64960',origin='https://seoulbeauty.me',body}={}){
 const headers={origin},res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=v}};
 await handler({method,url,headers,body},res);return {status:res.statusCode,data:JSON.parse(res.body)};
}
test('feature is disabled by default',async()=>{const r=await invoke(createOwnedPollHandler({env:{}}));assert.equal(r.status,404);});
test('reject invalid product ID before connecting database',async()=>{const r=await invoke(createOwnedPollHandler({env:{OWNED_POLL_ENABLED:'true'}}),{url:'/api/owned-poll?product=../oops'});assert.equal(r.status,503);});
test('reject cross-origin votes',async()=>{const r=await invoke(createOwnedPollHandler({env:{OWNED_POLL_ENABLED:'true'}}),{method:'POST',origin:'https://evil.example'});assert.equal(r.status,403);});
test('requires secret configuration',async()=>{const r=await invoke(createOwnedPollHandler({env:{OWNED_POLL_ENABLED:'true'}}));assert.equal(r.status,503);});

test('stores optional follow-up and returns only aggregated response',async()=>{
 const rows=[];const calls=[];const fetcher=async(url,init)=>{calls.push({url:String(url),init});if(init?.method==='POST'){const v=JSON.parse(init.body);const prior=rows.find(x=>x.product_id===v.product_id&&x.voter_id===v.voter_id);if(prior)Object.assign(prior,v);else rows.push(v);return new Response(null,{status:204});}return Response.json(rows);};
 const h=createOwnedPollHandler({env:{OWNED_POLL_ENABLED:'true',SUPABASE_SECRET_KEY:'synthetic',OWNED_POLL_COOKIE_SECRET:'s'.repeat(40)},fetcher});
 const first=await invoke(h,{method:'POST',body:{choice:'owned',followup:'daily'}});
 assert.equal(first.status,200);assert.equal(first.data.counts.owned,1);assert.equal(first.data.followupCounts.owned.daily,1);
 assert.equal(first.data.mine,'owned');assert.equal(first.data.mineFollowup,'daily');
 assert(!JSON.stringify(first.data).includes('voter_id'));
 assert.equal(calls[0].url.includes('mqsnshnlfwsgabrsmqsz'),true);
});
test('invalid follow-up rejected without database write',async()=>{
 let requests=0;const h=createOwnedPollHandler({env:{OWNED_POLL_ENABLED:'true',SUPABASE_SECRET_KEY:'synthetic',OWNED_POLL_COOKIE_SECRET:'s'.repeat(40)},fetcher:async()=>{requests++;throw Error('unexpected');}});
 const r=await invoke(h,{method:'POST',body:{choice:'want',followup:'daily'}});
 assert.equal(r.status,400);assert.equal(requests,0);
});

test('full game catalog is reachable with unique product identifiers',async()=>{
 const {readFile}=await import('node:fs/promises');
 const frontend=JSON.parse(await readFile(new URL('../dist/owned-poll/catalog.json',import.meta.url),'utf8'));
 const backend=JSON.parse(await readFile(new URL('../server/owned-poll-catalog.json',import.meta.url),'utf8'));
 assert.deepEqual(frontend,backend);
 assert.equal(frontend.length,40);
 assert.equal(new Set(frontend.map(p=>p.id)).size,frontend.length);
 assert(frontend.every(p=>p.image&&p.brand&&p.name));
});

test('accepts ordinary optional notes and rejects control characters',async()=>{
 let writes=0;const fetcher=async(_url,init)=>{if(init?.method==='POST'){writes++;return new Response(null,{status:204});}return Response.json([]);};
 const h=createOwnedPollHandler({env:{OWNED_POLL_ENABLED:'true',SUPABASE_SECRET_KEY:'sb_secret_fixture',OWNED_POLL_COOKIE_SECRET:'s'.repeat(40)},fetcher});
 assert.equal((await invoke(h,{method:'POST',body:{choice:'owned',note:'Useful everyday'}})).status,200);
 assert.equal((await invoke(h,{method:'POST',body:{choice:'owned',note:'bad\u0001'}})).status,400);
 assert.equal(writes,1);
});
test('paginates aggregate reads and separates test writes',async()=>{
 const calls=[];const h=createOwnedPollHandler({env:{OWNED_POLL_ENABLED:'true',SUPABASE_SECRET_KEY:'sb_secret_fixture',OWNED_POLL_COOKIE_SECRET:'s'.repeat(40)},fetcher:async(url,init)=>{
  calls.push({url:String(url),init});assert.equal(init.headers.Authorization,undefined);
  if(init.method==='POST'){assert.equal(JSON.parse(init.body).test,true);return new Response(null,{status:204});}
  const u=new URL(url);assert.equal(u.searchParams.get('test'),'eq.true');return Response.json(u.searchParams.get('offset')==='0'?Array.from({length:500},()=>({choice:'owned'})):[{choice:'past'}]);
 }});
 const r=await invoke(h,{method:'POST',url:'/api/owned-poll?product=64960&test=1',body:{choice:'owned'}});
 assert.equal(r.status,200);assert.equal(r.data.total,501);assert.equal(r.data.counts.owned,500);assert.equal(calls.length,3);
});
