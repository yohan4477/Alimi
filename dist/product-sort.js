// Shared ranking for product lists. Counts come from public product attachments,
// never bookmarks. A bounded recent sample is explicitly labelled in the UI.
import {SUPABASE_URL,restGet} from './supabase.js';
import {lang} from './i18n.js';
let order='mentions', stats=new Map(), status='idle', pending;
const key=p=>p.item?key(p.item):p.family_key??p.familyKey??(p.sku?[p.retailer,p.market,p.sku].join('|'):p.id);
export function aggregateProductStats(entries){
  const result=new Map(),seen=new Set();
  for(const e of entries){if(!e.item)continue;const id=e.source+':'+e.id;if(seen.has(id))continue;seen.add(id);
    const k=key(e.item);if(!k)continue;const v=result.get(k)??{mentions:0,likes:0};v.mentions++;v.likes+=Math.max(0,Number(e.likes)||0);result.set(k,v);
  }return result;
}
export function rankProducts(items,mode=order,counts=stats){
  return [...items].sort((a,b)=>{const x=counts.get(key(a))??{},y=counts.get(key(b))??{};
    return (y[mode]??0)-(x[mode]??0)||(y.mentions??0)-(x.mentions??0);});
}
export const productSortMode=()=>order;
export function setProductSort(value){if(!['mentions','likes'].includes(value))return;order=value;document.dispatchEvent(new Event('product-sort-change'));}
export function productSortControls(){
  const ko=lang==='ko',scope=status==='loading'?(ko?'집계 중…':'Loading…'):status==='failed'?(ko?'집계 확인 필요':'Counts unavailable'):(ko?'최근 24시간 표본':'Last 24h sample');
  const detail=ko?'불러온 상품 중 최근 24시간 글·댓글·대화 표본 기준. 좋아요는 상품 언급이 받은 합계입니다.':'Loaded products ranked by sampled posts, comments and chats from the last 24h. Likes are totals on product mentions.';
  return `<div class="product-sort"><small class="product-sort-scope" title="${detail}" role="status">${scope}</small><div class="product-sort-options" role="group" aria-label="${ko?'상품 정렬':'Product order'}">${[['mentions',ko?'언급순':'Most mentioned'],['likes',ko?'좋아요순':'Most liked']].map(([k,label])=>`<button class="product-sort-option" data-product-sort="${k}" aria-pressed="${order===k}">${label}</button>`).join('')}</div></div>`;
}
export async function loadProductStats(fetchImpl=fetch){
  if(pending)return pending;status='loading';
  pending=(async()=>{try{const since=new Date(Date.now()-86400000).toISOString();const tables=['community_posts','community_comments','chat_messages'];
    const rows=await Promise.all(tables.map(async source=>{const params=new URLSearchParams({select:'id,item,likes,created_at',item:'not.is.null',created_at:'gte.'+since,order:'created_at.desc,id.desc',limit:'1000'});return (await restGet(SUPABASE_URL+'/rest/v1/'+source+'?'+params,fetchImpl)).map(e=>({...e,source}));}));
    stats=aggregateProductStats(rows.flat());status='ready';
  }catch{stats=new Map();status='failed';}finally{if(typeof document!=='undefined')document.dispatchEvent(new Event('product-stats-ready'));}})();return pending;
}
