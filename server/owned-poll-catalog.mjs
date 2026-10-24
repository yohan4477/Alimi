import {readFileSync} from 'node:fs';
export const gameCatalog=JSON.parse(readFileSync(new URL('./owned-poll-catalog.json',import.meta.url),'utf8'));
const details=[...JSON.parse(readFileSync(new URL('../web/beauty-play/product-data.json',import.meta.url),'utf8')).products,...JSON.parse(readFileSync(new URL('../web/beauty-play/scenario-products.json',import.meta.url),'utf8'))];
const BASE='https://mqsnshnlfwsgabrsmqsz.supabase.co/rest/v1/catalog_items';
const safeText=value=>String(value||'').replace(/[^\p{L}\p{N} &'-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,60);
export function catalogIdentity(row){return `catalog:${row.retailer}:${row.market}:${row.sku}`;}
function display(row){const id=catalogIdentity(row);if(id.length>80||![row.retailer,row.market,row.sku].every(p=>/^[a-zA-Z0-9_.-]+$/.test(p)))return null;return {id,brand:row.brand,name:row.name,image:row.image_url,source:'catalog',category:row.category};}
export async function browsePollCatalog(params,{headers,fetcher=fetch}={}){
 const page=Math.max(0,Math.min(10000,Math.floor(Number(params.get('page'))||0))),q=safeText(params.get('q')),brand=safeText(params.get('brand'));
 if(params.get('source')!=='catalog'){
  const matching=gameCatalog.filter(p=>(!brand||p.brand===brand)&&(!q||(p.brand+' '+p.name).toLowerCase().includes(q.toLowerCase()))).sort((a,b)=>a.brand.localeCompare(b.brand)||a.name.localeCompare(b.name));
  return {products:matching.slice(page*10,page*10+10),hasMore:matching.length>(page+1)*10,page,source:'game',brands:[...new Set(gameCatalog.map(p=>p.brand))].sort()};
 }
 const query=new URLSearchParams({select:'retailer,market,sku,brand,name,image_url,category',active:'eq.true',market:'eq.'+(params.get('market')==='US'?'US':'KR'),order:'brand,name,retailer,market,sku',limit:'11',offset:String(page*10)});
 if(q)query.set('or',`(brand.ilike."*${q}*",name.ilike."*${q}*")`);
 if(brand)query.set('brand','eq.'+brand);
 const r=await fetcher(BASE+'?'+query,{headers,redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Catalog unavailable');
 const rows=await r.json();if(!Array.isArray(rows))throw Error('Invalid catalog');
 return {products:rows.slice(0,10).map(display).filter(Boolean),hasMore:rows.length>10,page,source:'catalog',brands:[]};
}
export async function resolvePollProduct(id,{headers,fetcher=fetch}={}){
 const game=gameCatalog.find(p=>p.id===id);if(game)return {...game,options:details.find(p=>p.id===id)?.options.map(o=>({id:o.id,label:o.label}))||[]};
 if(typeof id!=='string'||id.length>80)return null;
 const parts=id.split(':');if(parts.length!==4||parts[0]!=='catalog'||!parts.slice(1).every(p=>/^[a-zA-Z0-9_.-]+$/.test(p)))return null;
 const query=new URLSearchParams({select:'retailer,market,sku,brand,name,image_url,category',active:'eq.true',retailer:'eq.'+parts[1],market:'eq.'+parts[2],sku:'eq.'+parts[3],limit:'1'});
 const r=await fetcher(BASE+'?'+query,{headers,redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Catalog unavailable');
 const rows=await r.json();return rows.length?display(rows[0]):null;
}
