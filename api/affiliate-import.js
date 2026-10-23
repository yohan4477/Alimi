import {NETWORKS, databaseConfig, normalizeTransaction, persistTransaction, requestBody, verifySignature} from '../server/affiliate-attribution.js';

// Internal importer only. An approved provider adapter must normalize and sign its reports.
export function createAffiliateImportHandler({env = process.env, fetchImpl = fetch, now = () => Date.now()} = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Robots-Tag','noindex');
    res.setHeader('Content-Type','application/json');
    const reply = (status, state) => { res.statusCode = status; res.end(JSON.stringify({state})); };
    if (req.method !== 'POST') { res.setHeader('Allow','POST'); return reply(405,'method_not_allowed'); }
    const enabled = (env.AFFILIATE_IMPORT_NETWORKS ?? '').split(',').map(s => s.trim()).filter(n => NETWORKS.includes(n));
    const secret = env.AFFILIATE_IMPORT_SECRET;
    if (!enabled.length || typeof secret !== 'string' || secret.length < 32 || !databaseConfig(env)) return reply(503,'unconfigured');
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type'] ?? '')) return reply(415,'unsupported_media_type');
    let raw;
    try { raw = await requestBody(req); } catch { return reply(400,'invalid_body'); }
    let transaction;
    try { transaction = normalizeTransaction(JSON.parse(raw.toString('utf8')), now()); } catch { return reply(400,'invalid_transaction'); }
    // Sign the normalized fixed-field JSON, not transport bytes: Vercel may parse req.body.
    if (!verifySignature(JSON.stringify(transaction), req.headers?.['x-affiliate-timestamp'], req.headers?.['x-affiliate-signature'], secret, now())) return reply(401,'unauthorized');
    if (!enabled.includes(transaction.network)) return reply(403,'network_disabled');
    try { return reply(200, await persistTransaction(transaction, {env, fetchImpl})); }
    catch (error) { return reply(error.status === 409 ? 409 : 503, error.status === 409 ? 'revision_conflict' : 'storage_unavailable'); }
  };
}
export default createAffiliateImportHandler();
