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
export function productSortControls(){const ko=lang==='ko';return `<div class="product-sort" role="group" aria-label="${ko?'상품 정렬':'Product order'}">${[['mentions',ko?'언급순':'Most mentioned'],['likes',ko?'좋아요순':'Most liked']].map(([k,label])=>`<button class="chip ${order===k?'active':''}" data-product-sort="${k}" aria-pressed="${order===k}">${label}</button>`).join('')}</div><p class="home-note product-sort-note" role="status">${status==='loading'?(ko?'집계 불러오는 중…':'Loading counts…'):status==='failed'?(ko?'집계를 불러오지 못했어요. 기존 순서로 표시해요.':'Counts unavailable. Showing original order.'):ko?'불러온 상품 · 최근 24시간 글·댓글·대화 표본 기준. 좋아요는 상품 언급에 받은 합계':'Loaded products · sampled posts, comments and chats from the last 24h. Likes on product mentions.'}</p>`;}
export async function loadProductStats(fetchImpl=fetch){
  if(pending)return pending;status='loading';
  pending=(async()=>{try{const since=new Date(Date.now()-86400000).toISOString();const tables=['community_posts','community_comments','chat_messages'];
    const rows=await Promise.all(tables.map(async source=>{const params=new URLSearchParams({select:'id,item,likes,created_at',item:'not.is.null',created_at:'gte.'+since,order:'created_at.desc,id.desc',limit:'1000'});return (await restGet(SUPABASE_URL+'/rest/v1/'+source+'?'+params,fetchImpl)).map(e=>({...e,source}));}));
    stats=aggregateProductStats(rows.flat());status='ready';
  }catch{stats=new Map();status='failed';}finally{if(typeof document!=='undefined')document.dispatchEvent(new Event('product-stats-ready'));}})();return pending;
}
