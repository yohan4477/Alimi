// Minimal Supabase Auth client for Google OAuth (PKCE). No Google credential is stored in this app.
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from './live.js';
import {t} from './i18n.js';

const SESSION_KEY = 'alimi-auth-session-v1';
const VERIFIER_KEY = 'alimi-auth-code-verifier';
const STATE_KEY = 'alimi-auth-state';
const bytesToBase64URL = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export class GoogleAuth {
  constructor({fetchImpl = fetch, storage = globalThis.localStorage, sessionStorage = globalThis.sessionStorage, location = globalThis.location} = {}) {
    this.fetch = fetchImpl;
    this.storage = storage;
    this.sessionStorage = sessionStorage;
    this.location = location;
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
      if (/provider is not enabled|unsupported provider/i.test(detail)) throw new Error(t('account.providerDisabled'));
      throw new Error(detail || `Auth request failed (${response.status})`);
    }
    return data;
  }
  async startGoogleLogin() {
    const verifier = bytesToBase64URL(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = bytesToBase64URL(new Uint8Array(digest));
    const state = bytesToBase64URL(crypto.getRandomValues(new Uint8Array(24)));
    this.sessionStorage.setItem(VERIFIER_KEY, verifier);
    this.sessionStorage.setItem(STATE_KEY, state);
    const redirectTo = `${this.location.origin}${this.location.pathname}${this.location.search}`;
    const params = new URLSearchParams({provider: 'google', redirect_to: redirectTo, code_challenge: challenge,
      code_challenge_method: 's256', state, scopes: 'openid email profile', skip_http_redirect: 'true'});
    const {url} = await this.request(`authorize?${params}`);
    if (!url) throw new Error('Supabase did not return a Google sign-in URL');
    this.location.assign(url);
  }
  async handleCallback() {
    const url = new URL(this.location.href);
    const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error');
    if (oauthError) {
      this.sessionStorage.removeItem(VERIFIER_KEY); this.sessionStorage.removeItem(STATE_KEY);
      this.cleanCallbackURL(url); throw new Error('Google sign-in was cancelled or denied. Please try again.');
    }
    const code = url.searchParams.get('code');
    if (!code) return false;
    const expectedState = this.sessionStorage.getItem(STATE_KEY);
    const verifier = this.sessionStorage.getItem(VERIFIER_KEY);
    if (!expectedState || !verifier || url.searchParams.get('state') !== expectedState) throw new Error('Google sign-in could not be verified. Please try again.');
    try {
      this.session = await this.request('token?grant_type=pkce', {method: 'POST', body: {auth_code: code, code_verifier: verifier}});
      this.saveSession();
      this.user = await this.request('user', {token: this.session.access_token});
      this.cleanCallbackURL(url);
      return true;
    } finally {
      this.sessionStorage.removeItem(VERIFIER_KEY);
      this.sessionStorage.removeItem(STATE_KEY);
    }
  }
  cleanCallbackURL(url) {
    url.searchParams.delete('code'); url.searchParams.delete('state');
    url.searchParams.delete('error'); url.searchParams.delete('error_description');
    this.location.replace(url.toString());
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

export const AUTH_STORAGE_KEYS = {SESSION_KEY, VERIFIER_KEY, STATE_KEY};
