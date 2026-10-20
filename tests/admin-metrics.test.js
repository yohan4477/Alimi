import test from 'node:test';
import assert from 'node:assert/strict';
import {readMetrics} from '../server/admin-metrics.js';
const now = new Date('2026-10-20T00:00:00Z');
const env = {SUPABASE_SECRET_KEY:'sb_secret_test-only'};
const row = (id, device_id, name) => ({id,device_id,name,received_at:'2026-10-19T00:00:00Z'});
test('metrics distinguishes absent connection, denied, failed and truncated data', async()=>{
  assert.equal((await readMetrics({env:{},fetchImpl:()=>assert.fail('no connection')})).state,'unconnected');
  assert.equal((await readMetrics({env,fetchImpl:async()=>new Response('',{status:403})})).state,'denied');
  assert.equal((await readMetrics({env,fetchImpl:async()=>{throw Error('offline')}})).state,'unavailable');
  const r=await readMetrics({env,now,fetchImpl:async()=>new Response(JSON.stringify([row(1,'a','product_view')]),{headers:{'content-range':'0-0/2000'}})});
  assert.equal(r.state,'partial');assert.equal(r.metrics,null);
});
test('metrics counts devices per event, excludes test traffic and never returns raw rows', async()=>{
  const rows=[row(1,'a','product_view'),row(2,'a','product_view'),row(3,'b','merchant_click'),{...row(4,'test','community_open'),app_version:'verify'}];
  const r=await readMetrics({env,now,fetchImpl:async(url,init)=>{
    assert.match(url,/mqsnshnlfwsgabrsmqsz/);assert.equal(init.headers.apikey,env.SUPABASE_SECRET_KEY);
    return new Response(JSON.stringify(rows),{headers:{'content-range':'0-3/4'}});
  }});
  assert.equal(r.metrics.detail,1);assert.equal(r.metrics.merchant,1);assert.equal(r.metrics.community,0);
  assert.equal(r.transactions,'unconnected');assert.equal(r.funnel,'unmeasured');
  assert.doesNotMatch(JSON.stringify(r),/device_id|sb_secret|product_view/);
});
test('empty received dataset remains no_data, not fabricated zero KPIs',async()=>{
  const r=await readMetrics({env,now,fetchImpl:async()=>new Response('[]',{headers:{'content-range':'*/0'}})});
  assert.equal(r.state,'no_data');assert.equal(r.metrics,null);
});

test('region filter separates pilots and leaves legacy events unclassified',async()=>{
 const rows=[{...row(1,'kr-user','product_view'),props:{service_region:'kr'}},{...row(2,'us-user','product_view'),props:{service_region:'us'}},row(3,'legacy','product_view')];
 const fetchImpl=async()=>new Response(JSON.stringify(rows),{headers:{'content-range':'0-2/3'}});
 const kr=await readMetrics({env,now,fetchImpl,serviceRegion:'kr'});
 assert.equal(kr.metrics.detail,1);assert.equal(kr.unknownRegionEvents,1);assert.equal(kr.serviceRegion,'kr');
 assert.equal((await readMetrics({env,now,fetchImpl,serviceRegion:'all'})).metrics.detail,3);
});
