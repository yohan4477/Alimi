import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAdminHandler} from '../api/admin.js';
import {SESSION_COOKIE} from '../server/admin-auth.js';

const token = 'header.signed.token';
const admin = {id:'user-1',email_confirmed_at:'2026-10-19T00:00:00Z',is_anonymous:false,app_metadata:{seoulbeauty_admin:true}};
const page = await readFile(new URL('../server/reference-dex.html', import.meta.url), 'utf8');
const dex = JSON.parse(page.match(/<script type="application\/json" id="dex">([\s\S]*?)<\/script>/)[1]);
const ids = dex.effects.map(e => e.id);
const env = {NODE_ENV:'test', ADMIN_ORIGIN:'https://admin.example', SUPABASE_SECRET_KEY:'sb_secret_test'};
const cookie = `${SESSION_COOKIE}=${token}`;
const PICKS = 'https://mqsnshnlfwsgabrsmqsz.supabase.co/storage/v1/object/reference-media/picks/dex-picks.json';

// In-memory stand-in for the private Storage bucket.
function storage({failRead = false, failWrite = false, missing = 'notfound400'} = {}) {
  const s = {file: null, writes: [], reads: 0};
  s.fetchImpl = async (u, init = {}) => {
    u = String(u);
    if (u === PICKS && (init.method ?? 'GET') === 'GET') {
      s.reads++;
      assert.equal(init.headers.apikey, 'sb_secret_test');
      if (failRead) return new Response('{"error":"boom"}', {status:500});
      if (s.file === null) return missing === '404' ? new Response('', {status:404}) : new Response('{"statusCode":"404","error":"not_found","message":"Object not found"}', {status:400});
      return new Response(s.file, {status:200, headers:{'Content-Type':'application/json'}});
    }
    if (u === PICKS && init.method === 'POST') {
      assert.equal(init.headers['x-upsert'], 'true');
      assert.equal(init.headers['Content-Type'], 'application/json');
      if (failWrite) return new Response('{}', {status:500});
      s.file = init.body; s.writes.push(JSON.parse(init.body));
      return new Response('{"Key":"reference-media/picks/dex-picks.json"}', {status:200});
    }
    if (u.includes('/auth/')) return new Response(JSON.stringify(admin), {status:200});
    throw new Error('unexpected fetch ' + u);
  };
  return s;
}
async function call(method, url, {body, headers = {}, fetchImpl, envOverride} = {}) {
  const res = {headers:{}, statusCode:200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b = '') { this.body = b; }};
  const req = {method, url, headers:{host:'admin.example', ...headers}};
  if (body !== undefined) { req.body = body; req.headers['content-type'] ??= 'application/json'; req.headers.origin ??= 'https://admin.example'; }
  await createAdminHandler({fetchImpl, env:envOverride ?? env})(req, res);
  return res;
}
const authed = {cookie};

test('ref-picks requires an admin session', async () => {
  const s = storage();
  assert.equal((await call('GET', '/api/admin?view=ref-picks', {fetchImpl:s.fetchImpl})).statusCode, 401);
  assert.equal((await call('POST', '/api/admin?view=ref-picks', {body:{id:ids[0], value:'use'}, fetchImpl:s.fetchImpl})).statusCode, 401);
  const nonAdmin = async () => new Response(JSON.stringify({...admin, app_metadata:{}}), {status:200});
  assert.equal((await call('GET', '/api/admin?view=ref-picks', {headers:authed, fetchImpl:nonAdmin})).statusCode, 403);
  assert.equal(s.reads + s.writes.length, 0);
});

test('ref-picks rejects bad ids, values and bodies with 400 and never touches Storage', async () => {
  const s = storage();
  const bad = [{id:'not-a-real-effect', value:'use'}, {id:ids[0], value:'maybe'}, {id:'../x', value:'use'}, {id:ids[0]}, {value:'use'}, {id:42, value:'use'},
    {id:ids[0], value:['use']}, [ids[0], 'use'], 'nonsense{', {id:'__proto__', value:'use'}, {id:'constructor', value:'skip'}];
  for (const body of bad) assert.equal((await call('POST', '/api/admin?view=ref-picks', {headers:authed, body, fetchImpl:s.fetchImpl})).statusCode, 400, JSON.stringify(body));
  assert.equal((await call('POST', '/api/admin?view=ref-picks', {headers:{...authed, 'content-type':'text/plain'}, body:'{}', fetchImpl:s.fetchImpl})).statusCode, 400);
  assert.equal((await call('POST', '/api/admin?view=ref-picks', {headers:authed, body:JSON.stringify({id:ids[0], value:'use', pad:'x'.repeat(3000)}), fetchImpl:s.fetchImpl})).statusCode, 400);
  assert.equal(s.reads + s.writes.length, 0);
  // cross-origin POST is refused before anything else
  assert.equal((await call('POST', '/api/admin?view=ref-picks', {headers:{...authed, origin:'https://evil.example'}, body:{id:ids[0], value:'use'}, fetchImpl:s.fetchImpl})).statusCode, 403);
  // other views still refuse POST
  assert.equal((await call('POST', '/api/admin?view=reference-dex', {headers:authed, body:{}, fetchImpl:s.fetchImpl})).statusCode, 405);
  assert.equal(s.reads + s.writes.length, 0);
});

