// Preserve the existing card carousel; recommendations only change the initial order.
export const PAGE_SIZE = 10;
// The feed spells some brands several ways (fwee/Fwee, LAKA/Laka, rom&nd/Romand); one chip covers every spelling.
const BRAND_ALIASES = {romnd: 'romand'};
export function brandKey(brand) {
 const key=String(brand).toLowerCase().replace(/[^a-z0-9]/g,'');
 return BRAND_ALIASES[key]||key;
}
// A lip answer browses every lip product, never base or hair; with no answer yet the whole catalog stays open.
export function matchingProducts(pool, suggested = []) {
 const categories=new Set(pool.filter(p=>suggested.includes(p.id)).map(p=>p.category));
 return categories.size?pool.filter(p=>categories.has(p.category)):pool;
}
// grow=true returns every item up to the page, so the carousel keeps extending instead of flipping pages.
export function browseCatalog(pool, suggested = [], brand = 'all', page = 0, query = '', grow = false) {
 const rank=new Map(suggested.map((id,i)=>[id,i]));
 const ordered=[...pool].sort((a,b)=>{
  const ai=rank.get(a.id),bi=rank.get(b.id);
  return (ai===undefined?1:0)-(bi===undefined?1:0)
   ||(ai!==undefined&&bi!==undefined?ai-bi:0)
   ||(a.position??999)-(b.position??999)
   ||String(a.name).localeCompare(String(b.name));
 });
 const seen=new Map();for(const p of ordered)if(!seen.has(brandKey(p.brand)))seen.set(brandKey(p.brand),p.brand);
 const brands=[...seen.values()],chosen=brandKey(brand);
 const normalized=String(query).trim().toLocaleLowerCase();
 const filtered=ordered.filter(p=>(brand==='all'||brandKey(p.brand)===chosen)&&(!normalized||(p.brand+' '+p.name).toLocaleLowerCase().includes(normalized)));
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 const current=Math.min(Math.max(0,page),pages-1);
 return {brands,total:filtered.length,pages,current,items:filtered.slice(grow?0:current*PAGE_SIZE,(current+1)*PAGE_SIZE),suggestedCount:filtered.filter(p=>rank.has(p.id)).length};
}
