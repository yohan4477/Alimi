import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAccountActivity} from '../dist/account-activity.js';
const json=(data,status=200)=>({ok:status<400,status,json:async()=>data});
test('account activity requires login and does not contact backend as guest',async()=>{
 let calls=0;assert.equal(await loadAccountActivity({user:null,session:null},{fetchImpl:async()=>{calls++;throw Error('unexpected')}}),null);assert.equal(calls,0);
});
test('account identity must be linked before retrieving own activity; authorization uses bearer token',async()=>{
 const calls=[],storage={getItem(k){return k==='alimi-chat-secret'?'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa':null},setItem(){}};
 const auth={user:{id:'user-a'},session:{access_token:'access-a'}};
 const result=await loadAccountActivity(auth,{storage,fetchImpl:async(url,opts)=>{
   calls.push({url,opts});return json(url.endsWith('/link_my_chat_identity')?{linked:true}:{posts:[{id:1}],votes:[]});
 }});
 assert.equal(result.posts[0].id,1);assert.equal(calls.length,2);
 assert.match(calls[0].url,/link_my_chat_identity$/);
 assert.equal(JSON.parse(calls[0].opts.body).p_secret,'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
 assert.equal(calls[0].opts.headers.Authorization,'Bearer access-a');
 assert.match(calls[1].url,/get_my_account_activity$/);
 assert.equal(calls[1].opts.headers.Authorization,'Bearer access-a');
});
test('link failure prevents activity retrieval',async()=>{
 let calls=0;const auth={user:{id:'a'},session:{access_token:'token'}};
 await assert.rejects(loadAccountActivity(auth,{storage:{getItem:()=> 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},fetchImpl:async()=>{calls++;return json({},403)}}),/account_activity_403/);
 assert.equal(calls,1);
});
test('account switch during retrieval drops stale response',async()=>{
 const auth={user:{id:'a'},session:{access_token:'token'}};
 let calls=0;
 const result=await loadAccountActivity(auth,{storage:{getItem:()=> 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},fetchImpl:async()=>{
  calls++;if(calls===2)auth.user={id:'b'};return json({});
 }});
 assert.equal(result,null);
});
