// Game selections are separate from anonymous upstream vote/session tokens.
// Only self-selected context is stored, never invite identifiers or friend selections.
const KEY='seoulbeauty-game-picks-v1';
const SESSION='alimi-auth-session-v1';
const URL='https://mqsnshnlfwsgabrsmqsz.supabase.co';
const API_KEY='sb_publishable_CJjQ-l5ev-D4OH0Na0gFoQ_szunygff';
type Pick={id:string;character:string;scenario:string;product:string;shade:string|null;advice:string|null;reasons:string[];experience:string|null;created_at:string};
function json(raw:string|null):any{try{return JSON.parse(raw||'null')}catch{return null}}
export function readGamePicks(storage:Storage=localStorage):Pick[]{
 const v=json(storage.getItem(KEY));return Array.isArray(v)?v.filter(p=>p&&typeof p.id==='string'&&typeof p.product==='string').slice(-50):[];
}
export function rememberGamePick(selection:Omit<Pick,'created_at'>,storage:Storage=localStorage):Pick[]{
 const rows=readGamePicks(storage),pick={...selection,created_at:new Date().toISOString()};
 const next=[...rows.filter(x=>x.id!==pick.id),pick].slice(-50);
 storage.setItem(KEY,JSON.stringify(next));return next;
}
export function updateGameExperience(id:string,experience:string,storage:Storage=localStorage){
 const rows=readGamePicks(storage).map(p=>p.id===id?{...p,experience}:p);
 storage.setItem(KEY,JSON.stringify(rows));return rows;
}
// Use the same session cache as the primary Seoul Beauty web app; verify user identity with Auth.
export async function syncGamePicks(fetchImpl:typeof fetch=fetch,storage:Storage=localStorage):Promise<boolean>{
 const session=json(storage.getItem(SESSION));
 if(!session?.access_token)return false;
 const me=await fetchImpl(URL+'/auth/v1/user',{headers:{apikey:API_KEY,Authorization:'Bearer '+session.access_token}});
 if(!me.ok)return false;
 const user=await me.json();
 if(!user?.id)return false;
 const owner=storage.getItem('seoulbeauty-data-owner');
 // Do not transfer one account's cached picks to another account.
 if(owner&&owner!=='guest'&&owner!==user.id)return false;
 const path=URL+'/rest/v1/account_preferences';
 const headers={apikey:API_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'};
 const result=await fetchImpl(path+'?select=value&user_id=eq.'+encodeURIComponent(user.id)+'&key=eq.'+KEY,{headers});
 if(!result.ok)return false;
 const existing=await result.json();
 const remote=json(existing?.[0]?.value);
 const current=readGamePicks(storage);
 const merged=new Map<string,Pick>();
 for(const p of Array.isArray(remote)?remote:[])if(p&&typeof p.id==='string')merged.set(p.id,p);
 for(const p of current)merged.set(p.id,p);
 const value=JSON.stringify([...merged.values()].slice(-50));
 const saved=await fetchImpl(path+'?on_conflict=user_id,key',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{user_id:user.id,key:KEY,value}])});
 if(!saved.ok)return false;
 storage.setItem(KEY,value);
 return true;
}
