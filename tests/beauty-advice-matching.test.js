import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {browseCatalog,matchingProducts} from '../web/beauty-play/catalog-browse.js';
const read=f=>JSON.parse(readFileSync('web/beauty-play/'+f));
const products=[...read('product-data.json').products.map(p=>({...p,category:p.category||'lip'})),...read('scenario-products.json')],advice=read('advice-data.json');
test('every answer only offers products of the kind it asks for, suggested first',()=>{
 for(const [character,options] of Object.entries(advice))for(const a of options){
  const kinds=new Set(a.productIds.map(id=>products.find(p=>p.id===id).category)),pool=matchingProducts(products,a.productIds);
  assert.ok(pool.length>=a.productIds.length,character+'/'+a.id);
  assert.ok(pool.every(p=>kinds.has(p.category)),character+'/'+a.id+' leaks '+[...new Set(pool.map(p=>p.category))]);
  assert.deepEqual(browseCatalog(pool,a.productIds).items.slice(0,a.productIds.length).map(p=>p.id),a.productIds,character+'/'+a.id);
 }
});
test('a lip answer keeps every lip product reachable',()=>{
 assert.equal(matchingProducts(products,advice.mona.find(a=>a.id==='moist').productIds).length,products.filter(p=>p.category==='lip').length);
 assert.equal(matchingProducts(products,[]).length,products.length);
});
