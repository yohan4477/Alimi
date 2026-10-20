// Supabase OAuth with PKCE. Provider secrets stay in Supabase, never in the browser.
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from './live.js';
import {t} from './i18n.js';

const SESSION_KEY = 'alimi-auth-session-v1';
const VERIFIER_KEY = 'alimi-auth-code-verifier';
const STATE_KEY = 'alimi-auth-state';
const STATE_PARAM = 'sb_auth_state';
export const AUTH_PROVIDERS = Object.freeze({google: 'google', kakao: 'kakao', naver: 'custom:naver'});
const bytesToBase64URL = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export class SocialAuth {
  constructor({fetchImpl = fetch, storage = globalThis.localStorage, sessionStorage = globalThis.sessionStorage, location = globalThis.location, history = globalThis.history} = {}) {
    this.fetch = fetchImpl;
    this.storage = storage;
    this.sessionStorage = sessionStorage;
    this.location = location;
    this.history = history;
    this.pending = false;
    this.session = null;
    this.user = null;
  }
  async request(path, {method = 'GET', token, body} = {}) {
    const response = await this.fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method,
      headers: {apikey: SUPABASE_PUBLISHABLE_KEY, ...(token ? {Authorization: `Bearer ${token}`} : {}), ...(body ? {'Content-Type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.msg || data.message || data.error_description || data.error || '';
      if (/provider is not enabled|unsupported provider|custom provider.*not found|custom_provider_not_found/i.test(detail)) throw new Error(t('account.providerDisabled'));
      throw new Error(detail || `Auth request failed (${response.status})`);
    }
    return data;
  }
  async startGoogleLogin() { return this.startLogin('google'); }
  async startLogin(provider) {
    if (!Object.hasOwn(AUTH_PROVIDERS, provider)) throw new Error(t('account.failed'));
    if (this.pending) return;
    this.pending = true;
    try {
      const verifier = bytesToBase64URL(crypto.getRandomValues(new Uint8Array(32)));
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = bytesToBase64URL(new Uint8Array(digest));
      const state = bytesToBase64URL(crypto.getRandomValues(new Uint8Array(24)));
      this.sessionStorage.setItem(VERIFIER_KEY, verifier);
      this.sessionStorage.setItem(STATE_KEY, state);
      const redirect = new URL(`${this.location.origin}${this.location.pathname}${this.location.search}`);
      for (const key of ['code', 'state', 'error', 'error_description', 'error_code']) redirect.searchParams.delete(key);
      // Supabase manages the upstream OAuth state. Bind our return URL separately.
      redirect.searchParams.set(STATE_PARAM, state);
      const params = new URLSearchParams({provider: AUTH_PROVIDERS[provider], redirect_to: redirect.toString(),
        code_challenge: challenge, code_challenge_method: 's256', skip_http_redirect: 'true'});
      if (provider === 'google') params.set('scopes', 'openid email profile');
      const {url} = await this.request(`authorize?${params}`);
      if (!url || new URL(url).protocol !== 'https:') throw new Error(t('account.failed'));
      this.location.assign(url);
    } catch (error) {
      this.clearPending();
      throw error;
    } finally { this.pending = false; }
  }
  clearPending() {
    this.sessionStorage.removeItem(VERIFIER_KEY);
    this.sessionStorage.removeItem(STATE_KEY);
  }
  async handleCallback() {
    const url = new URL(this.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error') || fragment.get('error');
    if (oauthError) {
      this.clearPending();
      this.cleanCallbackURL(url); throw new Error(t('account.cancelled'));
    }
    const code = url.searchParams.get('code');
    if (!code) return false;
    const expectedState = this.sessionStorage.getItem(STATE_KEY);
    const verifier = this.sessionStorage.getItem(VERIFIER_KEY);
    try {
      if (!expectedState || !verifier || url.searchParams.get(STATE_PARAM) !== expectedState) throw new Error(t('account.unverified'));
      this.session = await this.request('token?grant_type=pkce', {method: 'POST', body: {auth_code: code, code_verifier: verifier}});
      this.user = await this.request('user', {token: this.session.access_token});
      this.saveSession();
      return true;
    } catch (error) {
      this.clearSession();
      throw error;
    } finally {
      this.clearPending();
      this.cleanCallbackURL(url);
    }
  }
  cleanCallbackURL(url) {
    for (const key of ['code', 'state', STATE_PARAM, 'error', 'error_description', 'error_code']) url.searchParams.delete(key);
    if (new URLSearchParams(url.hash.slice(1)).has('error')) url.hash = '';
    if (this.history?.replaceState) this.history.replaceState({}, '', url.toString());
    else this.location.replace(url.toString());
  }
  saveSession() {
    if (!this.session) return;
    this.session.expires_at = Math.floor(Date.now() / 1000) + (this.session.expires_in || 3600);
    this.storage.setItem(SESSION_KEY, JSON.stringify(this.session));
  }
  async restore() {
    if (!this.session) {
      try { this.session = JSON.parse(this.storage.getItem(SESSION_KEY) || 'null'); } catch { this.session = null; }
    }
    if (!this.session) return null;
    if ((this.session.expires_at || 0) <= Math.floor(Date.now() / 1000) + 30) {
      try {
        this.session = await this.request('token?grant_type=refresh_token', {method: 'POST', body: {refresh_token: this.session.refresh_token}});
        this.saveSession();
      } catch { this.clearSession(); return null; }
    }
    try { this.user = await this.request('user', {token: this.session.access_token}); return this.user; }
    catch { this.clearSession(); return null; }
  }
  async signOut() {
    if (this.session?.access_token) {
      try { await this.request('logout', {method: 'POST', token: this.session.access_token}); } catch {}
    }
    this.clearSession();
  }
  clearSession() {
    this.session = null; this.user = null;
    this.storage.removeItem(SESSION_KEY);
  }
}

export {SocialAuth as GoogleAuth}; // Compatibility for existing clients.
export const AUTH_STORAGE_KEYS = {SESSION_KEY, VERIFIER_KEY, STATE_KEY};
