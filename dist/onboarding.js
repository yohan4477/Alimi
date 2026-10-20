// First-visit guide on the community home: pick Skincare and/or Makeup, then concerns in each, then
// existing public rooms that talk about them. Inline and skippable — it never blocks browsing or joining.
// Choices stay on this device; they are not sent anywhere and never infer skin or demographic facts.
import {t} from './i18n.js';
import {esc} from './util.js';
import {pickCard, concernsOf} from './room-card.js';

export const GROUPS = ['skincare', 'makeup'];
// Stable ids shared with the admin planning preview; only labels are translated.
export const CONCERNS = [
  ...['acne', 'dry', 'sensitive', 'pores', 'spots', 'firmness', 'sebum', 'toneup', 'trouble'].map(id => ({id, group: 'skincare'})),
  ...['lip', 'base', 'cushion', 'longwear', 'shade'].map(id => ({id, group: 'makeup'})),
];
const ROOM_GROUP = {skin: 'skincare', makeup: 'makeup'};
const KEY = 'seoulbeauty-interests-v1';

export function normalize(p) {
  if (!p || p.version !== 1) return null;
  const skincare = p.skincare === true, makeup = p.makeup === true;
  const allowed = new Set(visibleConcerns({skincare, makeup}).map(c => c.id));
  const concerns = CONCERNS.map(c => c.id).filter(id => allowed.has(id) && Array.isArray(p.concerns) && p.concerns.includes(id));
  return {version: 1, skincare, makeup, concerns, done: p.done === true, ...(p.ageRange ? {ageRange: ['<18','18–24','25–34','35–44','45+'].includes(p.ageRange) ? p.ageRange : null} : {}), ...(p.skinType ? {skinType: ['dry','oily','combination','normal'].includes(p.skinType) ? p.skinType : null} : {})};
}
export function readInterests(storage = deviceStorage()) {
  try { return normalize(JSON.parse(storage?.getItem(KEY))); } catch { return null; }
}
export function saveInterests(p, storage = deviceStorage()) {
  try { storage.setItem(KEY, JSON.stringify(normalize(p))); return true; } catch { return false; }
}
function deviceStorage() { try { return globalThis.localStorage; } catch { return undefined; } }

// Room creation needs the user_rooms migration; its room list carries `concerns`, older servers do not.
export const canCreateRooms = rooms => rooms.some(r => Array.isArray(r.concerns));
export const visibleConcerns = sel => CONCERNS.filter(c => sel?.[c.group]);

// Rooms matching more chosen concerns first, then the chosen field, then recent activity.
// Nothing chosen (or skipped) falls back to the busiest topics, marked as popular rather than matched.
export function recommendRooms(rooms, sel, limit = 3) {
  const topics = rooms.filter(r => r.kind !== 'brand');
  const active = r => Math.min(r.messages_24h || 0, 50);
  const byActivity = (a, b) => active(b.room) - active(a.room) || a.room.sort - b.room.sort;
  const chosen = sel ? visibleConcerns(sel).map(c => c.id).filter(id => sel.concerns?.includes(id)) : [];
  const picked = sel ? topics.flatMap(room => {
    const group = ROOM_GROUP[room.tag];
    if (group && !sel[group]) return [];
    const tags = concernsOf(room);
    const matched = chosen.filter(id => tags.includes(id));
    if (!matched.length && !group) return [];
    return [{room, matched, score: matched.length * 4 + (group ? 2 : 0) + (sel.skincare && ((sel.skinType === 'dry' && tags.includes('dry')) || (sel.skinType === 'oily' && tags.includes('sebum'))) ? 1 : 0)}];
  }).sort((a, b) => b.score - a.score || byActivity(a, b)) : [];
  if (picked.length) return picked.slice(0, limit).map(({room, matched}) => ({room, matched}));
  return topics.map(room => ({room, matched: [], popular: true})).sort(byActivity).slice(0, limit);
}

// ---- Full-screen first-visit flow (journey 1): splash → interests (2/3) → matching rooms (3/3) → the room ----
let flow = null;
const icon = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  skincare: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/></svg>',
  makeup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21V11l3-8 3 8v10z"/><path d="M9 14h6"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19 14 10"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>',
};
const FILTERS = ['rec', 'skincare', 'makeup', 'all'];
const logoBar = () => `<div class="ob-bar"><button type="button" class="ob-back" data-onb="back" aria-label="${esc(t('back'))}">${icon.back}</button><img class="ob-logo-small" src="assets/seoul-beauty-logo.webp" alt="Seoul Beauty" width="200" height="60"></div>`;
const stepBar = n => `<div class="ob-step" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow="${n}" aria-label="${esc(t('onb.step', {n}))}"><span><i style="width:${n * 100 / 3}%"></i></span><small>${n}/3</small></div>`;

