import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'});
try{
 const p=await b.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];
 await p.addInitScript(()=>localStorage.setItem('seoulbeauty-interests-v1',JSON.stringify({version:1,skincare:false,makeup:false,concerns:[],done:true}))); // returning visitor: no first-visit flow
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('request_tracking'))requests.push(r.url())});
 const item={retailer:'Stylevana US',market:'US',sku:'local-999',brand:'COSRX',name:'Local sample',category:'립',price_minor:1700,currency:'USD',availability:'in_stock',image_url:null,url:'https://www.stylevana.com/test.html',affiliate_url:null};
 await p.route('**/rest/v1/**',r=>{const u=new URL(r.request().url());return r.fulfill({json:u.pathname.endsWith('/catalog_items')?[item]:[]})});
 await p.goto((process.argv[2]??'http://localhost:3000/')+'?lang=en');
 await p.click('#tabbar [data-screen="search"]');await p.click('.explore-link');
 await p.locator('#list-title').waitFor();assert.equal(await p.locator('#list-title').innerText(),'Explore products');
 await p.click('#tabbar [data-screen="search"]');await p.fill('#search','Local');await p.locator('[data-catalog-save]').waitFor();await p.click('[data-catalog-save]');
 await p.click('#tabbar [data-screen="saved"]');await p.locator('#saved .saved-card').waitFor();
 await p.reload();await p.locator('#chat:not([hidden])').waitFor();await p.click('#tabbar [data-screen="saved"]');
 await p.locator('#saved .saved-card .product-open').click();
 assert.equal(await p.locator('#set-target,.target-section,.analysis-section,#target-dialog').count(),0);
 assert.ok((await p.locator('#detail').innerText()).includes('Saved product snapshot'));
 assert.equal(await p.locator('#detail .buy-cta').getAttribute('href'),item.url);
 assert.deepEqual(requests,[],'saving and revisiting must never enroll price tracking');assert.deepEqual(errors,[]);
 console.log('ok - local product save/revisit, snapshot disclosure, purchase link and no tracking RPC/UI');
}finally{await b.close()}
