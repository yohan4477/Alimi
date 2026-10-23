import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {normalizeTransaction, verifySignature, requestBody, databaseConfig} from '../server/affiliate-attribution.js';
import {createAffiliateImportHandler} from '../api/affiliate-import.js';

const now = Date.parse('2026-10-23T01:00:00Z');
const secret = 'test-only-secret-'.repeat(3);
const env = {SUPABASE_URL:'https://example.supabase.co', SUPABASE_SECRET_KEY:'sb_secret_test', AFFILIATE_IMPORT_SECRET:secret, AFFILIATE_IMPORT_NETWORKS:'awin'};
const event = {network:'awin', transaction_id:'fixture-order-1', revision:1, status:'pending', currency:'USD', sale_minor:2500, commission_minor:250, source_ref:'post-12', occurred_at:'2026-10-23T00:00:00.000Z'};
const sign = (body, timestamp) => createHmac('sha256',secret).update(timestamp + '.').update(body).digest('hex');
async function call({body = JSON.stringify(event), timestamp = String(now / 1000), signature, method = 'POST', headers = {}, config = env, fetchImpl = async () => new Response('"accepted"')} = {}) {
  const req = {body, method, headers:{'content-type':'application/json', 'x-affiliate-timestamp':timestamp, 'x-affiliate-signature':signature ?? sign(typeof body === 'object' ? JSON.stringify(body) : body,timestamp), ...headers}};
  const res = {headers:{}, setHeader(k,v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); }};
  await createAffiliateImportHandler({env:config, fetchImpl, now:() => now})(req,res); return res;
}

test('normalizes exact, minimal provider snapshots with integer money and public content refs', () => {
  assert.equal(normalizeTransaction(event,now).occurred_at,'2026-10-23T00:00:00.000Z');
  for (const patch of [{email:'private@example.com'},{revision:0},{revision:1.5},{sale_minor:-1},{commission_minor:0.1},{currency:'BTC'},{status:'paid'},{source_ref:'user-12'},{source_ref:'post-0'},{source_ref:'post-12?email=a'},{occurred_at:'2027-10-23T00:00:00Z'},{transaction_id:'../x'},{network:'unknown'}]) assert.throws(() => normalizeTransaction({...event,...patch},now));
  assert.throws(() => normalizeTransaction({...event,source_ref:undefined},now));
  assert.equal(normalizeTransaction({...event,source_ref:null,status:'reversed',revision:2},now).status,'reversed');
});
test('HMAC authenticates exact bytes, timestamp and bounded replay window', () => {
  const body = JSON.stringify(event), timestamp=String(now/1000), sig=sign(body,timestamp);
  assert.equal(verifySignature(body,timestamp,sig,secret,now),true);
  for (const args of [[body+' ',timestamp,sig,secret,now],[body,timestamp,sig,secret,now+300001],[body,timestamp,'a',secret,now],[body,timestamp,sig,'short',now],[body,String(+timestamp+301),sig,secret,now]]) assert.equal(verifySignature(...args),false);
});
test('body reader limits streamed and parsed bodies for canonical signing', async () => {
  assert.equal((await requestBody(Readable.from(['{"a":', '1}']))).toString(),'{"a":1}');
  await assert.rejects(requestBody(Readable.from(['x'.repeat(8193)])));
  assert.equal((await requestBody({body:{a:1}})).toString(),'{"a":1}');
  await assert.rejects(requestBody({body:''}));
});
test('database endpoint cannot send secrets to arbitrary destinations', () => {
  for (const url of ['http://example.supabase.co','https://example.com','https://example.supabase.co@evil.com','https://example.supabase.co/path','https://example.supabase.co?x=y']) assert.equal(databaseConfig({...env,SUPABASE_URL:url}),null);
  assert.equal(databaseConfig(env).headers.Authorization,undefined);
  assert.equal(databaseConfig({...env,SUPABASE_SECRET_KEY:'legacy'}).headers.Authorization,'Bearer legacy');
});
test('default disabled, method, content type, signature and allowlist fail closed without writing', async () => {
  const noFetch=() => assert.fail('must not write');
  for (const [options,status] of [[{config:{}},503],[{method:'GET'},405],[{headers:{'content-type':'text/plain'}},415],[{signature:'a'.repeat(64)},401],[{timestamp:String(now/1000-301)},401],[{body:JSON.stringify({...event,network:'rakuten'})},403],[{body:JSON.stringify({...event,email:'x'})},400]]) assert.equal((await call({...options,fetchImpl:noFetch})).statusCode,status);
});
test('valid import calls only service RPC, supports duplicate and does not expose transaction data', async () => {
  let sent;
  const res = await call({fetchImpl:async (url,init) => { sent={url,init}; return new Response('"duplicate"'); }});
  assert.equal(res.statusCode,200); assert.deepEqual(res.body,{state:'duplicate'});
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.equal(sent.url,'https://example.supabase.co/rest/v1/rpc/ingest_affiliate_transaction');
  assert.deepEqual(JSON.parse(sent.init.body),{p_transaction:normalizeTransaction(event,now)});
  assert.equal((await call({body:event})).statusCode,200);
  assert.equal(sent.init.redirect,'error'); assert.equal(sent.init.headers.apikey,env.SUPABASE_SECRET_KEY);
});
test('storage conflicts/failures never report successful attribution or leak upstream errors', async () => {
  for (const [fetchImpl,status,state] of [[async()=>new Response('private detail',{status:409}),409,'revision_conflict'],[async()=>new Response('private detail',{status:500}),503,'storage_unavailable'],[async()=>new Response('{}'),503,'storage_unavailable'],[async()=>{throw Error('secret');},503,'storage_unavailable']]) {
    const res=await call({fetchImpl}); assert.equal(res.statusCode,status); assert.deepEqual(res.body,{state});
  }
});
