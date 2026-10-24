import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {configuredBeautyPlayHandler} from '../api/beauty-play.js';
const run=async(handler,{url='/api/beauty-play?route=session',method='GET',headers={},body}={})=>{const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(body){this.body=body;}};await handler({url,method,headers,body},res);return res;};
test('unset and explicit Supabase backends use only Supabase and preserve supported characters',async()=>{
 for(const backend of [undefined,'supabase']){
  const calls=[];const h=configuredBeautyPlayHandler({BEAUTY_GAME_BACKEND:backend,SUPABASE_SECRET_KEY:'synthetic-fixture'}, {fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json({ok:true});}});
  const r=await run(h,{headers:{cookie:'muse_device=10000000-1000-4000-8000-100000000001; sb-auth=private',authorization:'Bearer private'}});
  assert.equal(r.statusCode,200);assert.equal(JSON.parse(r.body).supportedCharacterIds.length,10);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://mqsnshnlfwsgabrsmqsz.supabase.co/rest/v1/rpc/beauty_game_command');
  assert.equal(calls[0].init.headers.Cookie,undefined);assert(!JSON.stringify(calls).includes('private'));
  assert.match(r.headers['set-cookie'],/^__Host-beauty_game=.*Path=\/; HttpOnly; SameSite=Lax; Secure/);
 }
});
test('D1, maintenance and invalid backend choices fail closed without any network request',async()=>{
 for(const backend of ['d1','maintenance','invalid']){
  let calls=0;const h=configuredBeautyPlayHandler({BEAUTY_GAME_BACKEND:backend},{fetchImpl:async()=>{calls++;throw Error();}});
  for(const route of ['session','record','invite','stats','share-config','reflection']){
   const r=await run(h,{url:'/api/beauty-play?route='+route});assert.equal(r.statusCode,503);assert.equal(r.headers['cache-control'],'no-store');
  }
  assert.equal(calls,0);
 }
});
test('missing Supabase credentials and Supabase failures never fall back to D1',async()=>{
 let calls=0;const fetchImpl=async url=>{calls++;assert(new URL(url).hostname.endsWith('.supabase.co'));throw Error('unavailable');};
 assert.equal((await run(configuredBeautyPlayHandler({}, {fetchImpl}))).statusCode,503);assert.equal(calls,0);
 assert.equal((await run(configuredBeautyPlayHandler({SUPABASE_SECRET_KEY:'synthetic-fixture'}, {fetchImpl}))).statusCode,503);assert.equal(calls,1);
});
test('Supabase route, method and origin guards remain enforced',async()=>{
 let calls=0;const h=configuredBeautyPlayHandler({}, {fetchImpl:async()=>{calls++;throw Error();}});
 assert.equal((await run(h,{url:'/api/beauty-play?route=admin'})).statusCode,404);
 assert.equal((await run(h,{url:'/api/beauty-play?route=record'})).statusCode,405);
 assert.equal((await run(h,{url:'/api/beauty-play?route=record',method:'POST',headers:{origin:'https://evil.invalid'},body:{}})).statusCode,403);assert.equal(calls,0);
});
test('native game bundle uses local assets and its own API path',async()=>{const html=await readFile('dist/beauty-play/index.html','utf8');assert(!html.includes('<iframe'));assert.match(html,/\/beauty-play\/bundle\//);const files=JSON.parse(await readFile('web/beauty-play/product-data.json','utf8')).products;for(const p of files){await access('dist'+p.image);for(const o of p.options)await access('dist'+o.image);}const entry=await readFile('web/beauty-play/main.tsx','utf8');assert.match(entry,/\/beauty-play/);const page=await readFile('web/beauty-play/page.tsx','utf8');assert.match(page,/new URL\('\/beauty-play\/'/);});
