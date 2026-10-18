import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {parseCsv} from './stylevana-feed.mjs';

const candidates = [
 ['tirtir-red-cushion', 'tirtir', ['mask fit red cushion']],
 ['tirtir-waterism-tint', 'tirtir', ['waterism', 'tint']],
 ['fwee-pudding-pot', 'fwee', ['pudding pot']],
 ['fwee-voluming-gloss', 'fwee', ['voluming gloss']],
 ['romand-juicy-tint', 'rom&nd', ['juicy lasting tint']],
 ['medicube-zero-pore', 'medicube', ['zero pore pad']],
 ['medicube-pdrn', 'medicube', ['pdrn', 'serum']],
 ['cosrx-snail-96', 'cosrx', ['advanced snail 96', '100ml']],
 ['anua-heartleaf-oil', 'anua', ['heartleaf', 'cleansing oil']],
 ['laneige-lip-mask', 'laneige', ['lip sleeping mask']]
];
const norm = x => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function scan(rows) {
 return candidates.map(([id, brand, terms]) => {
   const hits=rows.filter(r=>{
     const name=norm(r.product_name), b=norm(r.brand_name);
     return (b.includes(norm(brand)) || name.includes(norm(brand))) &&
       terms.every(t=>name.includes(norm(t)));
   });
   return {id, status:hits.length?'candidate_found':'not_found', count:hits.length,
     variants:hits.map(r=>({
       name:r.product_name, sku:r.merchant_product_id, ean:r.ean||null,
       currency:r.currency, price:r.search_price, stock:r.in_stock,
       feedId:r.data_feed_id, merchantId:r.merchant_id,
       // URLs only; no private feed credentials are written.
       productUrl:r.merchant_deep_link, affiliateUrl:r.aw_deep_link,
       imageUrl:r.merchant_image_url
     }))};
 });
}
if(process.argv[1]?.endsWith('stylevana-candidate-scan.mjs')) {
 const file=process.argv[2];
 if(!file) throw Error('Usage: node scripts/stylevana-candidate-scan.mjs <downloaded-feed.csv.gz>');
 const bytes=await readFile(file);
 const rows=parseCsv((bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes).toString('utf8'));
 const result={sourceRows:rows.length, scannedAt:new Date().toISOString(), status:'UNVERIFIED_CANDIDATES', products:scan(rows)};
 await mkdir('data',{recursive:true});
 await writeFile('data/stylevana-candidates.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.products.map(({id,status,count})=>({id,status,count})),null,2));
}
