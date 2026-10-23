import './fixtures/us-market.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateProductStats,rankProducts,loadProductStats,productSortControls} from '../dist/product-sort.js';
test('product ranking combines family options, deduplicates sources, and separates likes from mentions',()=>{
 const a={family_key:'a'},b={family_key:'b'},c={family_key:'c'};
 const rows=[{source:'post',id:1,item:a,likes:2},{source:'post',id:1,item:a,likes:2},{source:'chat',id:1,item:a,likes:1},{source:'comment',id:1,item:b,likes:10},{source:'chat',id:3,item:null,likes:40}];
 const stats=aggregateProductStats(rows),list=[b,c,a];
 assert.deepEqual(stats.get('a'),{mentions:2,likes:3});
 assert.deepEqual(rankProducts(list,'mentions',stats),[a,b,c]);
 assert.deepEqual(rankProducts(list,'likes',stats),[b,a,c]);
 assert.deepEqual(list,[b,c,a]);
 assert.deepEqual(rankProducts([{familyKey:'a'},b],'mentions',stats),[{familyKey:'a'},b]);
});
test('rank sample is constrained to current community rooms and parent posts',async()=>{
 const calls=[];await loadProductStats(async url=>{const u=new URL(url);calls.push(u);
 if(u.pathname.endsWith('chat_room_list'))return {ok:true,json:async()=>[{id:'us-room',service_region:'us'},{id:'kr-room',service_region:'kr'}]};
 assert.equal(u.searchParams.get('item'),'not.is.null');assert.match(u.searchParams.get('created_at'),/^gte\./);
 if(u.pathname.endsWith('community_comments'))assert.equal(u.searchParams.get('post_id'),'in.(10)');
 else assert.equal(u.searchParams.get('room_id'),'in.(us-room)');
 return {ok:true,json:async()=>u.pathname.endsWith('community_posts')?[{id:10}]:[]};});
 assert.equal(calls.length,4);assert.match(productSortControls(),/data-product-sort="likes"/);
});
