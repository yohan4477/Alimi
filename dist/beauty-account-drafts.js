import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function draftPayload(d){
  if(!d||!uuid.test(d.id)||!['kr','us'].includes(d.region)||!['ko','en'].includes(d.language)||typeof d.body!=='string'||!d.body.trim()||d.body.length>2000||typeof(d.title??'')!=='string'||(d.title??'').length>120)throw Error('invalid_draft');
  return {id:d.id,region:d.region,language:d.language,body:d.body,title:d.title??''};
}
// Explicit save only. Never imports guest text automatically, caches private cloud text,
// uploads a chat secret, or publishes. Server RLS remains the authorization boundary.
export class BeautyAccountDrafts {
  constructor(auth,{fetchImpl=(...args)=>fetch(...args)}={}){this.auth=auth;this.fetch=fetchImpl;this.revisions=new Map();this.owner=null;}
  async request(path,options={}){
    await this.auth.restore();const owner=this.auth.user?.id;
    if(!owner||!this.auth.session?.access_token)throw Error('login_required');
    if(this.owner!==owner){this.revisions.clear();this.owner=owner;}
    const response=await this.fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${this.auth.session.access_token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
    if(this.auth.user?.id!==owner)throw Error('account_changed');
    if(!response.ok)throw Error(response.status===409?'draft_conflict':`draft_${response.status}`);
    const data=response.status===204?null:await response.json();return data;
  }
  async list(region){
    if(!['kr','us'].includes(region))throw Error('invalid_region');
    const rows=await this.request(`beauty_account_drafts?select=id,region,language,title,body,revision,expires_at&region=eq.${region}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=updated_at.desc&limit=50`);
    return rows.map(row=>{const draft=draftPayload(row);this.revisions.set(draft.id,row.revision);return {...draft,revision:row.revision};});
  }
  async save(draft){
    const data=draftPayload(draft);
    // Refresh ownership before selecting the expected revision.
    await this.auth.restore();if(this.owner!==this.auth.user?.id){this.revisions.clear();this.owner=this.auth.user?.id??null;}
    const expected=this.revisions.get(data.id)??0;
    const rows=await this.request('rpc/save_beauty_account_draft',{method:'POST',body:JSON.stringify({p_id:data.id,p_region:data.region,p_language:data.language,p_title:data.title,p_body:data.body,p_revision:expected})});
    const row=Array.isArray(rows)?rows[0]:rows;if(!row)throw Error('draft_conflict');this.revisions.set(data.id,row.revision);return row;
  }
  async remove(id){if(!uuid.test(id))throw Error('invalid_draft');await this.request(`beauty_account_drafts?id=eq.${id}`,{method:'DELETE'});this.revisions.delete(id);}
}
