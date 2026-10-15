// Offline gate for normalized, reviewed offers. Does not fetch or authorize feeds.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const text=v=>typeof v==='string'&&v.trim().length>0;
const cents=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000&&Math.abs(v*100-Math.round(v*100))<1e-7;
const timestamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const dimensions=['productKey','formulation','variant','unit','size','quantity'];
function validProduct(p){return p&&['productKey','formulation','variant'].every(k=>text(p[k]))&&['ml','g'].includes(p.unit)&&typeof p.size==='number'&&Number.isFinite(p.size)&&p.size>0&&Number.isSafeInteger(p.quantity)&&p.quantity>0;}
export function compareOffers(request,offers){
  if(!request||!validProduct(request.product)||request.market!=='US'||request.currency!=='USD'||!/^\d{5}$/.test(request.postalCode)||!timestamp(request.now)||!Number.isFinite(request.maxAgeHours)||request.maxAgeHours<=0)throw Error('invalid comparison context');
  if(!Array.isArray(offers))throw Error('offers must be an array');
  const now=Date.parse(request.now),ageLimit=request.maxAgeHours*3600000;
  const results=offers.map((o,index)=>{
    const reasons=[];
    if(!o||typeof o!=='object'||Array.isArray(o))return {index,eligible:false,reasons:['invalid_offer'],total:null};
    if(!text(o.retailer)||!text(o.offerId)||!/^https:\/\//.test(o.sourceUrl??''))reasons.push('missing_source');
    if(!o.identityReview||o.identityReview.status!=='verified'||!text(o.identityReview.evidence))reasons.push('identity_unverified');
    if(!validProduct(o.product))reasons.push('identity_incomplete');
    else for(const k of dimensions)if(o.product[k]!==request.product[k])reasons.push('mismatch_'+k);
    if(o.market!==request.market||o.currency!==request.currency)reasons.push('market_or_currency_mismatch');
    if(o.postalCode!==request.postalCode||o.shipsToDestination!==true)reasons.push('delivery_unverified');
    if(o.availability!=='in_stock')reasons.push('stock_unconfirmed');
    // All components must describe the same single-item quote; no conditional discount math.
    if(o.purchaseType!=='one_time'||o.discountType!=='none')reasons.push('conditional_price');
    if(o.costScope!=='requested_item_only')reasons.push('basket_scope_unverified');
    if(!cents(o.price)||o.price===0)reasons.push('invalid_price');
    if(!cents(o.shipping)||!cents(o.tax)||!cents(o.duties))reasons.push('total_cost_unknown');
    if(o.costsVerified!==true)reasons.push('total_cost_unverified');
    // Re-downloading an old feed must never refresh its source timestamp.
    for(const key of ['observedAt','sourceUpdatedAt']){
      if(!timestamp(o[key]))reasons.push('invalid_'+key);
      else if(Date.parse(o[key])>now)reasons.push('future_'+key);
      else if(now-Date.parse(o[key])>ageLimit)reasons.push('stale_'+key);
    }
    if(timestamp(o.observedAt)&&timestamp(o.sourceUpdatedAt)&&Date.parse(o.sourceUpdatedAt)>Date.parse(o.observedAt))reasons.push('inconsistent_timestamps');
    const eligible=reasons.length===0;
    return {index,offerId:o.offerId??null,retailer:o.retailer??null,eligible,reasons,total:eligible?['price','shipping','tax','duties'].reduce((sum,k)=>sum+Math.round(o[k]*100),0)/100:null};
  });
  const seen=new Set();for(const row of results){const key=JSON.stringify([row.retailer,row.offerId]);if(row.offerId&&seen.has(key))throw Error('duplicate retailer/offerId');seen.add(key);}
  const ranked=results.filter(r=>r.eligible).sort((a,b)=>a.total-b.total);
  const comparable=new Set(ranked.map(r=>r.retailer)).size>=2;
  return {scope:{market:request.market,currency:request.currency,postalCode:request.postalCode,asOf:request.now,maxAgeHours:request.maxAgeHours},status:comparable?'comparable':'insufficient_retailers',ranked:ranked.map(r=>({...r,lowestAmongEligible:comparable&&r.total===ranked[0].total})),excluded:results.filter(r=>!r.eligible)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==3)throw Error('Usage: node scripts/compare-offers.mjs input.json');const {request,offers}=JSON.parse(await readFile(process.argv[2],'utf8'));console.log(JSON.stringify(compareOffers(request,offers),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
