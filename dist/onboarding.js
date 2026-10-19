// First-visit guide on the community home: pick Skincare and/or Makeup, then concerns in each, then
// existing public rooms that talk about them. Inline and skippable — it never blocks browsing or joining.
// Choices stay on this device; they are not sent anywhere and never infer skin or demographic facts.
import {t} from './i18n.js';
import {esc} from './util.js';
import {roomTitle, roomIntro} from './chat-api.js';

export const GROUPS = ['skincare', 'makeup'];
// Stable ids shared with the admin planning preview; only labels are translated.
export const CONCERNS = [
  {id: 'acne', group: 'skincare'}, {id: 'sensitive', group: 'skincare'}, {id: 'dry', group: 'skincare'}, {id: 'pores', group: 'skincare'},
  {id: 'cushion', group: 'makeup'}, {id: 'lip', group: 'makeup'}, {id: 'longwear', group: 'makeup'}, {id: 'shade', group: 'makeup'},
];
// Seed rooms have no concern tags yet; a room's own `concerns` column, when present, replaces this.
const ROOM_CONCERNS = {
  acne: ['acne', 'pores'], 'dry-sensitive': ['sensitive', 'dry'], routine: ['pores', 'dry'],
  makeup: ['cushion', 'lip', 'longwear', 'shade'],
};
const ROOM_GROUP = {skin: 'skincare', makeup: 'makeup'};
const KEY = 'seoulbeauty-interests-v1';

export function normalize(p) {
  if (!p || p.version !== 1) return null;
  const skincare = p.skincare === true, makeup = p.makeup === true;
  const allowed = new Set(visibleConcerns({skincare, makeup}).map(c => c.id));
  const concerns = CONCERNS.map(c => c.id).filter(id => allowed.has(id) && Array.isArray(p.concerns) && p.concerns.includes(id));
  return {version: 1, skincare, makeup, concerns, done: p.done === true};
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
    const tags = Array.isArray(room.concerns) ? room.concerns : ROOM_CONCERNS[room.id] ?? [];
    const matched = chosen.filter(id => tags.includes(id));
    if (!matched.length && !group) return [];
    return [{room, matched, score: matched.length * 2 + (group ? 1 : 0)}];
  }).sort((a, b) => b.score - a.score || byActivity(a, b)) : [];
  if (picked.length) return picked.slice(0, limit).map(({room, matched}) => ({room, matched}));
  return topics.map(room => ({room, matched: [], popular: true})).sort(byActivity).slice(0, limit);
}

// ---- Inline card ----
let step = 0, draft = null, editing = false;
export const editInterests = () => { editing = true; step = 0; draft = null; };
export const needsGuide = () => editing || !readInterests()?.done;

const guide = '<img class="onboard-guide" src="assets/hanbok-guide-pixel.svg" alt="" width="60" height="60">';
const chip = (attr, id, on, label) => `<button type="button" ${attr}="${esc(id)}" aria-pressed="${on}" class="${on ? 'on' : ''}">${esc(label)}</button>`;
const recRow = ({room, matched, popular}) => `<button class="conversation-row onboard-rec" data-chat-room="${esc(room.id)}"><span><b>${esc(roomTitle(room))}</b><p>${esc(roomIntro(room))}</p><small>${esc(matched.length ? t('onb.matched', {list: matched.map(id => t('onb.c.' + id)).join(', ')}) : popular ? t('onb.popular') : t('onb.field'))}${room.messages_24h > 0 ? ' · ' + esc(t('home.messages', {n: room.messages_24h})) : ''}</small></span><i>›</i></button>`;

