import test from 'node:test';
import assert from 'node:assert/strict';
import {readCatalogSaves,saveCatalogSnapshot,mergeCatalogSaves} from '../dist/saved-catalog.js';
test('catalog save persists a snapshot across revisits with no tracking request or invented history',()=>{
 const values=new Map(), storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const item={retailer:'Stylevana US',market:'US',sku:'999',brand:'COSRX',name:'Test product',price_minor:1750,url:'https://www.stylevana.com/test.html',affiliate_url:'https://www.awin1.com/a'};
 const saved=saveCatalogSnapshot(item,storage);
 assert.equal(saved.price,17.5);assert.deepEqual(saved.history,[]);assert.equal(saved.checkedAt,null);
 const restored=readCatalogSaves(storage);assert.equal(restored[0].id,saved.id);
 saveCatalogSnapshot({...item,price_minor:1600},storage);assert.equal(readCatalogSaves(storage).length,1);
 assert.equal(readCatalogSaves(storage)[0].price,16);
 assert.equal(mergeCatalogSaves([{...saved,id:'legacy'}],restored).length,1);
 assert.throws(()=>saveCatalogSnapshot({...item,url:'javascript:alert(1)',affiliate_url:null},storage));
});
