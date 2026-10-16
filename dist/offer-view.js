import {compareOffers} from './compare-offers.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const amount=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
function safeUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
// No ZIP, exact timestamp, identity review or costs are invented from a product-page observation.
export function manualOffers(observation,alternative){return [
 {retailer:observation.retailer,offerId:'manual-product-page',sourceUrl:observation.url,price:observation.amount,currency:observation.currency,market:observation.market,observedOn:observation.observedOn,shipping:observation.shipping,tax:observation.tax,duties:null,availability:observation.availability,product:{size:100,unit:'ml',quantity:observation.quantity}},
 {retailer:alternative.retailer,offerId:'unpriced-product-page',sourceUrl:alternative.url,price:null,currency:null,market:null,observedOn:null}
];}
export function comparisonView(request,offers){
 if(!Array.isArray(offers))return {status:'invalid_data',rows:[],eligibleCount:0};
 let result;
 if(!request)result={status:'missing_destination',ranked:[],excluded:offers.map((o,index)=>({index,reasons:['destination_required'],total:null}))};
 else try{result=compareOffers(request,offers)}catch{return {status:'invalid_data',rows:offers.filter(Boolean).map(o=>({offer:o,total:null,lowest:false,reasons:['비교 데이터 확인 필요']})),eligibleCount:0}}
 const rows=[...result.ranked,...result.excluded].map(r=>{
 const o=offers[r.index]||{}, reasons=[];
 if(!r.eligible){
 if(!request)reasons.push('배송지 기준 미확인');
 if(!amount(o.price)||o.currency!=='USD')reasons.push('미국 상품가 미확인');
 if([o.shipping,o.tax,o.duties].some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))reasons.push('배송비·세금·관세 미확인');
 if(o.availability!=='in_stock')reasons.push('재고 미확인');
 if(o.identityReview?.status!=='verified'||!o.identityReview?.evidence)reasons.push('동일 옵션 검토 대기');
 if(!o.observedAt||!o.sourceUpdatedAt)reasons.push('정확한 가격 시각 미확인');
 if(r.reasons?.some(s=>s.startsWith('stale_')))reasons.push('가격 갱신 필요');
 if(r.reasons?.some(s=>s.startsWith('mismatch_')))reasons.push('상품 옵션 불일치');
 if(r.reasons?.includes('delivery_unverified'))reasons.push('해당 배송지 배송 미확인');
 if(r.reasons?.includes('conditional_price'))reasons.push('조건부 할인·구매 조건');
 if(!reasons.length)reasons.push('총액 비교 조건 미충족');
 }
 return {offer:o,total:r.eligible?r.total:null,lowest:r.lowestAmongEligible===true,reasons};
 });
 return {status:result.status,rows,eligibleCount:result.ranked.length};
}
export function renderOfferComparison(request,offers){
 const model=comparisonView(request,offers),comparable=model.status==='comparable';
 return `<section class="offer-section"><div class="offer-heading"><h2>판매처 가격 비교 <span>${model.rows.length}</span></h2><small>${comparable?'확인된 총액 낮은순':'총액 비교 대기'}</small></div><p class="offer-context">${comparable?'동일 옵션 · 지정 미국 배송지 · 확인된 판매처 범위':'총액 비교 가능한 판매처가 2곳 이상 필요해요'}</p>${model.rows.map(({offer:o,total,lowest,reasons})=>{const link=safeUrl(o.sourceUrl);return `<article class="seller-row"><div class="seller-info"><strong>${escape(o.retailer||'판매처 미확인')}${lowest?'<span class="best-tag">비교 범위 최저가</span>':''}</strong><small>${total!==null?'배송비·세금·관세 포함':'상품가 기준 · 총액 미확정'}</small></div><div class="seller-price"><strong>${total!==null?money(total):o.currency==='USD'&&amount(o.price)?money(o.price):'확인 대기'}</strong><small>${escape(o.observedOn||o.observedAt||'관측일 미확인')}${o.observedOn?' 수동 관측':''}</small></div>${reasons.length?`<details class="offer-breakdown"><summary>총액 비교 제외 이유</summary><ul>${reasons.map(r=>`<li>${escape(r)}</li>`).join('')}</ul></details>`:`<details class="offer-breakdown"><summary>가격 구성 보기</summary><div>상품 ${money(o.price)} + 배송 ${money(o.shipping)} + 세금 ${money(o.tax)} + 관세 ${money(o.duties)}</div></details>`}${link?`<a class="observed-buy" href="${escape(link)}" target="_blank" rel="noopener noreferrer">${escape(o.retailer)}에서 현재 조건 확인 ↗</a>`:''}</article>`}).join('')}<p class="chart-note">${model.status==='invalid_data'?'비교 데이터를 확인하지 못했어요. ':''}가격은 현재 결제 가격과 다를 수 있어요. 배송·재고·최종 금액은 판매처에서 확인하세요. 제휴 링크가 아닙니다.</p></section>`;
}
