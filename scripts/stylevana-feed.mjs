import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceUrl} from './price-pipeline.mjs';

// Credentials belong in AWIN_FEED_URL in the collector environment, never in app assets.
export function parseCsv(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) { if(c==='"' && text[i+1]==='"') {cell+='"';i++;} else if(c==='"') quoted=false; else cell+=c; }
    else if(c==='"') {if(cell)throw Error('Invalid CSV quoting');quoted=true;}
    else if(c===',') {row.push(cell);cell='';}
    else if(c==='\n') {row.push(cell.replace(/\r$/,''));if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw Error('Unclosed CSV field');
  if(cell||row.length) {row.push(cell.replace(/\r$/,''));rows.push(row);}
  if(rows.length<2)throw Error('Empty feed');
  const headers=rows.shift();
  if(new Set(headers).size!==headers.length)throw Error('Duplicate CSV headers');
  return rows.map(values=>{if(values.length!==headers.length)throw Error('Invalid CSV column count');return Object.fromEntries(headers.map((h,i)=>[h,values[i]]));});
}
export function normalize(rows, observedAt=new Date().toISOString()) {
  if(!Number.isFinite(Date.parse(observedAt)))throw Error('Invalid collection time');
  const expected=new URL(sourceUrl);
  const matching=rows.filter(row=>{try{const u=new URL(row.merchant_deep_link);return u.origin===expected.origin && u.pathname===expected.pathname;}catch{return false;}});
  if(matching.length!==1)throw Error('Expected exactly one COSRX 100ml single item');
  const r=matching[0];
  if(r.merchant_id!=='90791'||r.data_feed_id!=='111294'||r.currency!=='USD'||r.merchant_product_id!=='10759'||r.ean!=='8809416470009'||r.brand_name!=='COSRX'||r.product_name!=='COSRX - Advanced Snail 96 Mucin Power Essence - 100ml')throw Error('Product, market or feed identity mismatch');
  if(!/^\d+(\.\d{1,2})?$/.test(r.search_price)||Number(r.search_price)<=0||Number(r.search_price)>10000)throw Error('Invalid USD amount');
  const tracking=new URL(r.aw_deep_link);
  if(tracking.origin!=='https://www.awin1.com'||tracking.pathname!=='/pclick.php'||tracking.searchParams.get('a')!=='3125007'||tracking.searchParams.get('m')!=='90791'||tracking.searchParams.get('p')!==r.aw_product_id||!/^[0-9]+$/.test(r.aw_product_id))throw Error('Unexpected affiliate link');
  const image=new URL(r.merchant_image_url);
  if(image.protocol!=='https:'||!image.hostname.endsWith('.stylevana.com'))throw Error('Unexpected image URL');
  const observedOn=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(observedAt));
  const reportedDelivery=/^\d+(\.\d{1,2})?$/.test(r.delivery_cost)?Number(r.delivery_cost):null;
  const identity={amount:Number(r.search_price),availability:r.in_stock==='1'?'in_stock':r.in_stock==='0'?'out_of_stock':'unknown',reportedDelivery,awProductId:r.aw_product_id};
  return {productId:'2',market:'US',currency:'USD',retailer:'Stylevana US',size:'100ml',quantity:1,method:'awin_feed',url:sourceUrl,
    amount:identity.amount,observedAt,observedOn,shipping:null,tax:null,availability:identity.availability,
    reportedDelivery,affiliateUrl:tracking.href,imageUrl:image.href,merchantId:r.merchant_id,feedId:r.data_feed_id,merchantProductId:r.merchant_product_id,awProductId:r.aw_product_id,ean:r.ean,
    providerUpdatedAt:r.last_updated||null, fingerprint:createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
    evidence:'Awin authenticated Create-a-Feed download; Stylevana AWIN US Product Feed 111294. Product identity matched by canonical URL, merchant SKU, name, 100ml single item and EAN. Delivery is a feed quote, not a checkout total. Per-product last_updated is empty.'};
}
export function mergeHistory(existing, incoming) {
  const history=[...existing];
  const same=history.at(-1)?.fingerprint===incoming.fingerprint;
  if(history.length && incoming.observedAt < history.at(-1).observedAt)throw Error('Older collection cannot replace latest');
  if(!same)history.push(incoming);
  return history.sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
}
async function atomic(path,text){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',text);await rename(path+'.tmp',path);}
export async function runFeed(inputPath,root,observedAt=new Date().toISOString()) {
  const bytes=await readFile(inputPath);
  const rows=parseCsv((bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes).toString('utf8'));
  const row=normalize(rows,observedAt), path=resolve(root,'data/stylevana-us.json');
  let existing=[];try{existing=JSON.parse(await readFile(path,'utf8')).history;}catch(e){if(e.code!=='ENOENT')throw e;}
  const history=mergeHistory(existing,row);
  const payload={schemaVersion:1,source:'Awin Stylevana US official feed',feedId:'111294',sourceRowCount:rows.length,collectedAt:row.observedAt,latest:row,history};
  // All validation happens before replacing the last known-good snapshot. No API keys are exported.
  const json=JSON.stringify(payload,null,2)+'\n';
  await atomic(path,json);
  await atomic(resolve(root,'dist/stylevana-data.js'),'// Generated official feed snapshot. Never contains the private download URL.\nexport const stylevanaFeed = '+JSON.stringify(payload,null,2)+';\n');
  await atomic(resolve(root,'ios/Alimi/stylevana-us.json'),json);
  return {sourceRows:rows.length,matchedProducts:1,historyCount:history.length,amount:row.amount,currency:row.currency,observedOn:row.observedOn};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
    let input=process.argv[2];
    if(!input) {
      const raw=process.env.AWIN_FEED_URL;
      if(!raw)throw Error('AWIN_FEED_URL is required for automatic collection');
      const u=new URL(raw);
      if(u.origin!=='https://productdata.awin.com'||!u.pathname.startsWith('/datafeed/download/apikey/')||!u.pathname.includes('/fid/111294/'))throw Error('Unexpected feed endpoint');
      let response;try{response=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(120000)});}catch{throw Error('Awin feed download failed; URL suppressed');}
      if(!response.ok)throw Error('Awin feed HTTP '+response.status);
      input=resolve(root,'.private/stylevana.csv.gz');await mkdir(dirname(input),{recursive:true});await writeFile(input,Buffer.from(await response.arrayBuffer()));
    }
    console.log(JSON.stringify(await runFeed(input,root)));
  } catch(e) { console.error('Stylevana import failed: '+(e.message.includes('https:')?'details suppressed':e.message));process.exitCode=1; }
}
