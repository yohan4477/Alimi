import {roomRpcAllowed} from './room-feature-release.js';
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
// Keep the HTTP status separately from PostgREST's domain message. Callers may
// translate chat:... without losing whether the server definitely rejected a write.
export class RpcError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'RpcError';
    this.status = status;
    if (typeof code === 'string') this.code = code;
  }
}
export async function rpc(name, body, fetchImpl = fetch) {
  if(!roomRpcAllowed(name))throw Error('chat:unavailable');
  const res = await fetchImpl(SUPABASE_URL + '/rest/v1/rpc/' + name, {method: 'POST', headers: writeHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT)});
  if (!res.ok) {
    let message = 'HTTP ' + res.status, code;
    try {
      const error = await res.json();
      if (typeof error?.message === 'string' && error.message) message = error.message;
      code = error?.code;
    } catch {}
    throw new RpcError(message, res.status, code);
  }
  return res.status === 204 ? null : res.json();
}

