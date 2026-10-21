// Lightweight opinion collection for Seoul Beauty; no LLM and no fabricated totals.
export const OPINION_KEY='seoulbeauty-opinions-v1';
export const CHOICES=['tried_liked','tried_disliked','want_to_try','not_familiar'];
export function saveOpinion(productId,choice,storage=globalThis.localStorage){
 if(!productId || !CHOICES.includes(choice)) throw Error('Invalid opinion');
 const data=normalizeOpinions(storage.getItem(OPINION_KEY));
 data[productId]={choice,updatedAt:new Date().toISOString()};
 storage.setItem(OPINION_KEY,JSON.stringify(data));
 globalThis.document?.dispatchEvent(new Event('opinions-change'));
 return data[productId];
}
export function readOpinion(productId,storage=globalThis.localStorage){
 try{return normalizeOpinions(storage.getItem(OPINION_KEY))[productId]??null}catch{return null}
}
// Curated cosmetics brand prompts, not a US ranking or community-popularity claim.
export const brandSeed=['Dr. Althea','ANUA','medicube','Hero Cosmetics','PEACH & LILY','celimax','BIODANCE','MEDIHEAL','fwee','ABOUT_TONE','BANILA CO','so natural','UNOVE','ILLIYOON','SKIN1004','Dr.Jart+','S.NATURE'];

export function normalizeOpinions(raw) {
  let data = raw;
  try { if (typeof raw === 'string') data = JSON.parse(raw); } catch { return {}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).filter(([id,v]) => id && id.length <= 300 &&
    v && CHOICES.includes(v.choice) && typeof v.updatedAt === 'string' && Number.isFinite(Date.parse(v.updatedAt)))
    .map(([id,v]) => [id,{choice:v.choice,updatedAt:new Date(v.updatedAt).toISOString()}]));
}
// Merge explicit answers only; newest answer wins, later source breaks a timestamp tie.
export function mergeOpinions(...sources) {
  const merged = Object.create(null);
  for (const source of sources) for (const [id,opinion] of Object.entries(normalizeOpinions(source))) {
    if (!merged[id] || opinion.updatedAt >= merged[id].updatedAt) merged[id] = opinion;
  }
  return JSON.stringify(merged);
}
