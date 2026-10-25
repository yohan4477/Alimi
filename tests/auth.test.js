import './fixtures/en-locale.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {GoogleAuth, AUTH_STORAGE_KEYS} from '../dist/auth.js';

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
const response = (data, status = 200) => ({ok: status >= 200 && status < 300, status, json: async () => data});

test('Google sign-in creates PKCE and state, then navigates to Supabase authorize', async () => {
  const calls = [], sessionStorage = new MemoryStorage();
  const location = {origin: 'https://alimi.example', pathname: '/live', search: '?lang=ko&region=kr', assign: url => { location.assigned = url; }};
  const auth = new GoogleAuth({sessionStorage, location, storage: new MemoryStorage(), fetchImpl: async (url, options) => {
    calls.push({url, options}); return response({url: 'https://accounts.google.com/o/oauth2/auth'});
  }});
  await auth.startGoogleLogin();
  assert.equal(calls.length, 0);
  const requestURL = new URL(location.assigned);
  assert.equal(requestURL.pathname, '/auth/v1/authorize');
  assert.equal(requestURL.searchParams.has('skip_http_redirect'), false);
  assert.equal(requestURL.searchParams.get('provider'), 'google');
  assert.equal(requestURL.searchParams.get('code_challenge_method'), 's256');
  assert.equal(new URL(requestURL.searchParams.get('redirect_to')).pathname, '/');
  assert.equal(new URL(requestURL.searchParams.get('redirect_to')).searchParams.get('region'), 'kr');
  assert.equal(new URL(requestURL.searchParams.get('redirect_to')).searchParams.get('lang'), 'ko');
  assert.equal(new URL(requestURL.searchParams.get('redirect_to')).searchParams.get('sb_login_state'), sessionStorage.getItem(AUTH_STORAGE_KEYS.STATE_KEY));
  assert.match(requestURL.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.ok(sessionStorage.getItem(AUTH_STORAGE_KEYS.VERIFIER_KEY));
  assert.ok(sessionStorage.getItem(AUTH_STORAGE_KEYS.STATE_KEY));
});

test('default fetch is called unbound-safe (browser fetch throws Illegal invocation when this is not Window)', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = function (url) { if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation'); return Promise.resolve(response({ok: true})); };
  try { assert.deepEqual(await new GoogleAuth({storage: new MemoryStorage(), sessionStorage: new MemoryStorage()}).request('settings'), {ok: true}); }
  finally { globalThis.fetch = original; }
});

test('OAuth callback checks state, exchanges the code, fetches the user, and persists the session', async () => {
  const storage = new MemoryStorage(), sessionStorage = new MemoryStorage(), calls = [];
  sessionStorage.setItem(AUTH_STORAGE_KEYS.VERIFIER_KEY, 'test-verifier');
  sessionStorage.setItem(AUTH_STORAGE_KEYS.STATE_KEY, 'expected-state');
  sessionStorage.setItem(AUTH_STORAGE_KEYS.FLOW_TIME, Date.now());
  const location = {href: 'https://alimi.example/?code=one-time-code&sb_login_state=expected-state', replace: value => { location.replaced = value; }};
  const auth = new GoogleAuth({storage, sessionStorage, location, fetchImpl: async (url, options) => {
    calls.push({url, options});
    return calls.length === 1
      ? response({access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user: {email: 'person@gmail.com'}})
      : response({email: 'person@gmail.com'});
  }});
  assert.equal(await auth.handleCallback(), true);
  assert.equal(auth.user.email, 'person@gmail.com');
  assert.equal(JSON.parse(storage.getItem(AUTH_STORAGE_KEYS.SESSION_KEY)).refresh_token, 'refresh');
  assert.equal(JSON.parse(calls[0].options.body).code_verifier, 'test-verifier');
  assert.equal(new URL(location.replaced).search, '');
  assert.equal(sessionStorage.getItem(AUTH_STORAGE_KEYS.VERIFIER_KEY), null);
});

test('OAuth callback rejects a mismatched state before exchanging the code', async () => {
  let requests = 0;
  const sessionStorage = new MemoryStorage();
  sessionStorage.setItem(AUTH_STORAGE_KEYS.VERIFIER_KEY, 'verifier');
  sessionStorage.setItem(AUTH_STORAGE_KEYS.STATE_KEY, 'right-state');
  sessionStorage.setItem(AUTH_STORAGE_KEYS.FLOW_TIME, Date.now());
  const auth = new GoogleAuth({sessionStorage, storage: new MemoryStorage(),
    location: {href: 'https://alimi.example/?code=code&sb_login_state=wrong-state', replace() {}},
    fetchImpl: async () => { requests++; return response({}); }});
  await assert.rejects(auth.handleCallback(), /could not be verified/i);
  assert.equal(requests, 0);
});

