// Read-only release gate: no API calls, credentials, publication or inferred approvals.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {contentGrant} from '../dist/content-rights.js';
const https=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password?u:null}catch{return null}};
export function productReadiness(item, now=new Date()) {
  const blocked=[];
  if(!item.internalProductId||!item.brand||!item.name||!item.size||!Object.hasOwn(item,'option')||!item.retailerSku)blocked.push('exact_variant_identity_missing');
  if(!['exact','manual_verified'].includes(item.match?.status)||!https(item.match?.evidenceUrl))blocked.push('variant_match_unverified');
  if(item.category!=='cosmetics')blocked.push('not_verified_cosmetics');
  if(item.market!=='US'||item.currency!=='USD')blocked.push('us_market_not_verified');
  if(item.advertiser?.status!=='approved'||!https(item.advertiser?.evidenceUrl)||!item.advertiser?.checkedAt)blocked.push('advertiser_approval_missing');
  if(!https(item.merchantProductUrl)||!https(item.trackedAffiliateUrl)||item.trackedAffiliateUrl===item.merchantProductUrl||item.linkVerification?.status!=='verified'||!item.linkVerification?.checkedAt)blocked.push('tracked_destination_unverified');
  const observed=Date.parse(item.observedAt);
  if(!Number.isFinite(observed)||observed>+now||+now-observed>86400000)blocked.push('price_or_stock_stale');
  if(!Number.isInteger(item.priceMinor)||item.priceMinor<=0||!['in_stock','out_of_stock'].includes(item.availability))blocked.push('price_or_stock_unknown');
  for(const use of ['product_image','product_description','community_onboarding'])if(item.contentUses?.includes(use)&&!contentGrant(item.rights,{retailer:item.retailer,market:item.market,platform:item.platform??'web',use}))blocked.push('rights_missing:'+use);
  return {id:item.internalProductId??null,ready:blocked.length===0,blocked};
}
export function launchReadiness(manifest,now=new Date()) {
  const products=(manifest.products??[]).map(p=>productReadiness(p,now));
  const required=['googleOAuth','guestAccountMerge','secondDeviceRestore','productionMigration','mobileJourney','privacyOwnerReview','supportMailbox','demoIsolation','rollback'];
  const missing=required.filter(k=>manifest.checks?.[k]?.status!=='passed'||!manifest.checks[k].evidence);
  if(!products.length)missing.push('no_verified_products');
  return {ready:!missing.length&&products.every(p=>p.ready),missing,products};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=launchReadiness(JSON.parse(await readFile(process.argv[2]??'data/launch-readiness.json','utf8')));
 console.log(JSON.stringify(report,null,2));if(process.argv.includes('--strict')&&!report.ready)process.exitCode=1;
}
