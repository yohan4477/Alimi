// Server-only normalized report contract. This is NOT a native network webhook adapter.
import {createHmac, timingSafeEqual} from 'node:crypto';

export const NETWORKS = ['awin', 'rakuten', 'coupang'];
export const MAX_BODY_BYTES = 8192;
const fields = ['network','transaction_id','revision','status','currency','sale_minor','commission_minor','source_ref','occurred_at'];
const token = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
export function normalizeTransaction(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k)) || fields.some(k => !Object.hasOwn(value, k))) throw Error('invalid transaction');
  const {network, transaction_id, revision, status, currency, sale_minor, commission_minor, source_ref, occurred_at} = value;
  if (!NETWORKS.includes(network) || !token.test(transaction_id ?? '') || typeof transaction_id !== 'string' || !Number.isSafeInteger(revision) || revision < 1 || revision > 2147483647) throw Error('invalid identity');
  if (!['pending','approved','declined','reversed'].includes(status) || !['KRW','USD','EUR','GBP','JPY','CAD','AUD'].includes(currency)) throw Error('invalid status or currency');
  for (const amount of [sale_minor, commission_minor]) if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000_000) throw Error('invalid amount');
  // Only existing public content references, never account/device IDs, names or free text.
  if (source_ref !== null && (typeof source_ref !== 'string' || !/^(post|comment|chat)-[1-9][0-9]{0,18}$/.test(source_ref))) throw Error('invalid source');
  if (typeof occurred_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(occurred_at) || !Number.isFinite(Date.parse(occurred_at)) || Date.parse(occurred_at) > now + 300000) throw Error('invalid timestamp');
  return {network, transaction_id, revision, status, currency, sale_minor, commission_minor, source_ref, occurred_at: new Date(occurred_at).toISOString()};
}

export function verifySignature(raw, timestamp, signature, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300000 || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(timestamp + '.').update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export async function requestBody(req) {
  let body;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) body = Buffer.from(req.body);
  else if (req.body && typeof req.body === 'object') body = Buffer.from(JSON.stringify(req.body));
  else {
    if (req.body != null) throw Error('invalid body');
    const chunks = []; let size = 0;
    for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > MAX_BODY_BYTES) throw Error('body too large'); chunks.push(bytes); }
    body = Buffer.concat(chunks);
  }
  if (!body.length || body.length > MAX_BODY_BYTES) throw Error('invalid body size');
  return body;
}

export function databaseConfig(env) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SECRET_KEY;
  if (!key || !url) return null;
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname) || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) return null; } catch { return null; }
  const headers = {apikey: key, 'Content-Type':'application/json'};
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  return {url: url.replace(/\/$/, ''), headers};
}

export async function persistTransaction(transaction, {env = process.env, fetchImpl = fetch} = {}) {
  const config = databaseConfig(env);
  if (!config) throw Error('not configured');
  const response = await fetchImpl(config.url + '/rest/v1/rpc/ingest_affiliate_transaction', {
    method:'POST', headers:config.headers, body:JSON.stringify({p_transaction:transaction}),
    cache:'no-store', redirect:'error', signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) { const error = Error('storage unavailable'); error.status = response.status === 409 ? 409 : 503; throw error; }
  const result = await response.json();
  if (!['accepted','duplicate'].includes(result)) throw Error('invalid storage result');
  return result;
}
