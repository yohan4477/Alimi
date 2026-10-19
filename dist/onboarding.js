// First-visit guide on the community home: pick Skincare and/or Makeup, then concerns in each, then
// existing public rooms that talk about them. Inline and skippable — it never blocks browsing or joining.
// Choices stay on this device; they are not sent anywhere and never infer skin or demographic facts.
import {t} from './i18n.js';
import {esc} from './util.js';
import {roomListCard} from './room-card.js';

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

// ---- Inline guide (journey reference: choose → matching rooms → room) ----
let step = 0, draft = null, editing = false, images = new Map();
export const editInterests = () => { editing = true; step = 0; draft = null; };
export const needsGuide = () => editing || !readInterests()?.done;

const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
const chip = (attr, id, on, label) => `<button type="button" ${attr}="${esc(id)}" aria-pressed="${on}" class="${on ? 'on' : ''}">${on ? check : ''}${esc(label)}</button>`;
const recCard = ({room, matched, popular}) => roomListCard(room, {image: images.get(room.id), highlight: matched,
  note: matched.length ? t('onb.matched', {list: matched.map(id => t('onb.c.' + id)).join(', ')}) : popular ? t('onb.popular') : ''});
const progress = n => `<div class="onboard-progress" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow="${n}" aria-label="${esc(t('onb.step', {n}))}"><span style="width:${n * 100 / 3}%"></span></div><small class="onboard-count">${n}/3</small>`;

export function renderGuide(box, rooms, roomPictures = images) {
  images = roomPictures;
  const saved = readInterests();
  if (!draft) draft = saved ? {...saved, concerns: [...saved.concerns]} : {version: 1, skincare: false, makeup: false, concerns: [], done: false};
  if (!needsGuide()) {
    // Done: show what matched, with a way back to edit. Skipped entirely: stay out of the way.
    if (!saved.skincare && !saved.makeup) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="onboard-head"><h2 class="chat-section">${esc(t('onb.forYou'))}</h2><button type="button" class="text-btn" data-onb="edit">${esc(t('onb.edit'))}</button></div>${recommendRooms(rooms, saved).map(recCard).join('')}`;
    return;
  }
  const field = draft.skincare || draft.makeup;
  let inner, actions;
  if (step === 0) {
    const concerns = visibleConcerns(draft);
    inner = `<h3 class="onboard-label">${esc(t('onb.fields'))}</h3><div class="onboard-chips onboard-fields" role="group" aria-label="${esc(t('onb.fields'))}">${GROUPS.map(g => chip('data-onb-group', g, draft[g], t('onb.g.' + g))).join('')}</div><h3 class="onboard-label">${esc(t('onb.keywords'))}</h3>${concerns.length ? `<div class="onboard-chips" role="group" aria-label="${esc(t('onb.keywords'))}">${concerns.map(c => chip('data-onb-concern', c.id, draft.concerns.includes(c.id), t('onb.c.' + c.id))).join('')}</div>` : `<p class="onboard-hint">${esc(t('onb.pickField'))}</p>`}`;
    actions = `<button type="button" class="onboard-next" data-onb="next">${esc(field ? t('onb.next') : t('onb.browse'))}</button><button type="button" class="text-btn onboard-skip" data-onb="skip">${esc(t('onb.skip'))}</button>`;
  } else {
    inner = `<div class="onboard-recs">${recommendRooms(rooms, draft).map(recCard).join('')}</div>`;
    actions = `<button type="button" class="onboard-next" data-onb="finish">${esc(t('onb.browseAll'))}</button><button type="button" class="text-btn" data-onb="back">${esc(t('back'))}</button>${canCreateRooms(rooms) ? `<button type="button" class="text-btn onboard-create" data-chat-action="create-room">+ ${esc(t('room.new'))}</button>` : ''}`;
  }
  // First step opens with the brand visual (journey reference screen 1); later steps stay compact.
  const hero = step === 0 ? `<img class="onboard-hero" src="assets/onboarding-hero.webp" alt="${esc(t('onb.heroAlt'))}" width="753" height="460">` : '';
  box.innerHTML = `<div class="onboard-panel${step === 0 ? ' with-hero' : ''}" aria-labelledby="onb-title">${hero}<div class="onboard-top"><div class="onboard-body"><h2 id="onb-title" tabindex="-1">${esc(t('onb.q' + step))}</h2><p>${esc(t('onb.s' + step))}</p></div><img class="onboard-guide" src="assets/hanbok-guide-pixel.svg" alt="" width="44" height="44"></div>${inner}<div class="onboard-actions">${actions}</div>${progress(step + 1)}</div>`;
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
  else if (a === 'next') { if (!draft.skincare && !draft.makeup) { finish(box, rooms, draft); return true; } step = 1; }
  else if (a === 'back') step = 0;
  else if (a === 'skip') { finish(box, rooms, {version: 1, skincare: false, makeup: false, concerns: []}); return true; }
  else if (a === 'finish') { finish(box, rooms, draft); return true; }
  else if (a === 'edit') { editInterests(); }
  // Leaving the guide for a room (or to create one) keeps what was chosen so far.
  else if ((b.dataset.chatRoom || b.dataset.chatAction === 'create-room') && needsGuide()) { finish(box, rooms, draft); return false; }
  else return false;
  renderGuide(box, rooms);
  box.querySelector(b.dataset.onbGroup ? `[data-onb-group="${b.dataset.onbGroup}"]` : b.dataset.onbConcern ? `[data-onb-concern="${b.dataset.onbConcern}"]` : '#onb-title, .onboard-head button')?.focus?.();
  return true;
}