test('ref-picks saves one effect at a time and reads everything back', async () => {
  for (const missing of ['notfound400', '404']) {
    const s = storage({missing});
    const empty = await call('GET', '/api/admin?view=ref-picks', {headers:authed, fetchImpl:s.fetchImpl});
    assert.equal(empty.statusCode, 200);
    assert.match(empty.headers['content-type'], /application\/json/);
    assert.match(empty.headers['cache-control'], /no-store/);
    assert.deepEqual(JSON.parse(empty.body), {rev:0, picks:{}});
    let r = await call('POST', '/api/admin?view=ref-picks', {headers:authed, body:{id:ids[0], value:'use'}, fetchImpl:s.fetchImpl});
    assert.equal(r.statusCode, 200);
    r = await call('POST', '/api/admin?view=ref-picks', {headers:authed, body:JSON.stringify({id:ids[1], value:'skip'}), fetchImpl:s.fetchImpl});
    assert.equal(r.statusCode, 200);
    const body = JSON.parse(r.body);
    assert.equal(body.rev, 2);
    assert.equal(body.picks[ids[0]].v, 'use'); assert.equal(body.picks[ids[1]].v, 'skip');
    await call('POST', '/api/admin?view=ref-picks', {headers:authed, body:{id:ids[0], value:'hold'}, fetchImpl:s.fetchImpl});
    r = await call('POST', '/api/admin?view=ref-picks', {headers:authed, body:{id:ids[1], value:'clear'}, fetchImpl:s.fetchImpl});
    const all = JSON.parse((await call('GET', '/api/admin?view=ref-picks', {headers:authed, fetchImpl:s.fetchImpl})).body);
    assert.equal(all.rev, 4);
    assert.deepEqual(Object.keys(all.picks), [ids[0]]);
    assert.equal(all.picks[ids[0]].v, 'hold');
    assert.ok(!Number.isNaN(Date.parse(all.picks[ids[0]].at)));
    assert.equal(s.writes.length, 4);
    assert.doesNotMatch(r.body, /sb_secret/);
  }
});

test('ref-picks reports Storage failures as 502 and a missing key as 503', async () => {
  for (const opts of [{failRead:true}, {failWrite:true}]) {
    const s = storage(opts);
    assert.equal((await call('POST', '/api/admin?view=ref-picks', {headers:authed, body:{id:ids[0], value:'use'}, fetchImpl:s.fetchImpl})).statusCode, 502, JSON.stringify(opts));
  }
  assert.equal((await call('GET', '/api/admin?view=ref-picks', {headers:authed, fetchImpl:storage({failRead:true}).fetchImpl})).statusCode, 502);
  const corrupt = storage(); corrupt.file = '[1,2]';
  assert.equal((await call('GET', '/api/admin?view=ref-picks', {headers:authed, fetchImpl:corrupt.fetchImpl})).statusCode, 502);
  const {SUPABASE_SECRET_KEY, ...noKey} = env;
  assert.equal((await call('GET', '/api/admin?view=ref-picks', {headers:authed, fetchImpl:storage().fetchImpl, envOverride:noKey})).statusCode, 503);
});

test('effects dex page lists every effect with its fields and only manifest videos', async () => {
  const manifest = JSON.parse(await readFile(new URL('../server/reference-manifest.json', import.meta.url), 'utf8'));
  assert.ok(ids.length >= 100);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of dex.effects) {
    assert.ok(dex.roles.includes(e.role), e.id);
    for (const k of ['fits', 'avoid_when', 'needs_cutout', 'korean_subtitle_ok', 'formats', 'face_safe', 'intensity', 'use_in', 'sources', 'clips']) assert.ok(k in e, e.id + ' ' + k);
    assert.ok([1, 2, 3].includes(e.intensity));
    assert.ok(e.sources.length && e.clips.refs.length, e.id);
    for (const c of [...e.clips.refs, ...(e.clips.ours || [])]) { assert.ok(Object.hasOwn(manifest, c.media), c.media); assert.ok(!('local' in c)); }
  }
  for (const label of ['롱폼 중간에 써도 되는 것', '줌·전환만 보기', '아이콘 설명만 보기', '아직 안 체크', '누끼 필요 제외', '한국어 자막 가능만', '쓸 것', '안 쓸 것', '보류', '제작 예정'])
    assert.ok(page.includes(label), label);
});
