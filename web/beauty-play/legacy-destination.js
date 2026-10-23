// Public destination constraints only. The historical invitation allowlist is server-only.
const ORIGIN = 'https://seoulbeauty-muse-play.yohan4477.chatgpt.site';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function legacyInviteUrl(id, path) {
  // Require an operator-verified route; there is deliberately no default pathname.
  if (typeof id !== 'string' || !UUID.test(id) || typeof path !== 'string' || path.length > 128 ||
      !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(path)) throw Error('Invalid legacy destination');
  const target = new URL(path, ORIGIN);
  target.searchParams.set('invite', id.toLowerCase());
  return target.href;
}

export function verifiedLegacyInviteUrl(value, id) {
  if (typeof value !== 'string') throw Error('Invalid legacy destination');
  const target = new URL(value);
  const expected = legacyInviteUrl(id, target.pathname);
  if (value !== expected) throw Error('Invalid legacy destination');
  return expected;
}