// opts: step ('splash' | 'choose'), load() → {rooms, pictures: Map}, onRoom(room), onClose()
export function openOnboarding(opts) {
  const saved = readInterests();
  flow = {...opts, step: opts.step ?? 'splash', filter: 'rec', rooms: [], pictures: new Map(),
    draft: saved ? {...saved, concerns: [...saved.concerns]} : {version: 1, skincare: false, makeup: false, concerns: [], done: false}};
  const box = document.getElementById('onboarding');
  box.hidden = false; document.body.classList.add('onboarding-open');
  Promise.resolve(opts.load?.()).then(d => { if (flow && d) { flow.rooms = d.rooms ?? []; flow.pictures = d.pictures ?? new Map(); if (flow.step === 'rooms') drawFlow(); } }, () => {});
  drawFlow();
  if (flow.step === 'splash' && !new URLSearchParams(location.search).has('holdSplash')) setTimeout(() => { if (flow?.step === 'splash') { flow.step = 'choose'; drawFlow(); } }, 1800);
}
export const onboardingOpen = () => Boolean(flow);
function closeFlow(room) {
  const f = flow; if (!f) return;
  saveInterests({...f.draft, done: true});
  flow = null;
  const box = document.getElementById('onboarding'); box.hidden = true; box.innerHTML = ''; document.body.classList.remove('onboarding-open');
  f.onClose?.(); if (room) f.onRoom?.(room);
}
function filtered() {
  const {rooms, draft, filter} = flow, topics = rooms.filter(r => r.kind !== 'brand');
  const inGroup = g => r => (r.tag === (g === 'skincare' ? 'skin' : 'makeup')) || concernsOf(r).some(c => CONCERNS.find(x => x.id === c)?.group === g);
  if (filter === 'rec') return recommendRooms(rooms, draft, 6).map(x => x.room);
  if (filter === 'all') return topics;
  return topics.filter(inGroup(filter));
}
function drawFlow() {
  const box = document.getElementById('onboarding'); if (!flow || !box) return;
  const {step, draft} = flow;
  if (step === 'splash') {
    box.innerHTML = `<div class="ob-splash" data-onb="splash" role="button" tabindex="0" aria-label="${esc(t('onb.next'))}"><p class="ob-line1">${esc(t('splash.line1'))}</p><p class="ob-line2">${esc(t('splash.line2'))}</p><img class="ob-logo" src="assets/seoul-beauty-logo.webp" alt="Seoul Beauty" width="300" height="90"><img class="ob-photo" src="assets/splash-photo.webp" alt="" width="776" height="1085"></div>`;
    return;
  }
  if (step === 'choose') {
    const concerns = visibleConcerns(draft), field = draft.skincare || draft.makeup;
    box.innerHTML = `<div class="ob-screen">${logoBar()}<div class="ob-scroll"><h1 id="onb-title" tabindex="-1">${esc(t('onb.q0'))}</h1><p class="ob-sub">${esc(t('onb.s0'))}</p><h2>${esc(t('onb.fields'))}</h2><div class="ob-fields">${GROUPS.map(g => `<button type="button" data-onb-group="${g}" aria-pressed="${draft[g]}" class="${draft[g] ? 'on' : ''}">${draft[g] ? icon.check : ''}${icon[g]}<span>${esc(t('onb.g.' + g))}</span></button>`).join('')}</div><h2>${esc(t('onb.keywords'))}</h2>${concerns.length ? `<div class="ob-keywords">${concerns.map(c => { const on = draft.concerns.includes(c.id); return `<button type="button" data-onb-concern="${c.id}" aria-pressed="${on}" class="${on ? 'on' : ''}">${on ? icon.check : ''}<span>${esc(t('onb.c.' + c.id))}</span></button>`; }).join('')}</div>` : `<p class="ob-hint">${esc(t('onb.pickField'))}</p>`}</div><div class="ob-foot"><button type="button" class="ob-next" data-onb="next">${esc(field ? t('onb.next') : t('onb.browse'))}</button>${stepBar(1)}</div></div>`;
    return;
  }
  if (step === 'profile') {
    const choices = (key, values, current, label) => `<div class="ob-keywords ob-profile-choices" role="group" aria-label="${esc(t(key === 'ageRange' ? 'onb.age' : 'onb.skin'))}">${values.map(v => `<button type="button" data-onb-profile="${key}" data-onb-value="${esc(v)}" aria-pressed="${v === (current || '')}" class="${v === (current || '') ? 'on' : ''}">${esc(label(v))}</button>`).join('')}</div>`;
    box.innerHTML = `<div class="ob-screen">${logoBar()}<div class="ob-scroll"><h1 id="onb-title" tabindex="-1">${esc(t('onb.optional'))}</h1><p class="ob-sub">${esc(t('onb.private'))}</p><h2>${esc(t('onb.age'))}</h2>${choices('ageRange',['<18','18–24','25–34','35–44','45+'],draft.ageRange,v=>v)}${draft.skincare ? `<h2>${esc(t('onb.skin'))}</h2>${choices('skinType',['dry','oily','combination','normal',''],draft.skinType,v=>v ? t('onb.skin.'+v) : t('onb.unknown'))}` : ''}</div><div class="ob-foot"><button class="ob-next" data-onb="profile-next">${esc(t('onb.next'))}</button>${stepBar(2)}</div></div>`;
    return;
  }
  const chosen = visibleConcerns(draft).map(c => c.id).filter(id => draft.concerns.includes(id));
  const list = filtered();
  box.innerHTML = `<div class="ob-screen">${logoBar()}<div class="ob-scroll"><h1 id="onb-title" tabindex="-1">${esc(t('onb.q1'))}</h1><p class="ob-sub">${esc(t('onb.s1'))}</p><div class="ob-filters">${FILTERS.map(f => `<button type="button" data-onb-filter="${f}" aria-pressed="${flow.filter === f}" class="${flow.filter === f ? 'on' : ''}">${f === 'skincare' ? icon.leaf : f === 'makeup' ? icon.makeup : f === 'all' ? icon.grid : ''}<span>${esc(t('onb.filter.' + f))}</span></button>`).join('')}</div><div class="ob-rooms">${list.map(r => pickCard(r, {image: flow.pictures.get(r.id), highlight: chosen, attrs: `data-onb-room="${esc(r.id)}"`})).join('')}${!flow.rooms.length ? `<p class="ob-hint">${esc(t('loading'))}</p>` : ''}</div></div><div class="ob-foot"><button class="text-link" data-onb="create">+ ${esc(t('room.new'))}</button>${stepBar(3)}</div></div>`;
}
globalThis.document?.addEventListener('click', e => {
  if (!flow) return;
  const b = e.target.closest('[data-onb],[data-onb-group],[data-onb-concern],[data-onb-filter],[data-onb-room],[data-onb-profile]');
  if (!b || !document.getElementById('onboarding')?.contains(b)) return;
  const a = b.dataset.onb, d = flow.draft;
  if (a === 'splash') flow.step = 'choose';
  else if (a === 'back') { if (flow.step === 'rooms') flow.step = 'profile'; else if (flow.step === 'profile') flow.step = 'choose'; else { closeFlow(null); return; } }
  else if (a === 'next') { if (!d.skincare && !d.makeup) { closeFlow(null); return; } flow.step = 'profile'; }
  else if (a === 'profile-next') flow.step = 'rooms';
  else if (a === 'create') { closeFlow(null); document.dispatchEvent(new CustomEvent('seoulbeauty-create-room')); return; }
  else if (b.dataset.onbProfile) d[b.dataset.onbProfile] = b.dataset.onbValue || null;
  else if (b.dataset.onbGroup) { const g = b.dataset.onbGroup; d[g] = !d[g]; flow.draft = normalize(d); }
  else if (b.dataset.onbConcern) { const id = b.dataset.onbConcern; d.concerns = d.concerns.includes(id) ? d.concerns.filter(c => c !== id) : [...d.concerns, id]; }
  else if (b.dataset.onbFilter) flow.filter = b.dataset.onbFilter;
  else if (b.dataset.onbRoom) { closeFlow(flow.rooms.find(r => r.id === b.dataset.onbRoom)); return; }
  drawFlow();
  const sel = b.dataset.onbProfile ? `[data-onb-profile="${b.dataset.onbProfile}"][data-onb-value="${b.dataset.onbValue}"]` : b.dataset.onbGroup ? `[data-onb-group="${b.dataset.onbGroup}"]` : b.dataset.onbConcern ? `[data-onb-concern="${b.dataset.onbConcern}"]` : b.dataset.onbFilter ? `[data-onb-filter="${b.dataset.onbFilter}"]` : '#onb-title';
  document.querySelector('#onboarding ' + sel)?.focus?.();
});
globalThis.document?.addEventListener('keydown', e => { if (flow?.step === 'splash' && (e.key === 'Enter' || e.key === ' ')) { flow.step = 'choose'; drawFlow(); } });
