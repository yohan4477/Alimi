import {createBeautyGameHandler} from '../server/beauty-game-api.mjs';

// Supabase is the only runtime backend. Removed or invalid backend selections
// fail closed, including maintenance; never fall back to the retired D1 proxy.
export function configuredBeautyPlayHandler(env=process.env,options={}){
 if(!env.BEAUTY_GAME_BACKEND||env.BEAUTY_GAME_BACKEND==='supabase')return createBeautyGameHandler({...options,env});
 return (_req,res)=>{res.statusCode=503;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:'Game backend is not configured'}));};
}
export default configuredBeautyPlayHandler();
