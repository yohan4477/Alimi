// 탐색 tab (journey 2 · 대화 탐색): 주제별 / 제품별 / 브랜드별 / 전체 above the search box.
// Rooms, member counts and today's message counts are the fetched ones; nothing is invented or rounded up.
import {t} from './i18n.js';
import {esc} from './util.js';
import {roomTitle, roomIntro} from './chat-api.js';
import {roomThumb, roomCategory} from './room-card.js';
import {productRoomGroups} from './room-search.js';
import {loadingMarkup} from './loading-companion.js';
import {exploreData, relTime} from './chat.js';

export const EXPLORE_TABS = ['topic', 'product', 'brand', 'all'];
const CATS = ['skin', 'makeup', 'sun', 'etc'];
let tab = 'topic', cat = null, psort = 'pop', last = null, seq = 0;
const clock = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg>';

const catIcon = {
  skin: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>',
  makeup: '<path d="M9 21V11l3-8 3 8v10z"/><path d="M9 14h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  etc: '<rect x="4" y="4" width="7" height="7" rx="3.5"/><rect x="13" y="4" width="7" height="7" rx="3.5"/><rect x="4" y="13" width="7" height="7" rx="3.5"/><rect x="13" y="13" width="7" height="7" rx="3.5"/>'
};
const people = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.2a3 3 0 0 1 0 5.6M18 14.2a5 5 0 0 1 2.5 4.8"/></svg>';

const isSun = r => roomCategory(r) === '선케어' || /선크림|선케어|자외선|sunscreen|\bsun\b|spf/i.test(`${r.title_ko ?? ''} ${r.title_en ?? ''}`);
export function roomField(r) {
  if (isSun(r)) return 'sun';
  return r.tag === 'skin' ? 'skin' : r.tag === 'makeup' ? 'makeup' : 'etc';
}
const busiest = rooms => [...rooms].sort((a, b) => (b.messages_24h ?? 0) - (a.messages_24h ?? 0) || (a.sort ?? 0) - (b.sort ?? 0));

export const exploreRow = (r, image, attr = 'data-open-room') => `<button class="explore-row" ${attr}="${esc(r.id)}">${roomThumb(r, image)}<span class="explore-text"><span class="explore-title"><b>${esc(roomTitle(r))}</b>${r.messages_24h > 0 ? `<span class="explore-badge" aria-label="${esc(t('room.newToday', {n: r.messages_24h}))}">${r.messages_24h}</span>` : ''}</span>${roomIntro(r) ? `<small>${esc(roomIntro(r))}</small>` : ''}<span class="explore-meta"><span>${people}${esc(t('room.joined', {n: r.members ?? 0}))}</span>${r.last_message_at ? `<span>${clock}${esc(relTime(r.last_message_at))}</span>` : ''}</span></span></button>`;
const rows = (list, images) => list.length ? list.map(r => exploreRow(r, images.get(r.id))).join('') : `<p class="empty">${esc(t('explore.empty'))}</p>`;
const head = key => `<h2 class="explore-head-title">${esc(t(key))}</h2>`;

