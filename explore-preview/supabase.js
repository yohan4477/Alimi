// Supabase connection shared by every web module. The publishable key is designed to ship in clients;
// row-level security limits it to public reads and the RPCs that validate writes.
export const SUPABASE_URL = 'https://mqsnshnlfwsgabrsmqsz.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CJjQ-l5ev-D4OH0Na0gFoQ_szunygff';

const TIMEOUT = 10000;
const readHeaders = {apikey: SUPABASE_PUBLISHABLE_KEY};
const writeHeaders = {apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json'};

// GET a full REST URL and return the JSON body; throws "HTTP <status>" otherwise.
export async function restGet(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, {headers: readHeaders, signal: AbortSignal.timeout(TIMEOUT)});
  if (!res.ok) throw Error('HTTP ' + res.status);
  return res.json();
}
// POST to an RPC. Server errors keep PostgREST's message (e.g. "chat:link") so callers can map them.
export async function rpc(name, body, fetchImpl = fetch) {
  const res = await fetchImpl(SUPABASE_URL + '/rest/v1/rpc/' + name, {method: 'POST', headers: writeHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT)});
  if (!res.ok) { let msg = 'HTTP ' + res.status; try { msg = (await res.json()).message ?? msg; } catch {} throw Error(msg); }
  return res.status === 204 ? null : res.json();
}
