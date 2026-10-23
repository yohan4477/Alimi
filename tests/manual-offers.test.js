import test from 'node:test';
import assert from 'node:assert/strict';
import {manualCatalog} from '../dist/manual-offers.js';
globalThis.location={pathname:'/kr',search:'?lang=ko'};
const {saveCatalogSnapshot,readCatalogSaves}=await import('../dist/saved-catalog.js');
test('owner offer preserves exact link, unknown commercial facts, and Korea boundary',()=>{
 const [p]=manualCatalog('KR',{query:'센카'});
 assert.equal(p.affiliate_url,'https://link.coupang.com/a/h0aXItmfiS');
 assert.equal(p.price_minor,null);assert.equal(p.popularity_rank,null);assert.equal(p.availability,'unknown');
 assert.equal(manualCatalog('US').length,0);assert.equal(manualCatalog('KR',{category:'립'}).length,0);
 const data=new Map(), storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 saveCatalogSnapshot(p,storage);
 assert.equal(readCatalogSaves(storage)[0].price,null);
});
test('Korea catalog and direct detail work without the remote feed and preserve pagination',async()=>{
 globalThis.location={pathname:'/kr',search:'?lang=ko'};
 const {fetchFamily,fetchFamiliesPage,searchCatalog,buyUrl,usd}=await import('../dist/live.js');
 const fail=async()=>{throw Error('unavailable')};
 const [p]=await fetchFamily('senka-perfect-whip-fa',fail);
 assert.equal(buyUrl(p,'chat-1'),p.affiliate_url);assert.equal(p.price,null);assert.notEqual(usd(p.price),'₩0');
 assert.equal((await searchCatalog('센카',fail)).length,1);
 assert.equal((await fetchFamiliesPage('전체',0,24,fail))[0].family_key,p.family_key);
 let offset;
 await fetchFamiliesPage('전체',1,24,async url=>{offset=new URL(url).searchParams.get('offset');return {ok:true,json:async()=>[]}});
 assert.equal(offset,'0');
});
test('manual search respects minimum query length and brand/category filters',async()=>{
 const {searchCatalog,fetchBrands}=await import('../dist/live.js');
 const fail=async()=>{throw Error('unavailable')};
 assert.deepEqual(await searchCatalog('',fail),[]);assert.deepEqual(await searchCatalog('센',fail),[]);
 assert.equal(manualCatalog('KR',{brand:'OTHER'}).length,0);
 assert.equal((await fetchBrands(fail))[0].brand,'SENKA');
});
test('only explicit owner-supplied unknown prices are saved, not zero or invalid commercial facts',()=>{
 const [p]=manualCatalog('KR');const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 for(const price of [0,-1,NaN,'100'])assert.throws(()=>saveCatalogSnapshot({...p,price},storage),/Invalid price/);
 assert.throws(()=>saveCatalogSnapshot({...p,source:null},storage),/Invalid price/);
 assert.equal(saveCatalogSnapshot(p,storage).availability,'unknown');
 assert.deepEqual(readCatalogSaves(storage)[0].history,[]);
});
test('current product detail and family views disclose owner affiliate links without feed claims',async()=>{
 const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
 assert.match(app,/family-affiliate-disclosure/);
 assert.match(app,/p.source==='owner_supplied'\?'detail.ownerLink':'detail.officialFeed'/);
 assert.match(app,/coupang\|\|p.source==='owner_supplied'/);
 assert.match(app,/p.source!=='owner_supplied'&&inKorea/);
});
