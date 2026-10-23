import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase.js';
// Deliberately exclude auth tokens, anonymous chat secrets and demo conversations.
export const SYNC_KEYS=['alimi-live-v1','seoulbeauty-catalog-saves-v1','seoulbeauty-interests-v1','seoulbeauty-profile-v1'];
const OWNER='seoulbeauty-data-owner',cache=id=>'seoulbeauty-account-cache:'+id,pending=id=>'seoulbeauty-account-pending:'+id;
const permitted=data=>Object.fromEntries(SYNC_KEYS.filter(k=>data&&Object.hasOwn(data,k)&&(typeof data[k]==='string'||data[k]===null)).map(k=>[k,data[k]]));
export class AccountSync {
  constructor(auth,{storage=globalThis.localStorage,fetchImpl=(...a)=>fetch(...a),onChange=()=>{},onStatus=()=>{}}={}){Object.assign(this,{auth,storage,fetch:fetchImpl,onChange,onStatus,userId:null,ownerEpoch:null,baseline:{},dirty:{},ready:false,queue:Promise.resolve(),generation:0});}
  read(){return Object.fromEntries(SYNC_KEYS.map(k=>[k,this.storage.getItem(k)]));}
  apply(data){for(const key of SYNC_KEYS){const value=data[key];if(typeof value==='string')this.storage.setItem(key,value);else this.storage.removeItem(key);}}
  parse(key){try{return permitted(JSON.parse(this.storage.getItem(key)||'{}'))}catch{return {}}}
  switchOwner(id){
    const previous=this.storage.getItem(OWNER)||'guest';if(previous===id)return;
    this.storage.setItem(cache(previous),JSON.stringify(this.read()));
    const cached=this.storage.getItem(cache(id));
    // Import guest choices on first sign-in, never import another account's choices.
    const incoming=cached?this.parse(cache(id)):previous==='guest'&&id!=='guest'?this.read():{};
    this.apply(incoming);this.storage.setItem(OWNER,id);
  }
  current(id=this.userId,generation=this.generation,epoch=this.ownerEpoch){
    return !!id&&this.userId===id&&this.generation===generation&&this.ownerEpoch===epoch&&this.auth.user?.id===id&&this.auth.epoch===epoch&&!!this.auth.session?.access_token&&this.storage.getItem(OWNER)===id;
  }
  detach(id){
    this.generation++;this.ready=false;this.userId=null;this.ownerEpoch=null;this.dirty={};this.baseline={};
    // A delayed A callback must never overwrite a B cache installed by another tab.
    if(this.storage.getItem(OWNER)===id){this.switchOwner('guest');this.onChange();}
    this.onStatus('local');
  }
  async request(path,options={}){
    const id=this.userId,generation=this.generation,epoch=this.ownerEpoch,token=this.auth.session?.access_token;
    const current=()=>this.current(id,generation,epoch)&&this.auth.session?.access_token===token;
    if(!current())throw Error('account_changed');
    const r=await this.fetch(`${SUPABASE_URL}/rest/v1/account_preferences${path}`,{...options,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,...options.headers,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
    if(!current())throw Error('account_changed');
    if(!r.ok)throw Error('sync_'+r.status);
    const data=r.status===204?null:await r.json();
    if(!current())throw Error('account_changed');
    return data;
  }
  async start(){
    const id=this.auth.user?.id,epoch=this.auth.epoch;if(!id||!this.auth.session?.access_token)return;
    if(this.ready&&this.current(id,this.generation,epoch))return;
    const generation=++this.generation;this.ready=false;this.userId=id;this.ownerEpoch=epoch;this.switchOwner(id);this.onChange();this.onStatus('loading');
    this.baseline=this.read();this.dirty=this.parse(pending(id));
    try{
      const rows=await this.request('?select=key,value&user_id=eq.'+encodeURIComponent(id));
      if(!this.current(id,generation,epoch)){if(this.generation===generation)this.detach(id);return;}
      const before=this.read(),server=permitted(Object.fromEntries(rows.map(r=>[r.key,r.value])));
      for(const key of SYNC_KEYS){if(before[key]!==this.baseline[key])this.dirty[key]=before[key];if(!(key in server)&&before[key]!==null)this.dirty[key]=before[key];}
      this.storage.setItem(pending(id),JSON.stringify(this.dirty));this.apply({...server,...this.dirty});this.baseline=this.read();this.ready=true;this.onChange();await this.flush();
    }catch{
      if(this.generation!==generation)return;
      if(!this.current(id,generation,epoch)){this.detach(id);return;}
      this.onStatus('failed');
    }
  }
  changed(){
    if(!this.current())return;const now=this.read();
    for(const key of SYNC_KEYS)if(now[key]!==this.baseline[key])this.dirty[key]=now[key];
    this.baseline=now;this.storage.setItem(pending(this.userId),JSON.stringify(this.dirty));
    if(this.ready)this.flush();
  }
  flush(){
    const id=this.userId,generation=this.generation,epoch=this.ownerEpoch;
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      if(!this.ready||!this.current(id,generation,epoch))return;
      const changes={...this.dirty};if(!Object.keys(changes).length){this.onStatus('ready');return;}
      this.onStatus('loading');
      try{
        await this.auth.restore();if(!this.current(id,generation,epoch)){if(this.generation===generation)this.detach(id);return;}
        await this.request('?on_conflict=user_id,key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(Object.entries(changes).map(([key,value])=>({user_id:id,key,value})))});
        if(!this.current(id,generation,epoch)){if(this.generation===generation)this.detach(id);return;}
        for(const [key,value]of Object.entries(changes))if(this.dirty[key]===value)delete this.dirty[key];
        this.storage.setItem(pending(id),JSON.stringify(this.dirty));this.onStatus('ready');
      }catch{
        if(this.generation!==generation)return;
        if(!this.current(id,generation,epoch)){this.detach(id);return;}
        this.storage.setItem(pending(id),JSON.stringify(this.dirty));this.onStatus('failed');
      }
    });return this.queue;
  }
  stop(){this.changed();this.generation++;this.ready=false;this.userId=null;this.ownerEpoch=null;this.dirty={};this.baseline={};this.switchOwner('guest');this.onChange();this.onStatus('local');}
}
