// Public route contract only. Never reads accounts, storage, fixtures, or APIs.
export const isSyntheticTarget=value=>/^(?:demo|sample|synthetic)(?:[-_:]|$)/i.test(String(value||''));
const roomId=value=>typeof value==='string'&&/^[a-z0-9-]{2,64}$/.test(value)&&!isSyntheticTarget(value);
// Reserved legacy preview IDs, not genuine catalog labels or database IDs.
const legacySampleProducts=new Set(['torriden-serum','aestura-cream','roundlab-sun','anua-toner','cosrx-essence','romand-tint','clio-cushion','laneige-lip','medicube-pad','drg-cream','goodal-serum','peripera-tint']);
export const isSyntheticProductTarget=value=>isSyntheticTarget(value)||legacySampleProducts.has(String(value||''));
const productKey=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f<>]/.test(value)&&!isSyntheticProductTarget(value);
const draftId=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'');
const nonce=value=>/^[A-Za-z0-9_-]{16,200}$/.test(value||'');
const isCallback=q=>q.getAll('sb_login_state').length===1&&q.getAll('code').length<=1&&q.getAll('error').length<=1&&nonce(q.get('sb_login_state'))&&(/^[A-Za-z0-9_-]{1,4096}$/.test(q.get('code')||'')||/^[A-Za-z0-9_-]{1,100}$/.test(q.get('error')||''));
export function hasActualCompatibilityTarget(href){
 const u=new URL(href),q=u.searchParams;
 // Callback completion precedes content routing; auth.js verifies its pending PKCE flow.
 if(isCallback(q))return true;
 // Synthetic IDs never turn a sample link into a production-data request.
 if(['room','post','productRooms'].some(key=>q.getAll(key).some(isSyntheticTarget))||q.getAll('product').some(isSyntheticProductTarget))return false;
 return roomId(q.get('room'))||productKey(q.get('product'))||draftId(q.get('beautyDraft'))||q.get('productRooms')==='1';
}
export function liveURL({href='https://seoulbeauty.me/',market}={}){
 const u=new URL(href);u.pathname='/live';
 if(['kr','us'].includes(market))u.searchParams.set('region',market);
 u.searchParams.delete('demo');
 return u;
}
export function compatibilityTarget(href){
 const u=new URL(href),legacy=/^\/(kr|us)\/?$/.exec(u.pathname);
 if((u.pathname==='/'||legacy)&&isCallback(u.searchParams)){
  const target=liveURL({href,market:legacy?.[1]});
  for(const key of ['room','post','productRooms'])if(target.searchParams.getAll(key).some(isSyntheticTarget))target.searchParams.delete(key);
  if(target.searchParams.getAll('product').some(isSyntheticProductTarget))target.searchParams.delete('product');
  return target;
 }
 if(legacy){
  if(['room','post','productRooms'].some(key=>u.searchParams.getAll(key).some(isSyntheticTarget))||u.searchParams.getAll('product').some(isSyntheticProductTarget)){u.pathname='/';u.searchParams.set('region',legacy[1]);return u;}
  return liveURL({href,market:legacy[1]});
 }
 return u.pathname==='/'&&hasActualCompatibilityTarget(href)?liveURL({href}):null;
}
export function staticEntryPath(pathname){
 if(pathname==='/'||/^\/(?:kr|us)\/?$/.test(pathname))return '/sample.html';
 if(/^\/live\/?$/.test(pathname))return '/index.html';
 return pathname;
}
export function sampleURL({href,market,language,room,tab}={}){
 const u=new URL(href);u.pathname='/';
 if(['kr','us'].includes(market))u.searchParams.set('region',market);
 if(['ko','en'].includes(language))u.searchParams.set('lang',language);
 if(room)u.searchParams.set('room',room);else u.searchParams.delete('room');
 if(tab&&tab!=='chat')u.searchParams.set('sampleTab',tab);else u.searchParams.delete('sampleTab');
 return u;
}
