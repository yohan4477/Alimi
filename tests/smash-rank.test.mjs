import test from 'node:test';
import assert from 'node:assert/strict';
import {createSmashRankHandler, hashPin, checkPin} from '../api/smash-rank.js';

// 아주 작은 PostgREST 흉내: smash_scores / smash_players, eq 필터, POST/PATCH, count
function fakeDb() {
  const t = {smash_scores: [], smash_players: []};
  const fetcher = async (url, opt = {}) => {
    const u = new URL(url), name = u.pathname.split('/').pop(), rows = t[name], q = u.searchParams;
    const filt = (r) => [...q.entries()].every(([k, v]) => !v.startsWith('eq.') || String(r[k]) === v.slice(3)) &&
      (!q.get('score') || !q.get('score').startsWith('gt.') || r.score > Number(q.get('score').slice(3)));
    if (opt.method === 'POST') {
      const b = JSON.parse(opt.body);
      if (name === 'smash_players' && rows.some((r) => r.nickname === b.nickname)) return new Response(null, {status: 409});
      rows.push({...b, created_at: new Date().toISOString(), updated_at: b.updated_at || new Date().toISOString()});
      return new Response(null, {status: 201});
    }
    if (opt.method === 'PATCH') { rows.filter(filt).forEach((r) => Object.assign(r, JSON.parse(opt.body))); return new Response(null, {status: 204}); }
    let out = rows.filter(filt);
    if (q.get('order')?.startsWith('score.desc')) out = [...out].sort((a, b) => b.score - a.score);
    if (q.get('order')?.startsWith('updated_at.desc')) out = [...out].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    if (opt.headers?.Prefer === 'count=exact') return new Response('[]', {headers: {'content-range': `0-0/${out.length}`}});
    return Response.json(out.slice(0, Number(q.get('limit') || 100)));
  };
  return {t, fetcher};
}
async function call(h, method, body, ip = '1.1.1.1') {
  const res = {setHeader() {}, end(b) { this.body = JSON.parse(b); }};
  await h({method, url: '/api/smash-rank?game=seohyeon', headers: {origin: 'https://seoulbeauty.me', 'x-forwarded-for': ip, 'user-agent': 't'}, body}, res);
  return [res.statusCode, res.body];
}

test('pin hash round trip', () => {
  const h = hashPin('1234');
  assert.ok(checkPin('1234', h));
  assert.ok(!checkPin('1235', h));
});

test('nickname is claimed by first pin, others rejected, best score kept', async () => {
  const db = fakeDb();
  const h = createSmashRankHandler({env: {SUPABASE_SECRET_KEY: 'sb_secret_x'}, fetcher: db.fetcher});
  let [s, b] = await call(h, 'POST', {nickname: '철수', pin: '1234', score: 1000}, 'a');
  assert.equal(s, 200); assert.equal(b.created, true);
  [s, b] = await call(h, 'POST', {nickname: '철수', pin: '9999', score: 5000}, 'b');
  assert.equal(s, 403);
  [s, b] = await call(h, 'POST', {nickname: '철수', pin: '1234', score: 500}, 'c');
  assert.equal(s, 200); assert.equal(b.improved, false); assert.equal(b.best, 1000);
  [s, b] = await call(h, 'POST', {nickname: '철수', pin: '1234', score: 3000}, 'd');
  assert.equal(s, 200); assert.equal(b.improved, true);
  assert.equal(db.t.smash_scores.length, 1);
  assert.equal(db.t.smash_scores[0].score, 3000);
  [s] = await call(h, 'POST', {nickname: '영희', pin: '12', score: 1}, 'e');
  assert.equal(s, 400);
});

test('five wrong pins lock the nickname', async () => {
  const db = fakeDb();
  const h = createSmashRankHandler({env: {SUPABASE_SECRET_KEY: 'sb_secret_x'}, fetcher: db.fetcher});
  await call(h, 'POST', {nickname: '민수', pin: 'abcd', score: 1}, 'x0');
  for (let i = 1; i <= 5; i++) assert.equal((await call(h, 'POST', {nickname: '민수', pin: 'zzzz', score: 2}, 'x' + i))[0], 403);
  assert.equal((await call(h, 'POST', {nickname: '민수', pin: 'abcd', score: 2}, 'x9'))[0], 423);
});
