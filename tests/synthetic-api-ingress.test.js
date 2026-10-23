import './fixtures/us-market.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchRooms, fetchMyRooms, fetchMessages, messagesUrl, joinRoom, postMessage, likeMessage, reportMessage, createRoom} from '../dist/chat-api.js';
import {fetchPosts, fetchPost, fetchComments, fetchProductTalk, postsUrl, commentsUrl, mentionsUrl, createPost, addComment, likeCommunity, reportCommunity} from '../dist/community-api.js';

const ok = data => ({ok:true,status:200,json:async()=>data});
const rooms = [
  {id:'actual-room',service_region:'us'},
  {id:'demo-cx-t01',service_region:'us'},
  {id:'sample-room',service_region:'us'},
  {id:'synthetic-room',service_region:'us'},
  {id:'flagged-room',service_region:'us',demo:true},
  {id:'korean-room',service_region:'kr'}
];
const reservedProducts = ['torriden-serum','aestura-cream','roundlab-sun','anua-toner','cosrx-essence','romand-tint','clio-cushion','laneige-lip','medicube-pad','drg-cream','goodal-serum','peripera-tint'];

test('room ingress excludes synthetic flags and prefixes while preserving market filtering', async () => {
  assert.deepEqual(await fetchRooms(async()=>ok(rooms)), [rooms[0]]);
});

test('community post queries never expand synthetic room rows into follow-up requests', async () => {
  const requests=[];
  const actual={id:990000001,room_id:'actual-room',title:'Real post'};
  const result=await fetchPosts(null,30,async url=>{
    const u=new URL(url);requests.push(u);
    if(u.pathname.endsWith('/chat_room_list'))return ok(rooms);
    assert.equal(u.pathname,'/rest/v1/community_posts');
    assert.equal(u.searchParams.get('room_id'),'in.(actual-room)');
    return ok([actual,{id:2,room_id:'demo-cx-t01'},{id:3,room_id:'actual-room',demo:true},{id:4,room_id:'actual-room',item:{demo:true}},{id:5,room_id:'actual-room',item:{family_key:'torriden-serum'}}]);
  });
  assert.deepEqual(result,[actual]);assert.equal(requests.length,2);
  let calls=0;
  assert.deepEqual(await fetchPosts(null,30,async()=>{calls++;return ok(rooms.slice(1));}),[]);
  assert.equal(calls,1,'no posts request when no actual regional room remains');
});

test('membership ingress removes synthetic rooms before requesting their latest messages', async () => {
  const requests=[];
  const result=await fetchMyRooms('unchanged-author-tag',async url=>{
    const u=new URL(url);requests.push(u);
    if(u.pathname.endsWith('/chat_members')){
      assert.equal(u.searchParams.get('author_tag'),'eq.unchanged-author-tag');
      return ok([{room_id:'actual-room'},{room_id:'demo-cx-t01'},{room_id:'sample-room'},{room_id:'synthetic-room'},{room_id:'flagged-room',demo:true}]);
    }
    assert.equal(u.pathname,'/rest/v1/chat_messages');
    assert.equal(u.searchParams.get('room_id'),'eq.actual-room');
    return ok([{body:'Actual latest message'}]);
  });
  assert.deepEqual(result,[{room_id:'actual-room',last:{body:'Actual latest message'}}]);
  assert.equal(requests.length,2);
});

test('direct synthetic reads stop before any fetch, including all legacy product targets', async () => {
  const noFetch=()=>assert.fail('synthetic input reached fetch');
  for(const target of ['demo-cx-t01','sample-room','synthetic:room']){
    assert.deepEqual(await fetchMessages(target,0,noFetch),[]);
    assert.deepEqual(await fetchPosts(target,30,noFetch),[]);
    assert.equal(await fetchPost(target,noFetch),null);
    assert.deepEqual(await fetchComments(target,noFetch),[]);
    assert.throws(()=>messagesUrl(target),/Synthetic content/);
    assert.throws(()=>postsUrl(target),/Synthetic content/);
    assert.throws(()=>commentsUrl(target),/Synthetic content/);
  }
  for(const target of ['demo-product',...reservedProducts]){
    assert.deepEqual(await fetchProductTalk(target,noFetch),{reviews:[],posts:[],chatMentions:0});
    assert.throws(()=>mentionsUrl(target),/Synthetic content/);
  }
});

test('synthetic product mentions never expand their post IDs into actual post queries', async () => {
  const realPost={id:990000001,room_id:'actual-room',title:'Actual product review'};
  const result=await fetchProductTalk('torriden|dive-in-serum',async url=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/chat_room_list'))return ok(rooms);
    if(u.pathname.endsWith('/product_mentions'))return ok([
      {source:'review',source_id:990000001,post_id:990000001,room_id:'actual-room'},
      {source:'chat',source_id:990000002,room_id:'actual-room'},
      {source:'post',post_id:11,room_id:'demo-cx-t01'},
      {source:'post',post_id:12,room_id:'actual-room',demo:true},
      {source:'post',post_id:'demo-post',room_id:'actual-room'},
      {source:'post',source_id:'sample-source',post_id:13,room_id:'actual-room'},
      {source:'chat',source_id:14,room_id:'synthetic-room'}
    ]);
    assert.equal(u.pathname,'/rest/v1/community_posts');
    assert.equal(u.searchParams.get('id'),'in.(990000001)');
    return ok([realPost,{id:15,room_id:'actual-room',demo:true},{id:16,room_id:'demo-cx-t01'}]);
  });
  assert.deepEqual(result,{reviews:[realPost],posts:[],chatMentions:1});
});

