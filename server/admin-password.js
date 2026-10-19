import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
const digest = value => createHash('sha256').update(value).digest();
function key(env) {
  if (!env.ADMIN_SHARED_PASSWORD || !env.ADMIN_SHARED_SESSION_SECRET || env.ADMIN_SHARED_SESSION_SECRET.length < 32) throw Error('Admin password configuration unavailable');
  // Changing the password also invalidates existing sessions.
  return createHmac('sha256', env.ADMIN_SHARED_SESSION_SECRET).update(env.ADMIN_SHARED_PASSWORD).digest();
}
export function passwordMatches(value, env) {
  key(env);
  return typeof value === 'string' && timingSafeEqual(digest(value), digest(env.ADMIN_SHARED_PASSWORD));
}
export function passwordSession(env, now = Date.now()) {
  const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body = Buffer.from(JSON.stringify({scope:'admin-review',exp:Math.floor(now/1000)+3600,nonce:randomBytes(16).toString('hex')})).toString('base64url');
  const payload = `${header}.${body}`;
  return `${payload}.${createHmac('sha256',key(env)).update(payload).digest('base64url')}`;
}
export function validPasswordSession(token, env, now = Date.now()) {
  const secret = key(env);
  try {
    const parts = token.split('.');
    if(parts.length !== 3) return false;
    const expected = createHmac('sha256',secret).update(parts.slice(0,2).join('.')).digest();
    const actual = Buffer.from(parts[2],'base64url');
    if(actual.length !== expected.length || !timingSafeEqual(actual,expected)) return false;
    const body = JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    return body.scope === 'admin-review' && Number.isInteger(body.exp) && body.exp > Math.floor(now/1000) && body.exp <= Math.floor(now/1000)+3600;
  } catch { return false; }
}
