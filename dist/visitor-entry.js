import {resolveVisitorContext} from './language-preference.js';
import {marketDecision,setCurrentMarket,rememberMarket} from './market-preference.js';

export function marketChoiceElement(document,{language,recommended},onChoose) {
 const ko=language==='ko';
 const section=document.createElement('section');section.className='page';section.setAttribute('data-visitor-entry','');section.setAttribute('aria-labelledby','visitor-market-title');
 const heading=document.createElement('h1');heading.id='visitor-market-title';heading.textContent=ko?'이용할 서비스 지역을 선택해 주세요':'Choose your service market';section.append(heading);
 const description=document.createElement('p');description.textContent=ko?'언어와 서비스 지역은 별개예요. 구매 조건은 선택한 판매처에서 확인해 주세요.':'Language and service market are separate. Check purchase eligibility with the selected retailer.';section.append(description);
 for(const region of ['kr','us']){
  const button=document.createElement('button');button.type='button';button.className='btn';button.dataset.marketChoice=region;
  button.textContent=(region==='kr'?(ko?'한국':'Korea'):(ko?'미국':'United States'))+(recommended===region?(ko?' · 추천':' · Recommended'):'');
  button.addEventListener('click',()=>onChoose(region));section.append(button);
 }
 return section;
}
export async function startVisitorEntry({document=globalThis.document,location=globalThis.location,storage,fetchImpl=globalThis.fetch,loadApp=()=>import('./app.js')}={}) {
 try{storage??=globalThis.localStorage;}catch{}
 let cookie='';try{cookie=document.cookie||'';}catch{}
 const context=await resolveVisitorContext({search:location.search,cookie,storage,browser:globalThis.navigator?.language||'en'},fetchImpl);
 document.documentElement.lang=context.language;
 const decision=marketDecision({pathname:location.pathname,search:location.search,storage,suggestedRegion:context.suggestedRegion});
 if(decision.region){
  setCurrentMarket(decision.region);
  try{const result=await loadApp();document.documentElement.removeAttribute('data-locale-pending');return result;}
  catch{
   const ko=context.language==='ko';
   const section=document.createElement('section');section.setAttribute('data-visitor-entry','');section.setAttribute('role','alert');
   const message=document.createElement('p');message.textContent=ko?'화면을 불러오지 못했어요. 다시 시도해 주세요.':'The page could not load. Please try again.';section.append(message);
   const retry=document.createElement('button');retry.type='button';retry.textContent=ko?'다시 시도':'Try again';retry.addEventListener('click',()=>location.reload());section.append(retry);
   document.documentElement.setAttribute('data-visitor-gate','');document.body.prepend(section);document.documentElement.removeAttribute('data-locale-pending');
   return {loadFailed:true};
  }
 }
 const chooser=marketChoiceElement(document,{language:context.language,recommended:decision.recommended},region=>{
  rememberMarket(region,storage);
  const target=new URL(location.href);target.pathname='/'+region;
  // Preserve explicit language and shared target query parameters. Market choice
  // is not a request to replace the visitor's independent language preference.
  if(!target.searchParams.has('lang'))target.searchParams.set('lang',context.language);
  location.assign(target.href);
 });
 document.documentElement.setAttribute('data-visitor-gate','');
 document.body.prepend(chooser);
 document.documentElement.removeAttribute('data-locale-pending');
 return {needsChoice:true};
}
if(typeof window!=='undefined'&&typeof document!=='undefined')startVisitorEntry();
