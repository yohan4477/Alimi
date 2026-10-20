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
test('rank query uses public attachments and a bounded 24h sample',async()=>{
 let calls=0;await loadProductStats(async url=>{calls++;const u=new URL(url);assert.equal(u.searchParams.get('item'),'not.is.null');assert.match(u.searchParams.get('created_at'),/^gte\./);return {ok:true,json:async()=>[]}});
 assert.equal(calls,3);assert.match(productSortControls(),/data-product-sort="likes"/);
});
