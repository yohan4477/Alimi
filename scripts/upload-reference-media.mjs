// Upload the reference videos listed in server/reference-manifest.json to the private Storage bucket `reference-media`.
// Creates the bucket (private) when missing; upserts files. Reads the key from the environment only and never prints it.
//   SUPABASE_SECRET_KEY=... node scripts/upload-reference-media.mjs [youtube-research-dir] [--dry-run] [--only=dex/]
// --only=<prefix> uploads only manifest entries whose bucket path starts with the prefix (e.g. the new 효과 도감 clips).
// The bucket also accepts application/json for picks/dex-picks.json (효과 도감 체크, written by /api/admin?view=ref-picks).
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
const args = process.argv.slice(2), dry = args.includes('--dry-run');
const only = (args.find(a => a.startsWith('--only=')) ?? '').slice('--only='.length);
const research = path.resolve(args.find(a => !a.startsWith('--')) ?? 'C:/Users/y/youtube/research');
const base = (process.env.SUPABASE_URL || 'https://mqsnshnlfwsgabrsmqsz.supabase.co').replace(/\/$/, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const manifest = JSON.parse(await readFile(new URL('../server/reference-manifest.json', import.meta.url), 'utf8'));
const entries = Object.values(manifest).filter(e => e.path.startsWith(only));
let total = 0;
for (const e of entries) total += (await stat(path.join(research, e.source))).size;
console.log(`${entries.length} files, ${total} bytes`);
if (dry) process.exit(0);
if (!key) { console.error('Missing env SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).'); process.exit(2); }
const headers = {apikey: key};
if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
const bucket = await fetch(`${base}/storage/v1/bucket`, {method: 'POST', headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify({id: 'reference-media', name: 'reference-media', public: false, file_size_limit: 20 * 1024 * 1024, allowed_mime_types: ['video/mp4', 'application/json']})});
if (!bucket.ok && ![400, 409].includes(bucket.status)) { console.error('bucket create failed', bucket.status); process.exit(1); }
console.log('bucket', bucket.ok ? 'created' : 'exists (status ' + bucket.status + ')');
if (!bucket.ok) {
  // keep the bucket private; allow the picks JSON next to the videos
  const upd = await fetch(`${base}/storage/v1/bucket/reference-media`, {method: 'PUT', headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify({public: false, file_size_limit: 20 * 1024 * 1024, allowed_mime_types: ['video/mp4', 'application/json']})});
  if (!upd.ok) { console.error('bucket update failed', upd.status); process.exit(1); }
  console.log('bucket updated (private, mp4 + json)');
}
let done = 0, bytes = 0;
for (const e of entries) {
  const data = await readFile(path.join(research, e.source));
  const r = await fetch(`${base}/storage/v1/object/reference-media/${e.path.split('/').map(encodeURIComponent).join('/')}`, {method: 'POST', headers: {...headers, 'Content-Type': 'video/mp4', 'x-upsert': 'true'}, body: data});
  if (!r.ok) { console.error('upload failed', e.path, r.status); process.exit(1); }
  done++; bytes += data.length;
}
console.log(`uploaded ${done} files, ${bytes} bytes`);
