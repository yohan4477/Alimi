import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedCopy,productInfoHTML,safeSource} from '../dist/product-info.js';
import {descriptionText,licensedDescriptions} from '../scripts/product-content.mjs';
import {setLang} from '../dist/i18n.js';
test('affiliate descriptions require permission and exact retailer/market/SKU identity',()=>{
 const item={retailer:'Stylevana US',market:'US',sku:'12',url:'https://www.stylevana.com/a.html'};
 const row={...item,sourceUrl:item.url,description:'Product description'};
 assert.equal(approvedCopy([row],item),undefined);
 assert.equal(approvedCopy([{...row,permissionReference:'program terms 2026-10-19'}],{...item,sku:'13'}),undefined);
 assert.ok(approvedCopy([{...row,permissionReference:'program terms 2026-10-19'}],item));
 assert.throws(()=>licensedDescriptions([],[],''),/permission/);
 assert.equal(safeSource('javascript:alert(1)'),null);
 assert.equal(safeSource('https://user:pass@example.org/'),null);
});
test('category copy is labelled separately and publisher text is never interpreted as markup',()=>{
 setLang('en');
 const html=productInfoHTML({category:'립'}, {description:'<img src=x onerror=alert(1)>',sourceUrl:'https://www.stylevana.com/a'});
 assert.match(html,/Lip tints/); assert.match(html,/Affiliate-provided/);assert.match(html,/&lt;img/); assert.doesNotMatch(html,/<img/);
 assert.match(productInfoHTML({category:'missing'}),/exact purpose/);
 assert.equal(descriptionText('<script>bad()</script><p>Good &amp; useful</p><p>Next</p>'),'Good & useful\nNext');
});
