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
test('brand chips merge spellings of one brand and filter by every spelling',()=>{
 const pool=[{id:'1',brand:'fwee',name:'A'},{id:'2',brand:'Fwee',name:'B'},{id:'3',brand:'rom&nd',name:'C'},{id:'4',brand:'Romand',name:'D'}];
 const all=browseCatalog(pool);assert.deepEqual(all.brands,['fwee','rom&nd']);
 assert.deepEqual(browseCatalog(pool,[],'fwee').items.map(p=>p.id),['1','2']);
 assert.deepEqual(browseCatalog(pool,[],'rom&nd').items.map(p=>p.id),['3','4']);
});
test('brand chips use shipped logo files, wordmarks alone and square marks with the name',async()=>{
 const {brandLogo}=await import('../web/beauty-play/brand-logos.js');const {existsSync}=await import('node:fs');
 for(const brand of ['CLIO','COSRX','rom&nd','LANEIGE','3CE','BBIA']){const logo=brandLogo(brand);assert.ok(logo,brand);assert.ok(existsSync('dist'+logo.src),logo.src);}
 assert.equal(brandLogo('CLIO').wordmark,true);assert.equal(brandLogo('LANEIGE').wordmark,false);assert.equal(brandLogo('innisfree'),null);
});
test('the All chip clears a typed search so every product in the kind comes back',async()=>{
 const {readFileSync}=await import('node:fs');const page=readFileSync('web/beauty-play/page.tsx','utf8');
 assert.match(page,/setBrand\(b\);setCatalogPage\(0\);if\(b==='all'\)setCatalogQuery\(''\);/);
 assert.match(page,/더 불러오는 중/);
});
