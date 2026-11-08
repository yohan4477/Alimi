import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAdminHandler} from '../api/admin.js';
import {SESSION_COOKIE} from '../server/admin-auth.js';

const token = 'header.signed.token';
const admin = {id:'user-1',email_confirmed_at:'2026-10-19T00:00:00Z',is_anonymous:false,app_metadata:{seoulbeauty_admin:true}};
const ok = () => new Response(JSON.stringify(admin), {status:200,headers:{'Content-Type':'application/json'}});
const cookie = {cookie:`${SESSION_COOKIE}=${token}`};
async function get(url, {headers = {}, fetchImpl = ok, env = {}} = {}) {
  const res = {headers:{}, statusCode:200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b = '') { this.body = b; }};
  await createAdminHandler({fetchImpl, env:{NODE_ENV:'test', ADMIN_ORIGIN:'https://admin.example', ...env}})({method:'GET', url, headers}, res);
  return res;
}
const manifest = JSON.parse(await readFile(new URL('../server/reference-manifest.json', import.meta.url), 'utf8'));
const mediaNames = Object.keys(manifest);

test('reference media requires an admin and only signs manifest files from the private bucket', async () => {
  const name = mediaNames[0];
  const calls = [];
  const fetchImpl = async (u, init) => {
    if (String(u).includes('/storage/v1/object/sign/')) { calls.push({u: String(u), init}); return new Response(JSON.stringify({signedURL: '/object/sign/reference-media/' + manifest[name].path + '?token=t'}), {status:200}); }
    return ok();
  };
  const env = {SUPABASE_SECRET_KEY: 'sb_secret_test'};
  assert.equal((await get('/api/admin?view=ref-media&f=' + name, {fetchImpl, env})).statusCode, 401);
  const nonAdmin = async () => new Response(JSON.stringify({...admin, app_metadata:{}}), {status:200});
  assert.equal((await get('/api/admin?view=ref-media&f=' + name, {headers:cookie, fetchImpl:nonAdmin, env})).statusCode, 403);
  assert.equal(calls.length, 0);
  const r = await get('/api/admin?view=ref-media&f=' + encodeURIComponent(name), {headers:cookie, fetchImpl, env});
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['content-type'], /application\/json/);
  assert.match(r.headers['cache-control'], /no-store/);
  const body = JSON.parse(r.body);
  assert.match(body.url, /^https:\/\/mqsnshnlfwsgabrsmqsz\.supabase\.co\/storage\/v1\/object\/sign\/reference-media\/(gallery|musk)\//);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].init.body).expiresIn, 600);
  assert.equal(calls[0].init.headers.apikey, 'sb_secret_test');
  assert.doesNotMatch(r.body, /sb_secret/);
  for (const bad of ['', '../admin.js', '..%2Fadmin-page.html', '..%5Cadmin.js', '%2e%2e%2fpackage.json', 'missing.mp4', name + '.txt', '/etc/passwd', 'a/' + name, name + '%00.mp4', '.mp4', 'constructor', '__proto__'])
    assert.equal((await get('/api/admin?view=ref-media&f=' + bad, {headers:cookie, fetchImpl, env})).statusCode, 404, bad);
  assert.equal(calls.length, 1);
  assert.equal((await get('/api/admin?view=ref-media&f=' + name, {headers:cookie})).statusCode, 503);
  const down = async u => String(u).includes('/storage/') ? new Response('{}', {status:500}) : ok();
  assert.equal((await get('/api/admin?view=ref-media&f=' + name, {headers:cookie, fetchImpl:down, env})).statusCode, 502);
});

test('reference pages are authenticated, under the Vercel response limit and use only blob videos', async () => {
  for (const view of ['reference-gallery', 'reference-musk', 'reference-dex']) {
    assert.equal((await get('/api/admin?view=' + view)).statusCode, 401);
    const r = await get('/api/admin?view=' + view, {headers:cookie});
    assert.equal(r.statusCode, 200);
    assert.ok(Buffer.byteLength(r.body) < 4_500_000, view + ' size');
    const csp = r.headers['content-security-policy'];
    assert.match(csp, /script-src 'sha256-/); assert.match(csp, /media-src blob:/); assert.match(csp, /connect-src 'self' https:\/\/mqsnshnlfwsgabrsmqsz\.supabase\.co/);
    assert.match(csp, /img-src data:/); assert.match(csp, /frame-ancestors 'self'/);
    assert.doesNotMatch(r.body, /\/_blob\/|atob\(/);
    for (const [,script] of r.body.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(script));
    // every referenced video exists in the whitelist directory
    // (the effects dex keeps its video names in the embedded JSON as "media")
    const refs = new Set([...r.body.matchAll(view === 'reference-dex' ? /"media":"([A-Za-z0-9_.-]+\.mp4)"/g : /view=ref-media&f=([A-Za-z0-9_.-]+\.mp4)/g)].map(m => m[1]));
    assert.ok(refs.size >= 8, view);
    for (const f of refs) assert.ok(mediaNames.includes(f), f);
  }
  // other planning views keep their stricter CSP
  const lib = await get('/api/admin?view=ui-library', {headers:cookie});
  assert.doesNotMatch(lib.headers['content-security-policy'], /media-src|connect-src/);
});
