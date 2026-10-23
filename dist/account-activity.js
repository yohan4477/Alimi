import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase.js';

// Release gate: guest identities are currently cached by several modules/tabs.
// Linking is unavailable until consent, server-side sealing and safe rotation are
// verified end to end. Sign-in/restore must never link or transmit a chat secret.
export const ACCOUNT_ACTIVITY_ENABLED=false;
const identity=auth=>({id:auth.user?.id,token:auth.session?.access_token,epoch:auth.epoch});
const matches=(auth,owner)=>!!owner?.id&&auth.user?.id===owner.id&&auth.session?.access_token===owner.token&&auth.epoch===owner.epoch;
async function activityRpc(name,token,payload={},fetchImpl=fetch){
  const response=await fetchImpl(SUPABASE_URL+'/rest/v1/rpc/'+name,{
    method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('account_activity_'+response.status);
  return await response.json();
}
export async function loadAccountActivity(auth,{fetchImpl=fetch,enabled=ACCOUNT_ACTIVITY_ENABLED}={}){
  const owner=identity(auth);
  if(!enabled||!owner.id||!owner.token)return null;
  const result=await activityRpc('get_my_account_activity',owner.token,{},fetchImpl);
  // Parsing JSON is asynchronous too. Do not publish a response after logout,
  // account switch, or a new login to the same account (ABA).
  if(!matches(auth,owner))return null;
  return result;
}
export class AccountActivityState {
  constructor(auth,options={}){this.auth=auth;this.options=options;this.generation=0;this.clear();}
  clear(){this.generation++;this.owner=null;this.activity=null;this.status='local';}
  snapshot(){
    if(this.owner&&!matches(this.auth,this.owner))this.clear();
    return {activity:this.activity,status:this.status};
  }
  async load(){
    const generation=++this.generation;
    this.owner=identity(this.auth);this.activity=null;
    if(!(this.options.enabled??ACCOUNT_ACTIVITY_ENABLED)||!this.owner.id||!this.owner.token){this.status='local';return null;}
    this.status='loading';
    try{
      const result=await loadAccountActivity(this.auth,this.options);
      if(generation!==this.generation)return null;
      if(!matches(this.auth,this.owner)){this.clear();return null;}
      this.activity=result;this.status='ready';return result;
    }catch{
      if(generation!==this.generation)return null;
      if(!matches(this.auth,this.owner)){this.clear();return null;}
      this.activity=null;this.status='failed';return null;
    }
  }
}
