// Functional UI preference only. Never an identity, market, or location record.
export const LANGUAGE_COOKIE='seoulbeauty-language';
export const LANGUAGE_STORAGE='seoulbeauty-language';
export const validLanguage=value=>value==='ko'||value==='en'?value:null;
export function browserLanguage(value='en') {
 const ranked=String(value).split(',').map((part,index)=>{const [tag,...parameters]=part.trim().split(';');const q=parameters.find(p=>p.trim().startsWith('q='));return {tag,index,q:q?Number(q.trim().slice(2)):1};}).filter(x=>x.tag&&Number.isFinite(x.q)&&x.q>0&&x.q<=1).sort((a,b)=>b.q-a.q||a.index-b.index);
 return /^ko(?:-|$)/i.test(ranked[0]?.tag||'')?'ko':'en';
}
export function cookieLanguage(cookie='') {
 const values=String(cookie).split(';').map(x=>x.trim()).filter(x=>x.startsWith(LANGUAGE_COOKIE+'='));
 return values.length===1?validLanguage(values[0].slice(LANGUAGE_COOKIE.length+1)):null;
}
export function requestLanguage({search='',cookie='',country='',acceptLanguage=''}={}) {
 const explicit=validLanguage(new URLSearchParams(search).get('lang'));
 const remembered=cookieLanguage(cookie);
 const code=typeof country==='string'?country.toUpperCase():'';
 return explicit||remembered||(/^[A-Z]{2}$/.test(code)&&!['XX','ZZ'].includes(code)?(code==='KR'?'ko':'en'):browserLanguage(acceptLanguage));
}
function storageValue(storage,key){try{return validLanguage(storage?.getItem(key));}catch{return null;}}
export function storedLanguage(storage) {
 const shared=storageValue(storage,LANGUAGE_STORAGE);if(shared)return shared;
 const old=[storageValue(storage,'beauty-language'),storageValue(storage,'alimi-lang')].filter(Boolean);
 // Old preferences have no timestamps. Never guess which conflicting value was newer.
 return old.length&&new Set(old).size===1?old[0]:null;
}
function environment(){let storage,cookie='';try{storage=globalThis.localStorage;}catch{}try{cookie=globalThis.document?.cookie||'';}catch{}return {search:globalThis.location?.search||'',cookie,storage,browser:globalThis.navigator?.language||'en'};}
export function initialLanguage(options=environment()) {
 return validLanguage(new URLSearchParams(options.search||'').get('lang'))||cookieLanguage(options.cookie)||storedLanguage(options.storage);
}
export function rememberLanguage(language,{document=globalThis.document,storage,secure=globalThis.location?.protocol==='https:'}={}) {
 const value=validLanguage(language);if(!value)return false;
 try{storage??=globalThis.localStorage;for(const key of [LANGUAGE_STORAGE,'beauty-language','alimi-lang'])storage?.setItem(key,value);}catch{}
 try{if(document)document.cookie=`${LANGUAGE_COOKIE}=${value}; Path=/; Max-Age=15552000; SameSite=Lax${secure?'; Secure':''}`;}catch{}
 return true;
}
export async function resolveVisitorLanguage(options=environment(),fetchImpl=globalThis.fetch) {
 const explicit=validLanguage(new URLSearchParams(options.search||'').get('lang'));
 if(explicit)return explicit; // A shared link is not an instruction to save a manual preference.
 const existing=cookieLanguage(options.cookie)||storedLanguage(options.storage);
 if(existing){rememberLanguage(existing,{storage:options.storage});return existing;}
 try{
  const response=await fetchImpl('/api/language',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(2000)});
  if(response.ok){const data=await response.json();if(validLanguage(data.language))return data.language;}
 }catch{}
 return browserLanguage(options.browser);
}

let visitorContext;
export const currentVisitorContext=()=>visitorContext;
export async function resolveVisitorContext(options=environment(),fetchImpl=globalThis.fetch) {
 let server;
 try {
  const response=await fetchImpl('/api/language',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(2000)});
  if(response.ok)server=await response.json();
 }catch{}
 visitorContext={language:initialLanguage(options)||validLanguage(server?.language)||browserLanguage(options.browser),suggestedRegion:server?.suggestedRegion==='kr'?'kr':null};
 return visitorContext;
}
