// "My profile": optional, self-reported skin, interests and age band, asked where it helps the person
// (similar-skin reviews, no retyping in review forms). Nothing is inferred from what people write.
import {t} from './i18n.js';
import {esc} from './util.js';
import {chatSecret} from './chat-api.js';
import {AGE_BANDS, CONCERNS, INTERESTS, canShareB2B, gpcOn, getProfile, saveProfile, deleteProfile} from './profile-api.js';
import {SKIN_TYPES, SKIN_TONES, UNDERTONES, CLIMATES} from './community-api.js';

const KEY = 'seoulbeauty-profile-v1';
let storage; try { storage = localStorage; } catch {}
const secret = chatSecret(storage);

// Local copy of the server profile, so forms can prefill without a round trip.
export function cachedProfile() { try { return JSON.parse(storage.getItem(KEY)) || null; } catch { return null; } }
function remember(p) { try { p ? storage.setItem(KEY, JSON.stringify(p)) : storage.removeItem(KEY); } catch {} document.dispatchEvent(new CustomEvent('profile-change')); }
export async function refreshProfile(fetchImpl = fetch) { try { const p = await getProfile(secret, fetchImpl); remember(p && !Array.isArray(p) ? p : null); } catch {} return cachedProfile(); }

// Review-form prefill (keys match the write draft in chat.js).
export function reviewPrefill() {
  const p = cachedProfile(); if (!p) return {};
  return {skinType: p.skin_type ?? '', skinTone: p.skin_tone ?? '', undertone: p.undertone ?? '', climate: p.climate ?? ''};
}
// "Save to my profile" from a review: only the skin fields change; consents stay as they were.
export async function saveFromReview(d) {
  const p = {...(cachedProfile() ?? {}), skin_type: d.skinType || null, skin_tone: d.skinTone || null, undertone: d.undertone || null, climate: d.climate || null};
  remember(await saveProfile(secret, p));
}
// "Do Not Sell or Share My Personal Information".
export async function optOutOfSale() {
  const p = cachedProfile();
  if (p) remember(await saveProfile(secret, {...p, opt_out_sale: true, consent_b2b: false}));
  else try { storage.setItem(KEY + '-optout', '1'); } catch {}
}
const optedOutLocally = () => { try { return storage.getItem(KEY + '-optout') === '1'; } catch { return false; } };

const labelOf = p => [p.skin_type && t('skin.' + p.skin_type), p.skin_tone && t('tone.' + p.skin_tone), p.undertone && t('under.' + p.undertone), p.age_band && t('profile.age.' + p.age_band)].filter(Boolean);
// My activity card: summary when saved, otherwise the reason to fill it in.
export function profileCard() {
  const p = cachedProfile(), facts = p ? labelOf(p) : [];
  return `<button class="profile-card" data-profile-open><span><b>${esc(t('profile.title'))}</b><small>${esc(facts.length ? facts.join(' · ') : t('profile.why'))}</small></span><span aria-hidden="true">›</span></button>`;
}

