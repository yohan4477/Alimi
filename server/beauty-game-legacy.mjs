import {legacyInviteUrl} from '../web/beauty-play/legacy-destination.js';

// A bounded navigation bridge, never a database/read/write fallback.
// Historical UUIDs remain server-only deployment configuration, not source data.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function legacyInvitationRedirect(env, id) {
  if (env.BEAUTY_GAME_LEGACY_REDIRECT_ENABLED !== 'true') return null;
  const raw = env.BEAUTY_GAME_LEGACY_INVITE_IDS;
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 40000) {
    throw Object.assign(new Error('Legacy invitation configuration unavailable'), {status:503});
  }
  const ids = raw.split(',').map(value => value.trim().toLowerCase());
  if (ids.length > 1000 || ids.some(value => !UUID.test(value)) || new Set(ids).size !== ids.length) {
    throw Object.assign(new Error('Legacy invitation configuration unavailable'), {status:503});
  }
  // Validate the route even for an unknown ID, so bad configuration fails closed.
  let target;
  try {target = legacyInviteUrl(id, env.BEAUTY_GAME_LEGACY_INVITE_PATH);}
  catch {throw Object.assign(new Error('Legacy invitation configuration unavailable'), {status:503});}
  return ids.includes(id) ? target : null;
}