function tabsMarkup() {
  return `<div class="explore-tabs" role="tablist" aria-label="${esc(t('nav.explore'))}">${EXPLORE_TABS.map(k => `<button role="tab" id="explore-tab-${k}" data-explore-tab="${k}" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}">${esc(t('explore.tab.' + k))}</button>`).join('')}</div>`;
}
function panel({rooms, images, popular}, brands) {
  const talk = rooms.filter(r => r.kind !== 'brand');
  if (tab === 'topic') {
    const list = busiest(cat ? talk.filter(r => roomField(r) === cat) : talk);
    return `<div class="explore-cats">${CATS.map(c => `<button data-explore-cat="${c}" aria-pressed="${cat === c}" class="${cat === c ? 'on' : ''}"><span class="explore-cat-ico ec-${c}"><svg viewBox="0 0 24 24" aria-hidden="true">${catIcon[c]}</svg></span>${esc(t('explore.cat.' + c))}</button>`).join('')}</div>${head('explore.popular')}${rows(list, images)}`;
  }
  if (tab === 'product') {
    // 2-2: 인기순 = members, 최신순 = latest message, 댓글순 = messages today; all summed over the product's rooms.
    const sum = (g, f) => g.rooms.reduce((n, r) => n + (f(r) ?? 0), 0), latest = g => g.rooms.map(r => r.last_message_at ?? '').sort().at(-1) ?? '';
    const groups = productRoomGroups(talk, popular).sort(psort === 'new' ? (a, b) => latest(b).localeCompare(latest(a)) : psort === 'cmt' ? (a, b) => sum(b, r => r.messages_24h) - sum(a, r => r.messages_24h) : (a, b) => sum(b, r => r.members) - sum(a, r => r.members));
    return `<div class="explore-sorts" role="group" aria-label="${esc(t('explore.productRooms'))}">${['pop', 'new', 'cmt'].map(k => `<button data-explore-sort="${k}" aria-pressed="${psort === k}" class="${psort === k ? 'on' : ''}">${esc(t('explore.sort.' + k))}</button>`).join('')}</div>${head('explore.productRooms')}${groups.length ? groups.map(g => `<button class="explore-row" ${g.rooms.length === 1 ? `data-open-room="${esc(g.rooms[0].id)}"` : `data-product-rooms="${esc(g.name)}"`}>${g.image_url ? `<span class="room-thumb"><img src="${esc(g.image_url)}" alt="" loading="lazy"></span>` : roomThumb(g.rooms[0])}<span class="explore-text"><span class="explore-title"><b>${esc(g.name)}</b></span><small>${esc(roomTitle(g.rooms[0]))}</small><span class="explore-meta">${people}${esc(t('rooms.productCount', {n: g.rooms.length}))}</span></span></button>`).join('') : `<p class="empty">${esc(t('rooms.noProductRooms'))}</p>`}`;
  }
  if (tab === 'brand') {
    const brandRooms = busiest(rooms.filter(r => r.kind === 'brand'));
    return `${brandRooms.length ? head('explore.brands') + rows(brandRooms, images) : ''}<section class="explore-brand-grid">${head('brands.title')}${brands()}</section>`;
  }
  return `${head('explore.allRooms')}${rows(busiest(talk), images)}`;
}

// box: #search-results while the search box is empty. brands(): the brand grid markup from app.js.
export async function renderExplore(box, brands = () => '') {
  last = {box, brands};
  const mine = ++seq;
  box.innerHTML = tabsMarkup() + `<div id="explore-panel" role="tabpanel" aria-labelledby="explore-tab-${tab}">${loadingMarkup(t('loading'))}</div><button class="explore-link" data-screen="home">${esc(t('explore.catalog'))} ›</button>`;
  let data;
  try { data = await exploreData(); } catch { data = null; }
  const target = box.querySelector('#explore-panel');
  if (mine !== seq || !target) return;
  target.innerHTML = data ? panel(data, brands) : `<p class="empty">${esc(t('home.retry'))}</p>`;
}
export const refreshExplore = () => { if (last?.box.isConnected && last.box.querySelector('#explore-panel')) renderExplore(last.box, last.brands); };

document.addEventListener('click', e => {
  const b = e.target.closest('[data-explore-tab],[data-explore-cat],[data-explore-sort]'); if (!b || !last) return;
  if (b.dataset.exploreSort) { psort = b.dataset.exploreSort; renderExplore(last.box, last.brands); }
  else if (b.dataset.exploreTab) { tab = b.dataset.exploreTab; renderExplore(last.box, last.brands).then(() => last.box.querySelector(`#explore-tab-${tab}`)?.focus()); }
  else { cat = cat === b.dataset.exploreCat ? null : b.dataset.exploreCat; renderExplore(last.box, last.brands); }
});

// 2-3 search: rooms whose title or intro holds every word, topic and brand rooms alike.
export async function searchRooms(query) {
  const words = String(query).normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return {rooms: [], images: new Map()};
  const {rooms, images} = await exploreData();
  const text = r => [r.title_ko, r.title_en, r.intro_ko, r.intro_en, r.brand].join(' ').normalize('NFKC').toLocaleLowerCase();
  return {rooms: busiest(rooms.filter(r => words.every(w => text(r).includes(w)))), images};
}
