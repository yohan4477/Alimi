import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase.js';
// Capture credential values, not the mutable session object. GoogleAuth increments
// epoch when logout starts, before its network request has cleared user/session.
function captureAuth(auth){return {owner:auth.user?.id,token:auth.session?.access_token,refresh:auth.session?.refresh_token,epoch:auth.epoch};}
function assertAuth(auth,snapshot){
  const current=captureAuth(auth);
  if(!current.owner||!current.token||Object.keys(snapshot).some(key=>current[key]!==snapshot[key]))throw Error('account_changed');
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function draftPayload(d){
  if(!d||!uuid.test(d.id)||!['kr','us'].includes(d.region)||!['ko','en'].includes(d.language)||typeof d.body!=='string'||!d.body.trim()||d.body.length>2000||typeof(d.title??'')!=='string'||(d.title??'').length>120)throw Error('invalid_draft');
  return {id:d.id,region:d.region,language:d.language,body:d.body,title:d.title??''};
}
// Explicit save only. Never imports guest text automatically, caches private cloud text,
// uploads a chat secret, or publishes. Server RLS remains the authorization boundary.
export class BeautyAccountDrafts {
  constructor(auth,{fetchImpl=(...args)=>fetch(...args)}={}){this.auth=auth;this.fetch=fetchImpl;this.revisions=new Map();this.owner=null;}
  async request(path,options={},binding=null){
    const startingEpoch=this.auth.epoch;
    await this.auth.restore();
    if(this.auth.epoch!==startingEpoch)throw Error('account_changed');
    // A save's intent belongs to one account/login epoch. A token refresh for
    // that same account during restore is expected and may use fresh credentials.
    if(binding&&(this.auth.user?.id!==binding.owner||this.auth.epoch!==binding.epoch))throw Error('account_changed');
    const snapshot=captureAuth(this.auth),owner=snapshot.owner;
    if(!owner||!snapshot.token)throw Error('login_required');
    if(this.owner!==owner){this.revisions.clear();this.owner=owner;}
    const response=await this.fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${snapshot.token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
    assertAuth(this.auth,snapshot);
    if(!response.ok)throw Error(response.status===409?'draft_conflict':`draft_${response.status}`);
    const data=response.status===204?null:await response.json();
    // Parsing is asynchronous too: never hand a prior session's private body
    // to the caller after logout, account switch or credential replacement.
    assertAuth(this.auth,snapshot);
    // Callers must recheck after their own await, before consuming private data
    // or changing caches. The closure never exposes credentials in a result.
    return {data,assertCurrent:()=>assertAuth(this.auth,snapshot)};
  }
  async list(region){
    if(!['kr','us'].includes(region))throw Error('invalid_region');
    const result=await this.request(`beauty_account_drafts?select=id,region,language,title,body,revision,expires_at&region=eq.${region}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=updated_at.desc&limit=50`);
    result.assertCurrent();const rows=result.data;
    return rows.map(row=>{const draft=draftPayload(row);this.revisions.set(draft.id,row.revision);return {...draft,revision:row.revision};});
  }
  async save(draft){
    const data=draftPayload(draft);
    // Bind intent before the first restore too: a changed stored login must
    // never send the previous account's private draft under a new account.
    const startingEpoch=this.auth.epoch,startingOwner=this.auth.user?.id;
    if(!startingOwner||!this.auth.session?.access_token)throw Error('login_required');
    await this.auth.restore();
    if(this.auth.epoch!==startingEpoch||this.auth.user?.id!==startingOwner)throw Error('account_changed');
    const binding={owner:this.auth.user?.id,epoch:this.auth.epoch};
    if(!binding.owner||!this.auth.session?.access_token)throw Error('login_required');
    if(this.owner!==binding.owner){this.revisions.clear();this.owner=binding.owner;}
    const expected=this.revisions.get(data.id)??0;
    const result=await this.request('rpc/save_beauty_account_draft',{method:'POST',body:JSON.stringify({p_id:data.id,p_region:data.region,p_language:data.language,p_title:data.title,p_body:data.body,p_revision:expected})},binding);
    result.assertCurrent();const rows=result.data;
    const row=Array.isArray(rows)?rows[0]:rows;if(!row)throw Error('draft_conflict');this.revisions.set(data.id,row.revision);return row;
  }
  async remove(id){if(!uuid.test(id))throw Error('invalid_draft');const result=await this.request(`beauty_account_drafts?id=eq.${id}`,{method:'DELETE'});result.assertCurrent();this.revisions.delete(id);}
}
