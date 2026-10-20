// Self-reported community profile (US rules; see supabase/migrations/20261019040000_profile_us.sql).
// The server table is private: these RPCs read and write only the profile of the device secret's owner.
import {rpc} from './supabase.js';

export const AGE_BANDS = ['13-15', '16-17', '18-24', '25-34', '35-44', '45-54', '55+'];
export const CONCERNS = ['acne', 'redness', 'dryness', 'pores', 'dark_spots', 'aging', 'sensitivity'];
export const INTERESTS = ['skincare', 'makeup', 'sunscreen', 'acne', 'korea-travel', 'deals'];
const SKIN = ['skin_type', 'skin_tone', 'undertone', 'climate'];

// Browsers send Global Privacy Control as an opt-out of sale/sharing; we honour it on every save.
export const gpcOn = (nav = globalThis.navigator) => nav?.globalPrivacyControl === true;
// B2B sharing is offered only to people 16+ who have not opted out of sale/sharing.
export const canShareB2B = p => !!p.age_band && p.age_band !== '13-15' && !p.opt_out_sale && !p.gpc;

// Normalises a draft into the RPC payload: unknown values dropped, concerns only with health consent.
export function profilePayload(p, nav) {
  const out = {};
  if (AGE_BANDS.includes(p.age_band)) out.age_band = p.age_band;
  for (const k of SKIN) if (p[k]) out[k] = p[k];
  out.interests = (p.interests ?? []).filter(i => INTERESTS.includes(i));
  out.consent_health = !!p.consent_health;
  out.concerns = out.consent_health ? (p.concerns ?? []).filter(c => CONCERNS.includes(c)) : [];
  out.consent_analytics = !!p.consent_analytics;
  out.gpc = gpcOn(nav);
  out.opt_out_sale = !!p.opt_out_sale || out.gpc;
  out.consent_b2b = !!p.consent_b2b && canShareB2B({...out});
  return out;
}

export const getProfile = (secret, fetchImpl = fetch) => rpc('get_profile', {p_secret: secret}, fetchImpl);
export const saveProfile = (secret, p, fetchImpl = fetch, nav) => rpc('set_profile', {p_secret: secret, p_profile: profilePayload(p, nav)}, fetchImpl);
export const deleteProfile = (secret, fetchImpl = fetch) => rpc('delete_profile', {p_secret: secret}, fetchImpl);
