// A service-market choice is not a language, location history, or eligibility proof.
export const MANUAL_MARKET_KEY='seoulbeauty-region-manual';
export const validMarket=value=>value==='kr'||value==='us'?value:null;
let activeMarket=null;
export const currentMarket=()=>activeMarket;
export function setCurrentMarket(value){activeMarket=validMarket(value);return activeMarket;}
export function marketDecision({pathname='',search='',storage,suggestedRegion=null}={}) {
 const path=validMarket(pathname.split('/')[1]);
 const query=validMarket(new URLSearchParams(search).get('region'));
 let manual;try{manual=validMarket(storage?.getItem(MANUAL_MARKET_KEY));}catch{}
 if(path||query||manual)return {region:path||query||manual,needsChoice:false,recommended:null};
 // Legacy storage also contained an automatic US default. Without a verified
 // manual marker, enter directly: Korea for a trusted KR suggestion, US otherwise.
 // Visitors switch markets later from the region picker.
 return {region:suggestedRegion==='kr'?'kr':'us',needsChoice:false,recommended:null};
}
export function rememberMarket(value,storage=globalThis.localStorage) {
 const market=validMarket(value);if(!market)return false;
 try{storage?.setItem(MANUAL_MARKET_KEY,market);storage?.setItem('seoulbeauty-region',market);}catch{}
 return true;
}
