// Explicit, self-reported facts only. No inference, model calls, or message/heart-based votes.
export const OPTIONS = {
  status: {using:['사용 중','Using'], used:['써봤어요','Used before'], curious:['구매 고민','Considering']},
  period: {trial:['몇 번 사용','Tried a few times'], short:['2주 미만','Under 2 weeks'], weeks:['2주 이상','2+ weeks'], months:['1개월 이상','1+ month']},
  repeat: {first:['첫 구매','First purchase'], again:['재구매','Repurchased'], third:['3통 이상','3+ containers']},
  skin: {oily:['지성','Oily'],dry:['건성','Dry'],combination:['복합성','Combination'],sensitive:['민감성','Sensitive'],normal:['중성','Normal']},
  opinion: {recommend:['추천해요','Recommend'], mixed:['좋지만 아쉬워요','Mixed'], regret:['아쉬워요','Disappointed']},
  reasons: {moisture:['보습 좋아요','Moisturizing'],light:['가벼워요','Lightweight'],lasting:['지속력 좋아요','Long lasting'],sticky:['끈적여요','Sticky'],heavy:['무거워요','Heavy'],irritation:['자극 느꼈어요','Felt irritation']},
  concerns: {dry:['속건조','Dehydration'],acne:['여드름','Acne'],pores:['모공','Pores'],sensitive:['민감함','Sensitivity'],base:['베이스 메이크업','Base makeup'],lip:['립 메이크업','Lip makeup']}
};
export const label = (field, value, ko=true) => OPTIONS[field]?.[value]?.[ko?0:1] ?? '';
export const productKey = p => String(p?.family_key ?? p?.id ?? (p?.sku ? `${p.retailer}:${p.market}:${p.sku}` : '')).slice(0,200);
export function roomProducts(room, messages=[]) {
  const products = new Map();
  for (const p of [room.topic_product,...messages.map(m=>m.item)].filter(Boolean)) {
    const key=productKey(p); if(key) products.set(key,{key,name:p.label ?? [p.brand,p.base_name??p.name].filter(Boolean).join(' ')});
  }
  return [...products.values()];
}
export function normalizeExperience(input) {
  const value={};
  for(const field of ['status','period','repeat','skin','opinion']) value[field]=Object.hasOwn(OPTIONS[field],input[field])?input[field]:'';
  for(const field of ['reasons','concerns']) value[field]=[...new Set(Array.isArray(input[field])?input[field]:[])].filter(x=>Object.hasOwn(OPTIONS[field],x));
  if(!value.status) throw Error('experience:status');
  if(value.status==='curious') Object.assign(value,{period:'',repeat:'',opinion:'',reasons:[]});
  return value;
}
export function aggregateExperiences(rows, roomId, blocked=[]) {
  const unique=new Map();
  for(const row of rows) {
    if(row.room_id!==roomId||!row.author_tag||!row.product_key||blocked.includes(row.author_tag)) continue;
    const key=JSON.stringify([row.author_tag,row.product_key]), old=unique.get(key);
    if(!old||String(row.updated_at)>=String(old.updated_at)) unique.set(key,row);
  }
  const people=new Map(), products=new Map();
  for(const row of unique.values()) {
    let fact; try {fact=normalizeExperience(row);} catch {continue;}
    const r={...row,...fact}, old=people.get(r.author_tag);
    if(!old||String(r.updated_at)>=String(old.updated_at))people.set(r.author_tag,r);
    if(!products.has(r.product_key))products.set(r.product_key,{key:r.product_key,total:0,used:0,curious:0,recommend:0,mixed:0,regret:0,repurchased:0,periods:{},reasons:{},sources:new Set()});
    const p=products.get(r.product_key);p.total++;
    if(r.status==='curious')p.curious++;else {p.used++;p.periods[r.period||'unknown']=(p.periods[r.period||'unknown']||0)+1;}
    if(r.opinion)p[r.opinion]++;
    if(['again','third'].includes(r.repeat))p.repurchased++;
    for(const key of r.reasons)p.reasons[key]=(p.reasons[key]||0)+1;
    if(r.source_message)p.sources.add(r.source_message);
  }
  const skins={},concerns={};let disclosed=0;
  for(const r of people.values()) {if(r.skin){disclosed++;skins[r.skin]=(skins[r.skin]||0)+1;}for(const c of r.concerns)concerns[c]=(concerns[c]||0)+1;}
  return {respondents:people.size,disclosed,skins,concerns,products:[...products.values()]};
}
export const EXPERIENCE_KEY='seoulbeauty-demo-experiences-v1';
export function createExperienceStore(storage) {
  let rooms={};try {const v=JSON.parse(storage?.getItem(EXPERIENCE_KEY));if(v&&typeof v==='object'&&!Array.isArray(v))rooms=v;}catch{}
  const check=id=>{if(!id.startsWith('demo-'))throw Error('Demo room required');};
  const persist=()=>{try {if(!storage)return false;storage.setItem(EXPERIENCE_KEY,JSON.stringify(rooms));return true;}catch{return false;}};
  return {
    rows(id,seed=[]){check(id);return [...seed,...(Array.isArray(rooms[id])?rooms[id]:[])];},
    save(id,author,key,input){check(id);const row={room_id:id,author_tag:author,product_key:key,...normalizeExperience(input),source_message:input.source_message??null,updated_at:new Date().toISOString()};rooms[id]=[...(rooms[id]??[]).filter(r=>r.author_tag!==author||r.product_key!==key),row];return {row,persisted:persist()};},
    remove(id,author,key){check(id);rooms[id]=(rooms[id]??[]).filter(r=>r.author_tag!==author||r.product_key!==key);return persist();}
  };
}
