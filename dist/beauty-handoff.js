// Same-tab, same-origin draft transfer. No personal text in URLs or analytics.
export const HANDOFF_KEY = 'seoulbeauty-game-draft-v1';
export const HANDOFF_TTL = 24 * 60 * 60 * 1000;
export function handoffStorage() { try { return globalThis.sessionStorage; } catch { return null; } }
const randomId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id ?? '');
export function readHandoff(storage, {id, region, now = Date.now()} = {}) {
  try {
    const d = JSON.parse(storage.getItem(HANDOFF_KEY) || 'null');
    if (!d || !validId(d.id) || !['kr','us'].includes(d.region) || !['ko','en'].includes(d.language) || typeof d.body !== 'string' || !d.body.trim() || d.body.length > 2000 || !Number.isFinite(d.createdAt) || d.createdAt > now || now - d.createdAt >= HANDOFF_TTL) {
      storage.removeItem(HANDOFF_KEY); return null;
    }
    if ((id && d.id !== id) || (region && d.region !== region)) return null;
    // Explicitly allowlist fields: game notes, inferred profiles and account IDs never pass through.
    return {id:d.id, region:d.region, language:d.language, body:d.body, createdAt:d.createdAt, ...(typeof d.title==='string'&&d.title.length<=120?{title:d.title}:{})};
  } catch { return null; }
}
export function writeHandoff(storage, {body, language, region, now = Date.now(), id = randomId()}) {
  if (!validId(id) || !['kr','us'].includes(region) || !['ko','en'].includes(language) || typeof body !== 'string' || !body.trim() || body.length > 2000) throw Error('Invalid draft');
  const draft = {id, body:body.trim(), language, region, createdAt:now};
  storage.setItem(HANDOFF_KEY, JSON.stringify(draft));
  if (!readHandoff(storage, {id, region, now})) throw Error('Draft unavailable');
  return `/${region}?lang=${language}&beautyDraft=${id}&demo=0`;
}
export function updateHandoff(storage, id, body, title = '') {
  const d = readHandoff(storage, {id});
  if (!d || typeof body !== 'string' || body.length > 2000 || typeof title !== 'string' || title.length > 120) return false;
  if(!body.trim()){clearHandoff(storage,id);return true;}
  try { storage.setItem(HANDOFF_KEY, JSON.stringify({...d,body,title})); return true; } catch { return false; }
}
export function clearHandoff(storage, id) {
  try { if (!id || readHandoff(storage, {id})) storage.removeItem(HANDOFF_KEY); } catch {}
}
