import test from 'node:test';import assert from 'node:assert/strict';import {browseCatalog,PAGE_SIZE} from '../web/beauty-play/catalog-browse.js';
const products=Array.from({length:41},(_,i)=>({id:String(i),brand:i%2?'Brand B':'Brand A',name:'Product '+i,position:i+1}));
test('all products remain reachable across pages',()=>{const all=[];for(let i=0;i<5;i++)all.push(...browseCatalog(products,[], 'all',i).items);assert.equal(new Set(all.map(p=>p.id)).size,41);assert.equal(PAGE_SIZE,10)});
test('recommendations reorder but never hide products',()=>{const result=browseCatalog(products,['28','39']);assert.deepEqual(result.items.slice(0,2).map(p=>p.id),['28','39']);assert.equal(result.total,41)});
test('brand search and paging work together',()=>{const x=browseCatalog(products,[],'Brand A',0,'product 2');assert(x.items.every(p=>p.brand==='Brand A'));assert(x.total>0)});
test('unknown search returns empty without hiding original catalog after clearing',()=>{assert.equal(browseCatalog(products,[],'all',0,'NO MATCH').total,0);assert.equal(browseCatalog(products).total,41)});