let draft = null;
const chips = (field, values, prefix, multi = false) => `<div class="chat-chips">${values.map(v => {
  const on = multi ? draft[field].includes(v) : draft[field] === v;
  return `<button type="button" data-profile-field="${field}" data-value="${esc(v)}" data-multi="${multi ? 1 : ''}" aria-pressed="${on}" class="${on ? 'on' : ''}">${esc(t(prefix + v))}</button>`;
}).join('')}</div>`;
function render(dlg) {
  const under13 = draft.age_band === 'under13', b2bOk = canShareB2B({...draft, gpc: gpcOn()});
  dlg.innerHTML = `<form method="dialog"><button class="close-dialog" aria-label="${esc(t('close'))}">×</button></form>
<h2>${esc(t('profile.title'))}</h2><p class="profile-lead">${esc(t('profile.lead'))}</p>
<p class="write-label">${esc(t('profile.ageLabel'))}</p><div class="chat-chips">${['under13', ...AGE_BANDS].map(v => `<button type="button" data-profile-field="age_band" data-value="${v}" aria-pressed="${draft.age_band === v}" class="${draft.age_band === v ? 'on' : ''}">${esc(t('profile.age.' + v))}</button>`).join('')}</div>
${under13 ? `<p class="write-warn">${esc(t('profile.under13'))}</p>` : `
<p class="write-label">${esc(t('review.skin'))}</p>${chips('skin_type', SKIN_TYPES, 'skin.')}
<p class="write-label">${esc(t('review.tone'))}</p>${chips('skin_tone', SKIN_TONES, 'tone.')}
<p class="write-label">${esc(t('review.undertone'))}</p>${chips('undertone', UNDERTONES, 'under.')}
<p class="write-label">${esc(t('review.climate'))}</p>${chips('climate', CLIMATES, 'climate.')}
<p class="write-label">${esc(t('profile.interests'))}</p>${chips('interests', INTERESTS, 'profile.interest.', true)}
<label class="profile-check"><input type="checkbox" data-profile-check="consent_health" ${draft.consent_health ? 'checked' : ''}><span><b>${esc(t('profile.healthConsent'))}</b><small>${esc(t('profile.healthHint'))}</small></span></label>
${draft.consent_health ? chips('concerns', CONCERNS, 'profile.concern.', true) : ''}
<label class="profile-check"><input type="checkbox" data-profile-check="consent_analytics" ${draft.consent_analytics ? 'checked' : ''}><span><b>${esc(t('profile.personalize'))}</b><small>${esc(t('profile.personalizeHint'))}</small></span></label>
<label class="profile-check${b2bOk ? '' : ' off'}"><input type="checkbox" data-profile-check="consent_b2b" ${draft.consent_b2b && b2bOk ? 'checked' : ''} ${b2bOk ? '' : 'disabled'}><span><b>${esc(t('profile.b2b'))}</b><small>${esc(t(gpcOn() ? 'profile.gpc' : draft.opt_out_sale ? 'profile.optedOut' : b2bOk ? 'profile.b2bHint' : 'profile.b2bAge'))}</small></span></label>`}
<p class="profile-note">${esc(t('profile.note'))}</p><p class="profile-status" role="status"></p>
<button class="primary profile-save" data-profile-save ${under13 ? 'disabled' : ''}>${esc(t('profile.save'))}</button>
${cachedProfile() ? `<button class="profile-delete" data-profile-delete>${esc(t('profile.delete'))}</button>` : ''}`;
}
export function openProfile() {
  const p = cachedProfile() ?? {};
  draft = {age_band: p.age_band ?? '', skin_type: p.skin_type ?? '', skin_tone: p.skin_tone ?? '', undertone: p.undertone ?? '', climate: p.climate ?? '',
    interests: p.interests ?? [], concerns: p.concerns ?? [], consent_health: !!p.consent_health, consent_analytics: !!p.consent_analytics,
    consent_b2b: !!p.consent_b2b, opt_out_sale: !!p.opt_out_sale || optedOutLocally()};
  let dlg = document.querySelector('#profile-dialog');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'profile-dialog'; dlg.className = 'chat-dialog profile-dialog'; document.body.append(dlg); }
  render(dlg); dlg.showModal();
}
async function onClick(e) {
  if (e.target.closest('[data-profile-open]')) { openProfile(); return; }
  const dlg = e.target.closest('#profile-dialog'); if (!dlg) return;
  const b = e.target.closest('button'), status = msg => { const s = dlg.querySelector('.profile-status'); if (s) s.textContent = msg; };
  if (b?.dataset.profileField) {
    const f = b.dataset.profileField, v = b.dataset.value;
    if (b.dataset.multi) draft[f] = draft[f].includes(v) ? draft[f].filter(x => x !== v) : [...draft[f], v];
    else draft[f] = draft[f] === v ? '' : v;
    render(dlg);
  } else if (b?.hasAttribute('data-profile-save')) {
    e.preventDefault();
    try { remember(await saveProfile(secret, draft)); dlg.close(); } catch { status(t('profile.failed')); }
  } else if (b?.hasAttribute('data-profile-delete')) {
    e.preventDefault();
    try { await deleteProfile(secret); remember(null); dlg.close(); } catch { status(t('profile.failed')); }
  }
}
document.addEventListener('click', onClick);
document.addEventListener('change', e => {
  const c = e.target.closest('#profile-dialog [data-profile-check]'); if (!c) return;
  draft[c.dataset.profileCheck] = c.checked; render(c.closest('dialog'));
});
