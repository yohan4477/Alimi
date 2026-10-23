import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from './supabase.js';
import {t} from './i18n.js';
const SESSION_KEY='alimi-auth-session-v1', VERIFIER_KEY='alimi-auth-code-verifier', STATE_KEY='alimi-auth-state';
const FLOW_TIME='seoulbeauty-auth-started';
export const PROVIDERS={google:{id:'google',scopes:'openid email profile'},kakao:{id:'custom:kakao',scopes:''},naver:{id:'custom:naver',scopes:''}};
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export class GoogleAuth {
  constructor({fetchImpl=(...a)=>fetch(...a),storage=globalThis.localStorage,sessionStorage=globalThis.sessionStorage,location=globalThis.location}={}){Object.assign(this,{fetch:fetchImpl,storage,sessionStorage,location,session:null,user:null,pending:null,epoch:0});}
  async request(path,{method='GET',token,body}={}){
    const r=await this.fetch(`${SUPABASE_URL}/auth/v1/${path}`,{method,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok){const detail=data.msg||data.message||data.error_description||data.error||'';const e=new Error(/provider.*(enabled|found)|unsupported provider/i.test(detail)?t('account.providerDisabled'):detail||t('account.failed'));e.status=r.status;throw e;}return data;
  }
  startGoogleLogin(){return this.startLogin('google');}
  async startLogin(provider){
    const config=PROVIDERS[provider];if(!config)throw Error(t('account.failed'));
    const verifier=b64(crypto.getRandomValues(new Uint8Array(32))),nonce=b64(crypto.getRandomValues(new Uint8Array(24)));
    const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    this.sessionStorage.setItem(VERIFIER_KEY,verifier);this.sessionStorage.setItem(STATE_KEY,nonce);this.sessionStorage.setItem(FLOW_TIME,String(Date.now()));
    const redirect=new URL(`${this.location.origin}${this.location.pathname}${this.location.search}`);
    const legacyMarket=/^\/(kr|us)\/?$/.exec(redirect.pathname)?.[1];
    // Keep the established root OAuth callback; public-entry dispatches it to /live.
    // No new provider/Supabase redirect allowlist entry is assumed or configured.
    redirect.pathname='/';if(legacyMarket)redirect.searchParams.set('region',legacyMarket);
    redirect.searchParams.delete('demo');
    for(const k of ['code','state','error','error_description','sb_login_state'])redirect.searchParams.delete(k);
    // Supabase owns upstream OAuth state. Bind our callback through redirect_to + PKCE.
    redirect.searchParams.set('sb_login_state',nonce);
    // Supabase answers authorize with a 302 even with skip_http_redirect; fetch would hit CORS, so navigate.
    const params=new URLSearchParams({provider:config.id,redirect_to:redirect.href,code_challenge:challenge,code_challenge_method:'s256'});
    if(config.scopes)params.set('scopes',config.scopes);
    this.location.assign(`${SUPABASE_URL}/auth/v1/authorize?${params}`);
  }
  clearFlow(){for(const k of [VERIFIER_KEY,STATE_KEY,FLOW_TIME])this.sessionStorage.removeItem(k);}
  async handleCallback(){
    const url=new URL(this.location.href),code=url.searchParams.get('code');
    if(url.searchParams.has('error')){this.clearFlow();this.cleanCallbackURL(url);throw Error(t('account.cancelled'));}
    if(!code)return false;
    const expected=this.sessionStorage.getItem(STATE_KEY),verifier=this.sessionStorage.getItem(VERIFIER_KEY),started=Number(this.sessionStorage.getItem(FLOW_TIME));
    try{
      if(!expected||!verifier||url.searchParams.get('sb_login_state')!==expected||!started||Date.now()-started>600000)throw Error(t('account.invalidCallback'));
      const session=await this.request('token?grant_type=pkce',{method:'POST',body:{auth_code:code,code_verifier:verifier}});
      const user=await this.request('user',{token:session.access_token});
      this.session=session;this.user=user;this.saveSession();return true;
    }finally{this.clearFlow();this.cleanCallbackURL(url);}
  }
  cleanCallbackURL(url){for(const k of ['code','state','error','error_description','sb_login_state'])url.searchParams.delete(k);if(globalThis.history&&globalThis.location?.origin===url.origin)history.replaceState({},'',url.href);else this.location.replace(url.href);}
  saveSession(){if(!this.session)return;this.session.expires_at ||= Math.floor(Date.now()/1000)+(this.session.expires_in||3600);this.storage.setItem(SESSION_KEY,JSON.stringify(this.session));}
  async restore(){
    if(this.pending)return this.pending;
    this.pending=this.restoreSession().finally(()=>{this.pending=null;});return this.pending;
  }
  async restoreSession(){
    const epoch=this.epoch;let session;
    try{session=JSON.parse(this.storage.getItem(SESSION_KEY)||'null');}catch{session=null;}
    if(!session){this.session=null;this.user=null;return null;}
    this.session=session;
    try{
      if((session.expires_at||0)<=Date.now()/1000+60){session=await this.request('token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});if(epoch!==this.epoch)return null;this.session=session;this.saveSession();}
      const user=await this.request('user',{token:session.access_token});if(epoch!==this.epoch)return null;
      this.session=session;this.user=user;return user;
    }catch(e){if(epoch===this.epoch&&(e.status===400||e.status===401||e.status===403))this.clearSession();throw e;}
  }
  async signOut(){this.epoch++;try{if(this.session?.access_token)await this.request('logout?scope=local',{method:'POST',token:this.session.access_token});}finally{this.clearSession();}}
  clearSession(){this.session=null;this.user=null;this.storage.removeItem(SESSION_KEY);}
}
export const AUTH_STORAGE_KEYS={SESSION_KEY,VERIFIER_KEY,STATE_KEY,FLOW_TIME};
