// Preserve the existing card carousel; recommendations only change the initial order.
export const PAGE_SIZE = 10;
// A lip answer browses every lip product, never base or hair; with no answer yet the whole catalog stays open.
export function matchingProducts(pool, suggested = []) {
 const categories=new Set(pool.filter(p=>suggested.includes(p.id)).map(p=>p.category));
 return categories.size?pool.filter(p=>categories.has(p.category)):pool;
}
export function browseCatalog(pool, suggested = [], brand = 'all', page = 0, query = '') {
 const rank=new Map(suggested.map((id,i)=>[id,i]));
 const ordered=[...pool].sort((a,b)=>{
  const ai=rank.get(a.id),bi=rank.get(b.id);
  return (ai===undefined?1:0)-(bi===undefined?1:0)
   ||(ai!==undefined&&bi!==undefined?ai-bi:0)
   ||(a.position??999)-(b.position??999)
   ||String(a.name).localeCompare(String(b.name));
 });
 const brands=[...new Set(ordered.map(p=>p.brand))];
 const normalized=String(query).trim().toLocaleLowerCase();
 const filtered=ordered.filter(p=>(brand==='all'||p.brand===brand)&&(!normalized||(p.brand+' '+p.name).toLocaleLowerCase().includes(normalized)));
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 const current=Math.min(Math.max(0,page),pages-1);
 return {brands,total:filtered.length,pages,current,items:filtered.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE),suggestedCount:filtered.filter(p=>rank.has(p.id)).length};
}
