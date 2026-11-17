// 「서현역 부수기」 순위표 API. GET ?game=seohyeon → 상위 20 + 내 점수 순위(?score=), POST {nickname, score, destroyed} → 등록.
// Supabase public.smash_scores (migration 20261117090000). 테이블이 없으면 503.
import {createHash} from 'node:crypto';
const ALLOWED = new Set(['https://seoulbeauty.me', 'https://www.seoulbeauty.me', 'https://alimi-omega.vercel.app']);
const URL_BASE = 'https://mqsnshnlfwsgabrsmqsz.supabase.co/rest/v1/smash_scores';
const MAX_SCORE = 1e17;            // 원. 도시 전체 추정 집값보다 넉넉히 큰 상한
const COOLDOWN_MS = 20000;         // 같은 접속에서 20초에 한 번
const BAD = /[\u0000-\u001f<>]/;

export function createSmashRankHandler({env = process.env, fetcher = fetch} = {}) {
  return async (req, res) => {
    const send = (status, obj) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(JSON.stringify(obj));
    };
    if (!['GET', 'POST'].includes(req.method)) return send(405, {error: 'Method not allowed'});
    if (req.method === 'POST' && !ALLOWED.has(req.headers.origin)) return send(403, {error: 'Origin not allowed'});
    const key = env.SUPABASE_SECRET_KEY;
    if (!key) return send(503, {error: 'Not configured'});
    const headers = {apikey: key, 'Content-Type': 'application/json'};
    if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
    const u = new URL(req.url, 'https://seoulbeauty.me');
    const game = /^[a-z0-9-]{1,30}$/.test(u.searchParams.get('game') || '') ? u.searchParams.get('game') : 'seohyeon';
    const get = (q) => fetcher(URL_BASE + '?' + new URLSearchParams(q), {headers, redirect: 'error', signal: AbortSignal.timeout(8000)});
    const top = async () => {
      const r = await get({select: 'nickname,score,destroyed,created_at', game: 'eq.' + game, order: 'score.desc,id.asc', limit: '20'});
      if (!r.ok) throw new Error('top');
      return r.json();
    };
    const rankOf = async (score) => {
      const r = await fetcher(URL_BASE + '?' + new URLSearchParams({select: 'id', game: 'eq.' + game, score: 'gt.' + score, limit: '1'}),
        {headers: {...headers, Prefer: 'count=exact'}, redirect: 'error', signal: AbortSignal.timeout(8000)});
      if (!r.ok) throw new Error('rank');
      const m = String(r.headers.get('content-range') || '').match(/\/(\d+)$/);
      return m ? Number(m[1]) + 1 : null;
    };
    try {
      if (req.method === 'GET') {
        const s = Number(u.searchParams.get('score'));
        const out = {top: await top()};
        if (Number.isFinite(s) && s >= 0 && s < MAX_SCORE) out.rank = await rankOf(Math.floor(s));
        return send(200, out);
      }
      let body = req.body;
      if (body === undefined) {
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 1024) return send(413, {error: 'Too large'}); chunks.push(c); }
        body = Buffer.concat(chunks).toString();
      }
      if (typeof body === 'string') { if (Buffer.byteLength(body) > 1024) return send(413, {error: 'Too large'}); try { body = JSON.parse(body); } catch { return send(400, {error: 'Invalid JSON'}); } }
      const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
      const score = Number(body?.score), destroyed = Number(body?.destroyed ?? 0);
      if (!nickname || [...nickname].length > 12 || BAD.test(nickname)) return send(400, {error: '닉네임은 1~12자'});
      if (!Number.isInteger(score) || score < 0 || score >= MAX_SCORE) return send(400, {error: 'Invalid score'});
      if (!Number.isInteger(destroyed) || destroyed < 0 || destroyed > 100000) return send(400, {error: 'Invalid destroyed'});
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'none';
      const client_hash = createHash('sha256').update('smash:' + ip + ':' + (req.headers['user-agent'] || '')).digest('hex');
      const recent = await get({select: 'created_at', client_hash: 'eq.' + client_hash, order: 'created_at.desc', limit: '1'});
      if (!recent.ok) return send(503, {error: 'Please try again'});
      const last = (await recent.json())[0];
      if (last && Date.now() - Date.parse(last.created_at) < COOLDOWN_MS) return send(429, {error: '잠시 후 다시 등록해 주세요'});
      const ins = await fetcher(URL_BASE, {method: 'POST', headers: {...headers, Prefer: 'return=minimal'},
        body: JSON.stringify({game, nickname, score, destroyed, client_hash}), redirect: 'error', signal: AbortSignal.timeout(8000)});
      if (!ins.ok) return send(503, {error: 'Could not save'});
      return send(200, {ok: true, rank: await rankOf(score), top: await top()});
    } catch {
      return send(503, {error: 'Please try again'});
    }
  };
}
export default createSmashRankHandler();
