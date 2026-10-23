import {contentGrant} from '../dist/content-rights.js';
// Publish only descriptions covered by an explicitly recorded advertiser permission.
// No crawling. Input must be the approved advertiser's Awin feed; matching uses retailer + market + SKU.
import {readFile, writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCsv} from './stylevana-feed.mjs';
import {buildCatalogItems} from './stylevana-catalog.mjs';
import {makeBrandInfo} from './catalog-taxonomy.mjs';
import {descriptionText} from './stylevana-catalog.mjs';
export {descriptionText};
export function licensedDescriptions(rows, items, permissionReference, checkedAt) {
  const grant=contentGrant(permissionReference,{retailer:'Stylevana US',market:'US'});
  if (!grant) throw Error('Verified advertiser permission is required; no descriptions published');
  const index = new Map(rows.filter(r => r.description).map(r => [r.merchant_product_id, r]));
  return items.flatMap(i => {
    const row = index.get(i.sku), description = descriptionText(row?.description);
    return description ? [{retailer:i.retailer, market:i.market, sku:i.sku, description, sourceUrl:i.url,
      permissionReference:JSON.stringify(grant), checkedAt}] : [];
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const evidence = process.env.STYLEVANA_DESCRIPTION_PERMISSION_REFERENCE;
    if (!evidence?.trim()) throw Error('Record advertiser description usage permission before publishing');
    const bytes = await readFile(process.argv[2] ?? '.private/stylevana.csv.gz');
    const rows = parseCsv((bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes).toString('utf8'));
    const catalog = JSON.parse(await readFile('data/catalog.json','utf8'));
    const brandInfo = makeBrandInfo(JSON.parse(await readFile('data/brands.json','utf8')));
    const at = new Date().toISOString(), items = buildCatalogItems(rows,catalog,at,brandInfo);
    const output = JSON.stringify({version:1,items:licensedDescriptions(rows,items,evidence,at)},null,2)+'\n';
    await writeFile('dist/product-content.json',output); await writeFile('ios/Alimi/product-content.json',contentGrant(evidence,{retailer:'Stylevana US',platform:'native'}) ? output : JSON.stringify({version:1,items:[]})+'\n');
    console.log('Published licensed descriptions for ' + items.length + ' catalog candidates');
  } catch(e) { console.error(e.message); process.exitCode=1; }
}
