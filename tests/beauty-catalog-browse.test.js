import test from 'node:test';import assert from 'node:assert/strict';import {browseCatalog} from '../web/beauty-play/catalog-browse.js';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync('web/beauty-play/product-data.json'));const pool=[...data.products,...JSON.parse(readFileSync('web/beauty-play/scenario-products.json'))];
test('every owned product is reachable in pages of at most ten, regardless of recommendation',()=>{
 for(const suggested of [[],['64960'],['69092','67330']]){
  const first=browseCatalog(pool,suggested),seen=[];
  for(let i=0;i<first.pages;i++){const page=browseCatalog(pool,suggested,'all',i);assert(page.items.length<=10);seen.push(...page.items.map(p=>p.id));}
  assert.equal(new Set(seen).size,pool.length);assert.deepEqual(new Set(seen),new Set(pool.map(p=>p.id)));
  for(const brand of first.brands){const result=browseCatalog(pool,suggested,brand);assert.equal(result.total,pool.filter(p=>p.brand===brand).length);assert(result.items.every(p=>p.brand===brand));}
 }
});
test('exact matches are backed by the same source goods code; special editions and bundles are not inferred',()=>{
 assert.equal(data.audit.length,30);let count=0;
 for(const a of data.audit){for(const m of a.exactOptions){assert.match(m.ean,/^\d{13}$/);assert(m.oliveYoungOption);assert(m.feedName);assert(m.size||a.position===8);count++;}if(!a.exactOptions.length)assert.equal(a.optionMatchStatus,'unconfirmed');}
 assert.equal(count,82);assert.equal(data.audit[12].exactOptions.length,0);assert.equal(data.audit[28].exactOptions.length,0);
});
