// Where this visit came from, kept for the tab so every event of the visit carries it.
// Only a short slug is stored (utm_source, ref, or the referring site's host), never a full URL.
const slug = value => String(value || '').toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || null;
export function entrySource({search = '', referrer = '', host = '', storage} = {}) {
  const params = new URLSearchParams(search);
  let entry = slug(params.get('utm_source') || params.get('ref'));
  if (!entry) { try { const from = new URL(referrer); if (from.hostname !== host) entry = slug(from.hostname); } catch {} }
  try { if (entry) storage?.setItem('sb-entry', entry); else entry = storage?.getItem('sb-entry') || null; } catch {}
  return entry || 'direct';
}
