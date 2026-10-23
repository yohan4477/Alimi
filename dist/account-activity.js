import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase.js';
import {chatSecret} from './chat-api.js';

// Backend only accepts a verified OAuth bearer token; anonymous device secrets never go into account_preferences.
async function activityRpc(name,token,payload={},fetchImpl=fetch){
  const response=await fetchImpl(SUPABASE_URL+'/rest/v1/rpc/'+name,{
    method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('account_activity_'+response.status);
  return response.json();
}
export async function loadAccountActivity(auth,{storage=globalThis.localStorage,fetchImpl=fetch}={}){
  const uid=auth.user?.id,token=auth.session?.access_token;
  if(!uid||!token)return null;
  // Link only this device's proven identity. Reject attempts to reassign a tag to another account.
  await activityRpc('link_my_chat_identity',token,{p_secret:chatSecret(storage)},fetchImpl);
  const result=await activityRpc('get_my_account_activity',token,{},fetchImpl);
  if(auth.user?.id!==uid)return null;
  return result;
}
export const accountActivityRpc=activityRpc;
