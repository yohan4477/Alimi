import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase.js';
// Deliberately exclude auth tokens, anonymous chat secrets and demo conversations.
export const SYNC_KEYS=['alimi-live-v1','seoulbeauty-catalog-saves-v1','seoulbeauty-interests-v1','seoulbeauty-profile-v1','seoulbeauty-game-picks-v1'];
const OWNER='seoulbeauty-data-owner',cache=id=>'seoulbeauty-account-cache:'+id,pending=id=>'seoulbeauty-account-pending:'+id;
export class AccountSync {
  constructor(auth,{storage=globalThis.localStorage,fetchImpl=(...a)=>fetch(...a),onChange=()=>{},onStatus=()=>{}}={}){Object.assign(this,{auth,storage,fetch:fetchImpl,onChange,onStatus,userId:null,baseline:{},dirty:{},ready:false,queue:Promise.resolve(),generation:0});}
  read(){return Object.fromEntries(SYNC_KEYS.map(k=>[k,this.storage.getItem(k)]));}
  apply(data){for(const key of SYNC_KEYS){const value=data[key];if(typeof value==='string')this.storage.setItem(key,value);else this.storage.removeItem(key);}}
  parse(key){try{return JSON.parse(this.storage.getItem(key)||'{}')}catch{return {}}}
  switchOwner(id){
    const previous=this.storage.getItem(OWNER)||'guest';if(previous===id)return;
    this.storage.setItem(cache(previous),JSON.stringify(this.read()));
    const cached=this.storage.getItem(cache(id));
    // Import guest choices on first sign-in, never import another account's choices.
    const incoming=cached?this.parse(cache(id)):previous==='guest'&&id!=='guest'?this.read():{};
    this.apply(incoming);this.storage.setItem(OWNER,id);
  }
  async request(path,options={}){
    if(!this.auth.user||this.auth.user.id!==this.userId)throw Error('account_changed');
    const r=await this.fetch(`${SUPABASE_URL}/rest/v1/account_preferences${path}`,{...options,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${this.auth.session.access_token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('sync_'+r.status);return r.status===204?null:r.json().catch(()=>null);
  }
  async start(){
    const id=this.auth.user?.id;if(!id)return;if(this.userId===id&&this.ready)return;
    const generation=++this.generation;this.ready=false;this.userId=id;this.switchOwner(id);this.onChange();this.onStatus('loading');
    this.baseline=this.read();this.dirty=this.parse(pending(id));
    try{
      const rows=await this.request('?select=key,value&user_id=eq.'+encodeURIComponent(id));
      if(this.generation!==generation)return;
      const before=this.read(),server=Object.fromEntries(rows.map(r=>[r.key,r.value]));
      for(const key of SYNC_KEYS){if(before[key]!==this.baseline[key])this.dirty[key]=before[key];if(!(key in server)&&before[key]!==null)this.dirty[key]=before[key];}
      this.storage.setItem(pending(id),JSON.stringify(this.dirty));this.apply({...server,...this.dirty});this.baseline=this.read();this.ready=true;this.onChange();await this.flush();
    }catch{this.onStatus('failed');}
  }
  changed(){
    if(!this.userId)return;const now=this.read();
    for(const key of SYNC_KEYS)if(now[key]!==this.baseline[key])this.dirty[key]=now[key];
    this.baseline=now;this.storage.setItem(pending(this.userId),JSON.stringify(this.dirty));
    if(this.ready)this.flush();
  }
  flush(){
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      if(!this.ready||!this.userId)return;
      const id=this.userId,generation=this.generation,changes={...this.dirty};if(!Object.keys(changes).length){this.onStatus('ready');return;}
      this.onStatus('loading');
      try{
        await this.auth.restore();if(this.generation!==generation||this.auth.user?.id!==id)return;
        await this.request('?on_conflict=user_id,key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(Object.entries(changes).map(([key,value])=>({user_id:id,key,value})))});
        if(this.generation!==generation)return;
        for(const [key,value]of Object.entries(changes))if(this.dirty[key]===value)delete this.dirty[key];
        this.storage.setItem(pending(id),JSON.stringify(this.dirty));this.onStatus('ready');
      }catch{this.storage.setItem(pending(id),JSON.stringify(this.dirty));this.onStatus('failed');}
    });return this.queue;
  }
  stop(){this.changed();this.generation++;this.ready=false;this.userId=null;this.switchOwner('guest');this.onChange();this.onStatus('local');}
}
