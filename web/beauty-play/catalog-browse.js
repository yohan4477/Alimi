// Recommendations affect ordering only. Filter before paging so every owned item is reachable.
export const PAGE_SIZE = 10;
export function browseCatalog(pool, suggested = [], brand = 'all', page = 0) {
 const ordered = [...pool].sort((a,b) => {
  const ai=suggested.indexOf(a.id),bi=suggested.indexOf(b.id);
  return (ai<0?1:0)-(bi<0?1:0)||(ai>=0&&bi>=0?ai-bi:0)||(a.position||999)-(b.position||999);
 });
 const brands=[...new Set(ordered.map(p=>p.brand))];
 const filtered=brand==='all'?ordered:ordered.filter(p=>p.brand===brand);
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 const current=Math.min(Math.max(0,page),pages-1);
 return {brands,total:filtered.length,pages,current,items:filtered.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE)};
}
