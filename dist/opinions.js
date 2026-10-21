// Lightweight opinion collection for Seoul Beauty; no LLM and no fabricated totals.
const KEY='seoulbeauty-opinions-v1';
export const CHOICES=['tried_liked','tried_disliked','want_to_try','not_familiar'];
export function saveOpinion(productId,choice,storage=globalThis.localStorage){
 if(!productId || !CHOICES.includes(choice)) throw Error('Invalid opinion');
 let data={};try{data=JSON.parse(storage.getItem(KEY)||'{}')||{}}catch{}
 data[productId]={choice,updatedAt:new Date().toISOString()};
 storage.setItem(KEY,JSON.stringify(data));
 globalThis.document?.dispatchEvent(new Event('opinions-change'));
 return data[productId];
}
export function readOpinion(productId,storage=globalThis.localStorage){
 try{return JSON.parse(storage.getItem(KEY)||'{}')?.[productId]??null}catch{return null}
}
// Derived from observed Ulta and Olive Young top-20; not from Stylevana catalog.
export const brandSeed=['Dr. Althea','ANUA','medicube','Hero Cosmetics','PEACH & LILY','celimax','BIODANCE','ILO','MEDIHEAL','fwee','ABOUT_TONE','FOODOLOGY','BANILA CO','so natural','UNOVE','ILLIYOON','SKIN1004','Dr.Jart+','DELIGHT PROJECT','S.NATURE'];
