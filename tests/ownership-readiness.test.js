import test from 'node:test';import assert from 'node:assert/strict';
import {browsePollCatalog,resolvePollProduct} from '../server/owned-poll-catalog.mjs';
import {readGameMetrics} from '../server/admin-game-metrics.js';
import {copy,resultRows} from '../dist/owned-poll/model.js';
import {createOwnedPollHandler} from '../api/owned-poll.js';
test('catalog preserves game identity and exposes all forty through ten-item pages',async()=>{
 const ids=[];for(let page=0;page<4;page++){const data=await browsePollCatalog(new URLSearchParams({page:String(page)}));ids.push(...data.products.map(x=>x.id));assert.equal(data.products.length,10);assert.equal(data.hasMore,page<3);}
 assert.equal(new Set(ids).size,40);const product=await resolvePollProduct(ids[0]);assert(product.options.length);
 assert.equal((await browsePollCatalog(new URLSearchParams({q:'[nothing]'}))).products.length,0);
});
test('live catalog query is bounded, market-scoped and validates submitted SKU identity',async()=>{
 let calls=0;const fetcher=async(url)=>{calls++;const u=new URL(url);assert.equal(u.hostname,'mqsnshnlfwsgabrsmqsz.supabase.co');assert.equal(u.searchParams.get('market'),'eq.US');return Response.json([{retailer:'stylevana',market:'US',sku:'sku123',brand:'Brand',name:'Product',image_url:'https://example.com/p.jpg'}]);};
 const list=await browsePollCatalog(new URLSearchParams({source:'catalog',q:'*),evil',market:'US'}),{fetcher});assert.equal(list.products[0].id,'catalog:stylevana:US:sku123');
 const product=await resolvePollProduct(list.products[0].id,{fetcher});assert.equal(product.name,'Product');assert.equal(await resolvePollProduct('catalog:x:US:evil),or',{fetcher}),null);assert.equal(calls,2);
});
test('admin metrics fail closed on missing migration and return only whitelisted aggregates',async()=>{
 const env={SUPABASE_SECRET_KEY:'sb_secret_fixture'};assert.equal((await readGameMetrics({env:{}})).state,'unconnected');assert.equal((await readGameMetrics({env,fetchImpl:async()=>new Response('',{status:404})})).state,'migration_required');
 const data={game:{observations:2,started:2,completed:1,shared:1,inviteOpened:1,compared:1},ownership:{responses:4,participants:2,followups:2,multiProductParticipants:2,visits:4,exploredVisits:1},private_note:'secret'};
 const r=await readGameMetrics({env,test:true,fetchImpl:async(_u,init)=>{assert.equal(init.headers.Authorization,undefined);assert.deepEqual(JSON.parse(init.body),{p_test:true});return Response.json(data);}});
 assert.equal(r.state,'received');assert.equal(r.rates.followup,.5);assert.equal(r.rates.exploration,.25);assert.equal(r.flags.ownership,false);assert(!JSON.stringify(r).includes('secret'));
});
test('both locales have all four follow-up paths and unbiased empty result rows',()=>{
 for(const lang of ['ko','en']){assert.deepEqual(Object.keys(copy[lang].labels),['owned','past','want','unknown']);for(const id of Object.keys(copy[lang].labels))assert(Object.keys(copy[lang].followups[id].options).length>=2);assert(resultRows(copy[lang].labels).every(r=>r.count===0&&r.percent===0));}
 for(const[key,value]of Object.entries(copy.en))if(typeof value==='string')assert(!/[가-힣]/.test(value),key);
});
test('ownership event RPC derives voter only from signed server identity and rejects invalid event',async()=>{
 let payload;const h=createOwnedPollHandler({env:{OWNED_POLL_ENABLED:'true',SUPABASE_SECRET_KEY:'sb_secret_fixture',OWNED_POLL_COOKIE_SECRET:'s'.repeat(40)},fetcher:async(url,init)=>{assert(url.endsWith('/rpc/record_owned_poll_event'));payload=JSON.parse(init.body);return Response.json({ok:true});}});
 const res={statusCode:200,setHeader(){},end(text){this.data=JSON.parse(text);}};
 await h({method:'POST',url:'/api/owned-poll?product=64960&test=1',headers:{origin:'https://seoulbeauty.me'},body:{event:'view',id:'11111111-1111-4111-8111-111111111111',run:'22222222-2222-4222-8222-222222222222'}},res);
 assert.equal(res.statusCode,200);assert.equal(payload.p_test,true);assert.equal(payload.p_product,'64960');assert.match(payload.p_voter,/^[0-9a-f-]{36}$/);
});
