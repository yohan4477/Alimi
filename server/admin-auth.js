// Server-only authorization. Never trust browser flags, decoded JWT claims or user_metadata.
export const AUTH_URL = 'https://mqsnshnlfwsgabrsmqsz.supabase.co/auth/v1';
const PUBLISHABLE_KEY = 'sb_publishable_CJjQ-l5ev-D4OH0Na0gFoQ_szunygff';
export const SESSION_COOKIE = '__Host-sb-admin';
export function isAdmin(user) {
  return Boolean(user && typeof user.id === 'string' && user.id && !user.is_anonymous &&
    user.email_confirmed_at && user.app_metadata?.seoulbeauty_admin === true);
}
export function adminOrigin(env = process.env) {
  const value = env.ADMIN_ORIGIN || 'https://alimi-omega.vercel.app';
  const url = new URL(value);
  const local = env.NODE_ENV !== 'production' && !env.VERCEL && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.origin !== value || url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw Error('Invalid admin origin');
  return url.origin;
}
export function sameOrigin(req, origin) {
  return req.headers.origin === origin && req.headers['sec-fetch-site'] !== 'cross-site';
}
// Explicit production aliases only; never trust arbitrary Host/forwarded headers.
export function sameAdminOrigin(req, env = process.env) {
  if (sameOrigin(req, adminOrigin(env))) return true;
  const aliases = ['https://seoulbeauty.me', 'https://www.seoulbeauty.me', 'https://alimi-omega.vercel.app'];
  const origin = req.headers.origin;
  return aliases.includes(origin) && req.headers.host === new URL(origin).host && sameOrigin(req, origin);
}
export function readToken(req) {
  const raw = req.headers.cookie || '';
  if (raw.length > 8192) return null;
  const values = raw.split(';').map(x => x.trim()).filter(x => x.startsWith(SESSION_COOKIE + '='));
  if (values.length !== 1) return null;
  const token = values[0].slice(SESSION_COOKIE.length + 1);
  return token.length <= 3500 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : null;
}
export function sessionCookie(token, seconds) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
}
export const clearCookie = () => sessionCookie('', 0);
export async function authRequest(path, {fetchImpl = fetch, token, body} = {}) {
  const response = await fetchImpl(AUTH_URL + path, {
    method: body ? 'POST' : 'GET',
    headers: {apikey: PUBLISHABLE_KEY, ...(token ? {Authorization: `Bearer ${token}`} : {}), ...(body ? {'Content-Type': 'application/json'} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store'
  });
  // Never include upstream bodies, passwords or tokens in errors/logs.
  if (response.status >= 500 || response.status === 429) throw Error('Authentication unavailable');
  if (!response.ok) return null;
  return response.json();
}
export async function verifiedAdmin(token, fetchImpl = fetch) {
  const user = await authRequest('/user', {token, fetchImpl});
  return {user, allowed: isAdmin(user)};
}