test('synthetic writes reject before RPC for room, reply, post, message or attached product targets', async () => {
  const noFetch=()=>assert.fail('synthetic input reached RPC');
  const actions=[
    ()=>joinRoom('secret','demo-cx-t01',noFetch),
    ()=>postMessage('secret','sample-room','text',null,null,noFetch),
    ()=>postMessage('secret','actual-room','text',null,'demo-message',noFetch),
    ()=>postMessage('secret','actual-room','text',{demo:true},null,noFetch),
    ()=>createPost('secret','synthetic-room',{kind:'question',title:'title'},noFetch),
    ()=>createPost('secret','actual-room',{kind:'question',title:'title',demo:true},noFetch),
    ()=>createPost('secret','actual-room',{kind:'question',title:'title',fromMessage:'sample-message'},noFetch),
    ()=>addComment('secret','demo-post','text',null,noFetch),
    ()=>likeMessage('secret','demo-message',noFetch),
    ()=>reportMessage('secret','sample-message','spam',noFetch),
    ()=>likeCommunity('secret','post','demo-post',noFetch),
    ()=>reportCommunity('secret','comment','synthetic-comment','spam',noFetch)
  ];
  for(const action of actions)await assert.rejects(action,/Synthetic content/);
  for(const product of reservedProducts){
    await assert.rejects(()=>postMessage('secret','actual-room','text',{family_key:product},null,noFetch),/Synthetic content/);
    await assert.rejects(()=>createPost('secret','actual-room',{kind:'question',title:'title',item:{id:product}},noFetch),/Synthetic content/);
    await assert.rejects(()=>addComment('secret',990000001,'text',{sku:product},noFetch),/Synthetic content/);
  }
});

test('actual numeric IDs, overlapping product names and anonymous RPC ownership payloads stay unchanged', async () => {
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return ok({id:990000001});};
  const item={id:990000005,name:'Torriden Serum',family_key:'torriden|dive-in-serum',retailer:'Actual shop',market:'US',sku:'990000005'};
  await postMessage('original-secret','actual-room','Torriden Serum',item,990000002,fetchImpl);
  assert.deepEqual(calls[0].body,{p_secret:'original-secret',p_room:'actual-room',p_body:'Torriden Serum',p_retailer:'Actual shop',p_market:'US',p_sku:'990000005',p_reply_to:990000002});
  await createPost('original-secret','actual-room',{kind:'question',title:'Torriden Serum',item,fromMessage:990000002},fetchImpl);
  await addComment('original-secret',990000001,'actual comment',item,fetchImpl);
  await likeMessage('original-secret',990000001,fetchImpl);
  await reportMessage('original-secret',990000001,'spam',fetchImpl);
  await likeCommunity('original-secret','post',990000001,fetchImpl);
  await reportCommunity('original-secret','comment',990000001,'spam',fetchImpl);
  await createRoom('original-secret',{title:'Torriden Serum'},fetchImpl);
  assert.equal(calls.length,8);
  assert.ok(calls.every(call=>call.body.p_secret==='original-secret'));
  assert.equal(calls[2].body.p_post,990000001);
  assert.equal(calls[3].body.p_message,990000001);
  assert.equal(calls[5].body.p_id,990000001);
  assert.equal(calls[7].body.p_title,'Torriden Serum');
});

test('direct actual post/message/comment reads preserve large numeric IDs but discard flagged synthetic results', async () => {
  const actual={id:990000001,room_id:'actual-room'};
  assert.deepEqual(await fetchMessages('actual-room',990000000,async url=>{
    assert.equal(new URL(url).searchParams.get('id'),'gt.990000000');return ok([actual,{id:2,demo:true},{id:'demo-message'},{id:3,item:{demo:true}},{id:4,item:{family_key:'torriden-serum'}}]);
  }),[actual]);
  assert.deepEqual(await fetchComments(990000001,async url=>{
    assert.equal(new URL(url).searchParams.get('post_id'),'eq.990000001');return ok([{id:990000002,post_id:990000001},{id:2,demo:true},{id:3,item:{demo:true}},{id:4,item:{family_key:'torriden-serum'}}]);
  }),[{id:990000002,post_id:990000001}]);
  assert.deepEqual(await fetchPost(990000001,async url=>ok(new URL(url).pathname.endsWith('/chat_room_list')?rooms:[actual])),actual);
  let calls=0;
  assert.equal(await fetchPost(990000001,async()=>{calls++;return ok([{id:990000001,room_id:'demo-cx-t01'}]);}),null);
  assert.equal(calls,1,'discard known synthetic result before another room lookup');
});
