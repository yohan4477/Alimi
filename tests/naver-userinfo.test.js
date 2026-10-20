import test from 'node:test';
import assert from 'node:assert/strict';
import {naverUserinfo} from '../supabase/functions/naver-userinfo/handler.js';
const request = () => new Request('https://example.com/userinfo',{headers:{Authorization:'Bearer naver-test-token'}});
test('Naver userinfo normalizes a verified upstream identity without email linking',async()=>{
  const result=await naverUserinfo(request(),async(url,options)=>{
    assert.equal(url,'https://openapi.naver.com/v1/nid/me');
    assert.equal(options.headers.Authorization,'Bearer naver-test-token');
    return Response.json({resultcode:'00',response:{id:'naver-id',nickname:'Tester',email:'unverified@example.com'}});
  });
  assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await result.json(),{sub:'naver-id',name:'Tester'});
});
test('Naver userinfo rejects missing or rejected credentials',async()=>{
  assert.equal((await naverUserinfo(new Request('https://example.com'),()=>assert.fail())).status,401);
  assert.equal((await naverUserinfo(request(),async()=>Response.json({resultcode:'024'}, {status:401}))).status,401);
  assert.equal((await naverUserinfo(request(),async()=>Response.json({resultcode:'00',response:{}}))).status,401);
});
