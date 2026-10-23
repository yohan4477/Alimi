import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedCopy,productInfoHTML,safeSource} from '../dist/product-info.js';
import {descriptionText,licensedDescriptions} from '../scripts/product-content.mjs';
import {setLang} from '../dist/i18n.js';
const grant={status:'verified',retailer:'Stylevana US',market:'US',platforms:['web'],uses:['product_description'],evidenceUrl:'https://example.org/advertiser-terms',checkedAt:'2026-10-21T00:00:00Z'};
test('affiliate descriptions require permission and exact retailer/market/SKU identity',()=>{
 const item={retailer:'Stylevana US',market:'US',sku:'12',url:'https://www.stylevana.com/a.html'};
 const row={...item,sourceUrl:item.url,description:'Product description'};
 assert.equal(approvedCopy([row],item),undefined);
 assert.equal(approvedCopy([{...row,permissionReference:grant}],{...item,sku:'13'}),undefined);
 assert.ok(approvedCopy([{...row,permissionReference:grant}],item));
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

test('catalog description is shown only with a recorded permission and a safe source link', async () => {
  const {catalogCopy} = await import('../dist/product-info.js');
  const item = {retailer: 'Stylevana US', market: 'US', sku: '10759', url: 'https://www.stylevana.com/a.html'};
  const row = {url: 'https://www.stylevana.com/a.html', description: 'Snail mucin essence for hydration.', description_permission: JSON.stringify(grant)};
  assert.equal(catalogCopy(row, item).description, row.description);
  assert.equal(catalogCopy({...row, description_permission: ''}, item), null);
  assert.equal(catalogCopy({...row, description: ' '}, item), null);
  assert.equal(catalogCopy({...row, url: 'javascript:alert(1)'}, {...item, url: 'javascript:alert(1)'}), null);
});

test('collector stores feed descriptions only when catalog.json records the permission basis', async () => {
  const {buildCatalogItems} = await import('../scripts/stylevana-catalog.mjs');
  const row = {data_feed_id: '1', merchant_id: '2', currency: 'USD', merchant_product_id: '9', brand_name: 'COSRX', product_name: 'COSRX - Snail Essence 100ml', search_price: '17.50',
    merchant_deep_link: 'https://www.stylevana.com/a.html', aw_deep_link: 'https://www.awin1.com/pclick.php?p=1&a=2&m=2', in_stock: '1', description: '<p>Lightweight <b>snail</b> essence &amp; toner.</p>'};
  const base = {feedId: '1', merchantId: '2', currency: 'USD', retailer: 'Stylevana US', market: 'US'};
  const [withPerm] = buildCatalogItems([row], {...base, descriptionPermission: grant}, 'now');
  assert.equal(withPerm.description, 'Lightweight snail essence & toner.');
  assert.deepEqual(JSON.parse(withPerm.description_permission), grant);
  const [without] = buildCatalogItems([row], base, 'now');
  assert.equal(without.description, null);
});

test('unreviewed feed notes and web-only permission cannot authorize native reuse',async()=>{const {contentGrant}=await import('../dist/content-rights.js');assert.equal(contentGrant('Awin feed; app reuse terms not yet reviewed',{retailer:'Stylevana US'}),null);assert.equal(contentGrant(grant,{retailer:'Stylevana US',platform:'native'}),null);assert.equal(contentGrant({...grant,status:'pending_review'},{retailer:'Stylevana US'}),null);assert.equal(contentGrant({...grant,uses:['product_image']},{retailer:'Stylevana US'}),null);});
