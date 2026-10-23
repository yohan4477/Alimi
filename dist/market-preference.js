// A service-market choice is not a language, location history, or eligibility proof.
export const MANUAL_MARKET_KEY='seoulbeauty-region-manual';
export const validMarket=value=>value==='kr'||value==='us'?value:null;
let activeMarket=null;
export const currentMarket=()=>activeMarket;
export function setCurrentMarket(value){activeMarket=validMarket(value);return activeMarket;}
export function marketDecision({pathname='',search='',storage,suggestedRegion=null}={}) {
 const path=validMarket(pathname.split('/')[1]);
 const query=validMarket(new URLSearchParams(search).get('region'));
 let manual,legacy;try{manual=validMarket(storage?.getItem(MANUAL_MARKET_KEY));legacy=validMarket(storage?.getItem('seoulbeauty-region'));}catch{}
 if(path||query||manual)return {region:path||query||manual,needsChoice:false,recommended:null};
 // Earlier versions persisted the automatic US fallback under the same key as
 // manual selections. Preserve that ambiguous value, but never treat it as consent.
 if(legacy)return {region:null,needsChoice:true,recommended:suggestedRegion==='kr'?'kr':null};
 return suggestedRegion==='kr'?{region:'kr',needsChoice:false,recommended:null}:{region:null,needsChoice:true,recommended:null};
}
export function rememberMarket(value,storage=globalThis.localStorage) {
 const market=validMarket(value);if(!market)return false;
 try{storage?.setItem(MANUAL_MARKET_KEY,market);storage?.setItem('seoulbeauty-region',market);}catch{}
 return true;
}