export function renderGuide(box, rooms) {
  const saved = readInterests();
  if (!draft) draft = saved ? {...saved, concerns: [...saved.concerns]} : {version: 1, skincare: false, makeup: false, concerns: [], done: false};
  if (!needsGuide()) {
    // Done: show what matched, with a way back to edit. Skipped entirely: stay out of the way.
    if (!saved.skincare && !saved.makeup) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="onboard-head"><h2 class="chat-section">${esc(t('onb.forYou'))}</h2><button type="button" class="text-btn" data-onb="edit">${esc(t('onb.edit'))}</button></div>${recommendRooms(rooms, saved).map(recRow).join('')}`;
    return;
  }
  const field = draft.skincare || draft.makeup;
  let inner, actions;
  if (step === 0) {
    inner = `<div class="onboard-chips" role="group" aria-label="${esc(t('onb.q0'))}">${GROUPS.map(g => chip('data-onb-group', g, draft[g], t('onb.g.' + g))).join('')}</div>`;
    actions = `<button type="button" class="onboard-next" data-onb="next">${esc(field ? t('onb.next') : t('onb.browse'))}</button>`;
  } else if (step === 1) {
    inner = GROUPS.filter(g => draft[g]).map(g => `<h3 class="onboard-group">${esc(t('onb.g.' + g))}</h3><div class="onboard-chips" role="group" aria-label="${esc(t('onb.g.' + g))}">${CONCERNS.filter(c => c.group === g).map(c => chip('data-onb-concern', c.id, draft.concerns.includes(c.id), t('onb.c.' + c.id))).join('')}</div>`).join('');
    actions = `<button type="button" class="text-btn" data-onb="back">${esc(t('back'))}</button><button type="button" class="onboard-next" data-onb="next">${esc(t('onb.show'))}</button>`;
  } else {
    inner = recommendRooms(rooms, draft).map(recRow).join('');
    actions = `<button type="button" class="text-btn" data-onb="back">${esc(t('back'))}</button><button type="button" class="onboard-next" data-onb="finish">${esc(t('onb.browseAll'))}</button>${canCreateRooms(rooms) ? `<button type="button" class="text-btn onboard-create" data-chat-action="create-room">+ ${esc(t('room.new'))}</button>` : ''}`;
  }
  box.innerHTML = `<div class="onboard-card" aria-labelledby="onb-title">${guide}<div class="onboard-body"><small class="onboard-step">${esc(t('onb.step', {n: step + 1}))}</small><h2 id="onb-title" tabindex="-1">${esc(t('onb.q' + step))}</h2><p>${esc(t('onb.s' + step))}</p></div></div>${inner}<div class="onboard-actions">${actions}${step < 2 ? `<button type="button" class="text-btn onboard-skip" data-onb="skip">${esc(t('onb.skip'))}</button>` : ''}</div>`;
}

function finish(box, rooms, value) {
  saveInterests({...value, done: true});
  editing = false; step = 0; draft = null;
  renderGuide(box, rooms);
}

// Returns true when the click belonged to the guide.
export function handleGuideClick(b, box, rooms) {
  if (!box?.contains(b)) return false;
  const a = b.dataset.onb;
  if (b.dataset.onbGroup) { const g = b.dataset.onbGroup; draft[g] = !draft[g]; draft = normalize(draft); }
  else if (b.dataset.onbConcern) { const id = b.dataset.onbConcern; draft.concerns = draft.concerns.includes(id) ? draft.concerns.filter(c => c !== id) : [...draft.concerns, id]; }
  else if (a === 'next') { if (step === 0 && !draft.skincare && !draft.makeup) { finish(box, rooms, draft); return true; } step++; }
  else if (a === 'back') step = Math.max(0, step - 1);
  else if (a === 'skip') { finish(box, rooms, step === 0 ? {version: 1, skincare: false, makeup: false, concerns: []} : draft); return true; }
  else if (a === 'finish') { finish(box, rooms, draft); return true; }
  else if (a === 'edit') { editInterests(); }
  // Leaving the guide for a room (or to create one) keeps what was chosen so far.
  else if ((b.dataset.chatRoom || b.dataset.chatAction === 'create-room') && needsGuide()) { finish(box, rooms, draft); return false; }
  else return false;
  renderGuide(box, rooms);
  box.querySelector(b.dataset.onbGroup ? `[data-onb-group="${b.dataset.onbGroup}"]` : b.dataset.onbConcern ? `[data-onb-concern="${b.dataset.onbConcern}"]` : '#onb-title, .onboard-head button')?.focus?.();
  return true;
}
