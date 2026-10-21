// First-visit guide on the community home: pick Skincare and/or Makeup, then concerns in each, then
// existing public rooms that talk about them. Inline and skippable — it never blocks browsing or joining.
// Choices stay on this device; they are not sent anywhere and never infer skin or demographic facts.
import {t} from './i18n.js';
import {esc} from './util.js';
import {brandSeed,saveOpinion,readOpinion} from './opinions.js';
import {concernsOf} from './room-card.js';

export const GROUPS = ['skincare', 'makeup'];
export const AGE_RANGES = ['<15','15–19','20–24','25–29','30–34','35–39','40–44','45–49','50–54','55+'];
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
  return {version: 1, skincare, makeup, concerns, done: p.done === true, ...(p.ageRange ? {ageRange: [...AGE_RANGES, '<18','18–24','25–34','35–44','45+'].includes(p.ageRange) ? p.ageRange : null} : {}), ...(p.skinType ? {skinType: ['dry','oily','combination','normal'].includes(p.skinType) ? p.skinType : null} : {})};
}
export function readInterests(storage = deviceStorage()) {
  try { return normalize(JSON.parse(storage?.getItem(KEY))); } catch { return null; }
}
export function saveInterests(p, storage = deviceStorage()) {
  try { storage.setItem(KEY, JSON.stringify(normalize(p))); globalThis.document?.dispatchEvent(new CustomEvent('interests-change')); return true; } catch { return false; }
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
const logoBar = () => `<div class="ob-bar"><button type="button" class="ob-back" data-onb="back" aria-label="${esc(t('back'))}">${icon.back}</button><img class="ob-logo-small" src="assets/seoul-beauty-logo.webp" alt="Seoul Beauty" width="200" height="60"></div>`;
const stepBar = n => `<div class="ob-step" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow="${n}" aria-label="${esc(t('onb.step', {n}))}"><span><i style="width:${n * 100 / 3}%"></i></span><small>${n}/3</small></div>`;

// opts: step ('splash' | 'choose'), load() → {rooms, pictures: Map}, onRoom(room), onClose()
export function openOnboarding(opts) {
  const saved = readInterests();
  flow = {...opts, products: [], step: opts.step ?? 'splash', filter: 'rec', rooms: [], pictures: new Map(),
    draft: saved ? {...saved, concerns: [...saved.concerns]} : {version: 1, skincare: false, makeup: false, concerns: [], done: false}};
  const box = document.getElementById('onboarding');
  box.hidden = false; document.body.classList.add('onboarding-open');
  drawFlow();
  const current = flow;
  opts.load?.().then(data=>{if(flow===current){flow.products=data.products??[];if(flow.step==='products')drawFlow();}},()=>{});
  if (flow.step === 'splash' && !new URLSearchParams(location.search).has('holdSplash')) setTimeout(() => { if (flow?.step === 'splash') { flow.step = 'brands'; drawFlow(); } }, 1800);
}
export const onboardingOpen = () => Boolean(flow);
function closeFlow(target) {
  const f = flow; if (!f) return;
  if (!target?.cancelled) saveInterests({...f.draft, done: true});
  flow = null;
  const box = document.getElementById('onboarding'); box.hidden = true; box.innerHTML = ''; document.body.classList.remove('onboarding-open');
  f.onClose?.(target);
}
function drawFlow() {
  const box = document.getElementById('onboarding'); if (!flow || !box) return;
  const {step, draft} = flow;
  if (step === 'splash') {
    box.innerHTML = `<div class="ob-splash" data-onb="splash" role="button" tabindex="0" aria-label="${esc(t('onb.next'))}"><p class="ob-line1">${esc(t('splash.line1'))}</p><p class="ob-line2">${esc(t('splash.line2'))}</p><img class="ob-logo" src="assets/seoul-beauty-logo.webp" alt="Seoul Beauty" width="300" height="90"><img class="ob-photo" src="assets/splash-photo.webp" alt="" width="776" height="1085"></div>`;
    return;
  }
  if (step === 'brands') {
    const brand = brandSeed[flow.brandIndex ?? 0];
    const introLimit = Math.min(5,brandSeed.length);
    const choice = readOpinion('brand:'+brand)?.choice;
    const labels = {tried_liked:'I use it and like it',tried_disliked:'I tried it, not for me',want_to_try:'I know it / curious',not_familiar:'Never heard of it'};
    box.innerHTML = `<div class="ob-screen">${logoBar()}<div class="ob-scroll"><h1 id="onb-title" tabindex="-1">Have you heard of ${esc(brand)}?</h1><p class="ob-sub">Tell us what you think. Your answer stays on this device for now.</p><div class="ob-keywords">${Object.entries(labels).map(([key,label])=>`<button type="button" data-onb-opinion="${key}" aria-pressed="${choice===key}" class="${choice===key?'on':''}">${esc(label)}</button>`).join('')}</div><p class="ob-hint">${(flow.brandIndex??0)+1} / ${introLimit} · No community results yet</p></div><div class="ob-foot"><button type="button" class="ob-next" data-onb="brand-next">Next →</button><button type="button" class="text-btn" data-onb="brand-skip">Skip</button></div></div>`;
    return;
  }
  if (step === 'choose') {
    const concerns = visibleConcerns(draft), field = draft.skincare || draft.makeup;
    box.innerHTML = `<div class="ob-screen">${logoBar()}<div class="ob-scroll"><h1 id="onb-title" tabindex="-1">${esc(t('onb.q0'))}</h1><p class="ob-sub">${esc(t('onb.s0'))}</p><h2>${esc(t('onb.fields'))}</h2><div class="ob-fields">${GROUPS.map(g => `<button type="button" data-onb-group="${g}" aria-pressed="${draft[g]}" class="${draft[g] ? 'on' : ''}">${draft[g] ? icon.check : ''}${icon[g]}<span>${esc(t('onb.g.' + g))}</span></button>`).join('')}</div><h2>${esc(t('onb.keywords'))}</h2>${concerns.length ? `<div class="ob-keywords">${concerns.map(c => { const on = draft.concerns.includes(c.id); return `<button type="button" data-onb-concern="${c.id}" aria-pressed="${on}" class="${on ? 'on' : ''}">${on ? icon.check : ''}<span>${esc(t('onb.c.' + c.id))}</span></button>`; }).join('')}</div>` : `<p class="ob-hint">${esc(t('onb.pickField'))}</p>`}</div><div class="ob-foot"><button type="button" class="ob-next" data-onb="next">${esc(field ? t('onb.next') : t('onb.browse'))}</button>${stepBar(1)}</div></div>`;
    return;
  }
  if (step === 'products') {
    box.innerHTML = `<div class="ob-screen">${logoBar()}<div class="ob-scroll"><h1 id="onb-title" tabindex="-1">${esc(t('onb.products'))}</h1><p class="ob-sub">${esc(t('onb.productsHint'))}</p><div class="onb-product-list">${flow.products.map(g=>`<button type="button" class="product-room-row" data-onb-product="${esc(g.name)}"><span><b>${esc(g.name)}</b><small>${esc(t('rooms.productCount',{n:g.rooms.length}))}</small></span><i aria-hidden="true">›</i></button>`).join('')}</div><button class="text-btn" data-onb="topics">${esc(t('home.topics'))}</button></div><div class="ob-foot"><button class="ob-next" data-onb="products-browse">${esc(t('rooms.byProduct'))}</button>${stepBar(3)}</div></div>`;
    return;
  }
  if (step === 'profile') {
    const choices = (key, values, current, label) => `<div class="ob-keywords ob-profile-choices" role="group" aria-label="${esc(t(key === 'ageRange' ? 'onb.age' : 'onb.skin'))}">${values.map(v => `<button type="button" data-onb-profile="${key}" data-onb-value="${esc(v)}" aria-pressed="${v === (current || '')}" class="${v === (current || '') ? 'on' : ''}">${esc(label(v))}</button>`).join('')}</div>`;
    box.innerHTML = `<div class="ob-screen">${logoBar()}<div class="ob-scroll"><h1 id="onb-title" tabindex="-1">${esc(t('onb.optional'))}</h1><p class="ob-sub">${esc(t('onb.private'))}</p><h2>${esc(t('onb.age'))}</h2>${choices('ageRange',AGE_RANGES,draft.ageRange,v=>v === '<15' ? t('onb.age.under15') : v)}${draft.skincare ? `<h2>${esc(t('onb.skin'))}</h2>${choices('skinType',['dry','oily','combination','normal',''],draft.skinType,v=>v ? t('onb.skin.'+v) : t('onb.unknown'))}` : ''}</div><div class="ob-foot"><button class="ob-next" data-onb="profile-next">${esc(t(flow.returnToChat ? 'onb.save' : 'onb.next'))}</button>${stepBar(2)}</div></div>`;
    return;
  }
}
globalThis.document?.addEventListener('click', e => {
  if (!flow) return;
  const b = e.target.closest('[data-onb],[data-onb-group],[data-onb-concern],[data-onb-profile],[data-onb-product],[data-onb-opinion]');
  if (!b || !document.getElementById('onboarding')?.contains(b)) return;
  const a = b.dataset.onb, d = flow.draft;
  if (a === 'splash') flow.step = 'brands';
  else if (b.dataset.onbOpinion) {saveOpinion('brand:'+brandSeed[flow.brandIndex??0],b.dataset.onbOpinion);}
  else if (a === 'brand-next') {flow.brandIndex=(flow.brandIndex??0)+1;if(flow.brandIndex>=Math.min(5,brandSeed.length))flow.step='choose';}
  else if (a === 'brand-skip') flow.step='choose';
  else if (a === 'back') { if (flow.step === 'products') flow.step = 'profile'; else if (flow.step === 'profile') flow.step = 'choose'; else if (flow.step === 'brands') { closeFlow({cancelled:true}); return; } else { closeFlow({cancelled:true}); return; } }
  else if (a === 'next') { flow.step = !d.skincare && !d.makeup && !flow.returnToChat ? 'products' : 'profile'; }
  else if (a === 'profile-next') { if(flow.returnToChat){closeFlow(null);return;} flow.step = 'products'; }
  else if (b.dataset.onbProduct) { closeFlow({productQuery:b.dataset.onbProduct}); return; }
  else if (a === 'products-browse') { closeFlow({productQuery:''}); return; }
  else if (a === 'topics') { closeFlow(null); return; }
  else if (a === 'create') { closeFlow(null); document.dispatchEvent(new CustomEvent('seoulbeauty-create-room')); return; }
  else if (b.dataset.onbProfile) d[b.dataset.onbProfile] = b.dataset.onbValue || null;
  else if (b.dataset.onbGroup) { const g = b.dataset.onbGroup; d[g] = !d[g]; flow.draft = normalize(d); }
  else if (b.dataset.onbConcern) { const id = b.dataset.onbConcern; d.concerns = d.concerns.includes(id) ? d.concerns.filter(c => c !== id) : [...d.concerns, id]; }

  drawFlow();
  const sel = b.dataset.onbProfile ? `[data-onb-profile="${b.dataset.onbProfile}"][data-onb-value="${b.dataset.onbValue}"]` : b.dataset.onbGroup ? `[data-onb-group="${b.dataset.onbGroup}"]` : b.dataset.onbConcern ? `[data-onb-concern="${b.dataset.onbConcern}"]` : '#onb-title';
  document.querySelector('#onboarding ' + sel)?.focus?.();
});
globalThis.document?.addEventListener('keydown', e => { if (flow?.step === 'splash' && (e.key === 'Enter' || e.key === ' ')) { flow.step = 'brands'; drawFlow(); } });

