import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {adminOrigin, sameOrigin, readToken, sessionCookie, clearCookie, authRequest, verifiedAdmin} from '../server/admin-auth.js';

const pageFile = new URL('../server/admin-page.html', import.meta.url);
const reviewFile = new URL('../server/admin-planning-review.html', import.meta.url);
const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache', 'Vary': 'Cookie',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; frame-src 'self'"
};
function loginPage(message = '관리자로 지정된 계정으로 로그인하세요.') {
  // Only fixed, server-owned messages are passed here; never interpolate user input.
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>관리자 로그인 · SeoulBeauty</title><link rel="stylesheet" href="/admin.css"></head><body><main class="login-shell"><a class="wordmark" href="/">SeoulBeauty</a><h1>관리자 페이지</h1><p role="status">${message}</p><form method="post" action="/api/admin?action=login"><label>이메일<input type="email" name="email" autocomplete="username" required maxlength="254"></label><label>비밀번호<input type="password" name="password" autocomplete="current-password" required maxlength="1024"></label><button class="btn btn-primary" type="submit">로그인</button></form><p class="text-small text-muted">일반 계정에는 관리자 권한이 부여되지 않습니다.</p></main></body></html>`;
}
async function credentials(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return null;
  if (Number(req.headers['content-length']) > 4096) return null;
  let body = req.body;
  if (body === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 4096) return null; chunks.push(chunk); }
    body = Buffer.concat(chunks.map(x => Buffer.from(x))).toString('utf8');
  }
  if (typeof body === 'object' && body !== null) {
    if (Buffer.byteLength(JSON.stringify(body)) > 4096) return null;
    if (typeof body.email !== 'string' || typeof body.password !== 'string') return null;
  } else if (typeof body === 'string' && Buffer.byteLength(body) <= 4096) {
    const form = new URLSearchParams(body);
    if (form.getAll('email').length !== 1 || form.getAll('password').length !== 1) return null;
    body = Object.fromEntries(form);
  } else return null;
  const email = body.email.trim(), password = body.password;
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length > 0 && password.length <= 1024 ? {email, password} : null;
}
export function createAdminHandler({fetchImpl = fetch, readPage = () => readFile(pageFile, 'utf8'), readReview = () => readFile(reviewFile, 'utf8'), env = process.env} = {}) {
  return async function admin(req, res) {
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    const send = (status, body) => { res.statusCode = status; res.end(body); };
    const redirect = () => { res.statusCode = 303; res.setHeader('Location', '/admin'); res.end(); };
    try {
      const url = new URL(req.url, 'https://internal.invalid');
      const action = url.searchParams.get('action');
      if (action && !['login', 'logout'].includes(action)) return send(404, loginPage('페이지를 찾을 수 없습니다.'));
      if (!['GET', 'POST'].includes(req.method) || (action && req.method !== 'POST') || (!action && req.method !== 'GET')) {
        res.setHeader('Allow', action ? 'POST' : 'GET'); return send(405, loginPage('지원하지 않는 요청입니다.'));
      }
      if (req.method === 'POST' && !sameOrigin(req, adminOrigin(env))) return send(403, loginPage('요청 출처를 확인할 수 없습니다. 관리자 페이지에서 다시 시도하세요.'));
      if (action === 'logout') {
        res.setHeader('Set-Cookie', clearCookie());
        const token = readToken(req);
        if (token) {
          // Cookie clearing always completes, even when upstream logout is unavailable.
          try { await fetchImpl('https://mqsnshnlfwsgabrsmqsz.supabase.co/auth/v1/logout?scope=local', {
            method: 'POST', headers: {apikey: 'sb_publishable_CJjQ-l5ev-D4OH0Na0gFoQ_szunygff', Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(5000), redirect: 'error'
          }); } catch {}
        }
        return redirect();
      }
      if (action === 'login') {
        const input = await credentials(req);
        if (!input) return send(400, loginPage('이메일과 비밀번호를 확인하세요.'));
        const session = await authRequest('/token?grant_type=password', {body: input, fetchImpl});
        if (!session?.access_token || !Number.isFinite(session.expires_in) || session.expires_in <= 0 || session.access_token.length > 3500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session.access_token)) {
          res.setHeader('Set-Cookie', clearCookie()); return send(401, loginPage('로그인할 수 없습니다. 계정 정보를 확인하세요.'));
        }
        // Fetch current server-side user metadata; do not trust the session response/JWT role alone.
        const result = await verifiedAdmin(session.access_token, fetchImpl);
        if (!result.allowed) { res.setHeader('Set-Cookie', clearCookie()); return send(403, loginPage('이 계정에는 관리자 접근 권한이 없습니다.')); }
        res.setHeader('Set-Cookie', sessionCookie(session.access_token, Math.min(3600, Math.floor(session.expires_in))));
        return redirect();
      }
      const token = readToken(req);
      if (!token) return send(401, loginPage());
      const result = await verifiedAdmin(token, fetchImpl);
      if (!result.user) { res.setHeader('Set-Cookie', clearCookie()); return send(401, loginPage('로그인이 만료되었습니다. 다시 로그인하세요.')); }
      if (!result.allowed) { res.setHeader('Set-Cookie', clearCookie()); return send(403, loginPage('이 계정에는 관리자 접근 권한이 없습니다.')); }
      if (url.searchParams.get('view') === 'planning-review') {
        const review = await readReview();
        const scriptHashes = [...review.matchAll(/<script>([\s\S]*?)<\/script>/g)]
          .map(([, script]) => "'sha256-" + createHash('sha256').update(script).digest('base64') + "'").join(' ');
        // The unchanged review uses dynamic style attributes for screenshot crops.
        // Permit these only in the authenticated, isolated review document.
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src ${scriptHashes}; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`);
        return send(200, review);
      }
      return send(200, await readPage());
    } catch {
      return send(503, loginPage('일시적으로 접근을 확인할 수 없습니다. 잠시 후 다시 시도하세요.'));
    }
  };
}
export default createAdminHandler();
