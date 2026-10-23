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
