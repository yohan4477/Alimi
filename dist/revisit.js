// Journey 3 (재방문 → 저장 → 공유): welcome back with joined rooms, 알림 from real events, share hub, recently viewed.
// Same rules as ios/Alimi/Revisit.swift: counts come from fetched messages / posts; "new" only after this device looked.
import {inMarket} from './region.js';
import {t, locale} from './i18n.js';
import {esc} from './util.js';
import {chatSecret, fetchRooms, fetchMyRooms, fetchMessages, roomTitle, roomIntro, readBlocked} from './chat-api.js';
import {fetchProductTalk} from './community-api.js';
import {roomListCard} from './room-card.js';
import {share, shareUrl} from './share.js';

let storage; try { storage = localStorage; } catch {}
const SEEN_KEY = 'seoulbeauty-seen-v1', ALERTS_KEY = 'seoulbeauty-alerts-opened', RECENT_KEY = 'seoulbeauty-recent-v1';
const readJSON = (k, d) => { try { return JSON.parse(storage.getItem(k)) ?? d; } catch { return d; } };

// ---- Recently viewed products (this device) ----
const allRecent = () => { const v=readJSON(RECENT_KEY,[]); return Array.isArray(v)?v:[]; };
export const readRecent = () => allRecent().filter(p=>inMarket(p));
export function addRecent(f) {
  if (!f?.family_key) return;
  const keep = ({family_key, brand, brand_ko, base_name, name, category, image_url, min_price_minor, sku, retailer, market, ref}) => ({sku, retailer, market, ref, family_key, brand, brand_ko, base_name: base_name ?? name, category, image_url, min_price_minor});
  try { storage.setItem(RECENT_KEY, JSON.stringify([keep(f), ...allRecent().filter(x => !(x.family_key === f.family_key && x.market === f.market))].slice(0, 20))); } catch {}
}

// ---- Joined rooms and alerts ----
async function myTag() {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chatSecret(storage)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
export const lastOpenedAlerts = () => Number(readJSON(ALERTS_KEY, 0)) || 0;
export const markAlertsOpened = () => { try { storage.setItem(ALERTS_KEY, String(Date.now())); } catch {} };

// savedFamilies: [{familyKey, name}] of products saved on this device.
export async function loadRevisit({savedFamilies = []} = {}) {
  const rooms = await fetchRooms(), tag = await myTag(), seen = readJSON(SEEN_KEY, {}), blocked = readBlocked(storage);
  const mine = await fetchMyRooms(tag).catch(() => []);
  const activity = [], alerts = [];
  for (const j of mine) {
    const room = rooms.find(r => r.id === j.room_id); if (!room) continue;
    const msgs = (await fetchMessages(room.id).catch(() => [])).filter(m => !blocked.includes(m.author_tag));
    const others = msgs.filter(m => m.author_tag !== tag);
    const fresh = seen[room.id] ? others.filter(m => m.created_at > seen[room.id]) : [];
    const pictures = [...msgs].reverse().map(m => m.item?.image_url).filter(Boolean);
    activity.push({room, last: msgs.at(-1) ?? null, newCount: fresh.length, likes: msgs.reduce((n, m) => n + (m.likes || 0), 0), pictures});
    if (fresh.length) alerts.push({id: 'room-' + room.id, kind: 'room', icon: 'bubble', title: t('alert.newMessages', {room: roomTitle(room), n: fresh.length}), body: fresh.at(-1).body, at: fresh.at(-1).created_at, room});
    const mineIds = new Set(msgs.filter(m => m.author_tag === tag).map(m => m.id));
    const replies = others.filter(m => m.reply_to && mineIds.has(m.reply_to));
    if (replies.length) {
      const names = [...new Set(replies.map(m => m.nickname))], first = replies.at(-1);
      const who = names.length > 1 ? t('alert.whoMany', {name: first.nickname, n: names.length - 1}) : first.nickname;
      alerts.push({id: 'reply-' + room.id, kind: 'room', icon: 'reply', title: t('alert.replies', {who}), body: t('alert.repliesBody', {room: roomTitle(room), n: replies.length}), at: first.created_at, room});
    }
  }
  const weekAgo = Date.now() - 7 * 86400000;
  for (const s of savedFamilies.slice(0, 3)) {
    const talk = await fetchProductTalk(s.familyKey).catch(() => null); if (!talk) continue;
    const recent = [...talk.reviews, ...talk.posts].filter(p => Date.parse(p.created_at) > weekAgo).sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (recent.length) alerts.push({id: 'product-' + s.familyKey, kind: 'product', icon: 'link', title: t('alert.savedTalk'), body: t('alert.savedTalkBody', {name: s.name, n: recent.length}), at: recent[0].created_at, family: s.familyKey});
  }
  alerts.sort((a, b) => b.at.localeCompare(a.at));
  return {rooms, activity, alerts};
}
export const unreadCount = alerts => alerts.filter(a => Date.parse(a.at) > lastOpenedAlerts()).length;

// ---- Rendering ----
const svg = {
  bubble: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v11H11l-4 3v-3H5z"/><circle cx="9" cy="10.5" r=".6"/><circle cx="12" cy="10.5" r=".6"/><circle cx="15" cy="10.5" r=".6"/></svg>',
  reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 8 5 12l5 4"/><path d="M5 12h9a5 5 0 0 1 5 5v1"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
  invite: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
};
export const ago = iso => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000), rtf = new Intl.RelativeTimeFormat(locale(), {numeric: 'auto'});
  return s < 3600 ? rtf.format(-Math.round(s / 60), 'minute') : s < 86400 ? rtf.format(-Math.round(s / 3600), 'hour') : rtf.format(-Math.round(s / 86400), 'day');
};
export function joinedCard(a, fallback) {
  return roomListCard(a.room, {image: a.pictures?.[0] || fallback, note: a.last?.body || roomIntro(a.room), fresh: a.newCount > 0, attrs: `data-chat-room="${esc(a.room.id)}" data-live="1" data-my-room`});
}

// 대화방 tab: welcome back and my rooms, then every room.
export async function renderMyRooms(box, {pictures = new Map(), savedFamilies = []} = {}) {
  box.innerHTML = `<div class="logo-head actions-only"><button class="icon-btn" data-screen="search" aria-label="${esc(t('search.title'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button></div><p class="home-note">${esc(t('loading'))}</p>`;
  let data; try { data = await loadRevisit({savedFamilies}); } catch { if (box.isConnected) box.querySelector('.home-note').textContent = t('home.retry'); return; }
  if (!box.isConnected) return;
  const topics = data.rooms.filter(r => r.kind !== 'brand').sort((a, b) => a.sort - b.sort);
  box.querySelector('.home-note').outerHTML = `${data.activity.length ? `<h2 class="chat-section">${esc(t('rooms.mine'))}</h2>${data.activity.map(a => joinedCard(a, pictures.get(a.room.id))).join('')}` : ''}<h2 class="chat-section">${esc(t('home.topics'))}</h2>${topics.map(r => roomListCard(r, {image: pictures.get(r.id), note: roomIntro(r)})).join('')}`;
}

// 알림
let alertFilter = 'all', lastAlerts = [];
export async function renderAlerts(box, {savedFamilies = [], returnScreen = 'saved'} = {}) {
  box.innerHTML = `<div class="page-bar"><button class="icon-btn" data-screen="${esc(returnScreen)}" aria-label="${esc(t('back'))}">‹</button><h1 class="page-title">${esc(t('alerts.title'))}</h1></div><div class="alert-filters" role="tablist">${['all', 'room', 'product', 'service'].map(f => `<button role="tab" data-alert-filter="${f}" aria-selected="${alertFilter === f}" class="${alertFilter === f ? 'on' : ''}">${esc(t('alerts.filter.' + f))}</button>`).join('')}</div><div id="alert-list"><p class="home-note">${esc(t('loading'))}</p></div>`;
  try { lastAlerts = (await loadRevisit({savedFamilies})).alerts; } catch { lastAlerts = []; }
  markAlertsOpened();
  drawAlerts();
}
function drawAlerts() {
  const list = document.getElementById('alert-list'); if (!list) return;
  const shown = alertFilter === 'all' ? lastAlerts : lastAlerts.filter(a => a.kind === alertFilter);
  list.innerHTML = shown.length ? shown.map(a => `<button class="alert-row alert-${a.kind}" ${a.room ? `data-open-room="${esc(a.room.id)}"` : `data-family="${esc(a.family)}"`}><span class="alert-ico">${svg[a.icon]}</span><span class="alert-text"><b>${esc(a.title)}</b><small>${esc(a.body)}</small></span><span class="alert-side"><time>${esc(ago(a.at))}</time>${svg.chevron}</span></button>`).join('')
    : `<p class="empty">${esc(t(alertFilter === 'service' ? 'alerts.emptyService' : 'alerts.empty'))}</p>`;
}

// 공유
export function renderShareHub(box, {rooms = [], saved = []} = {}) {
  box.innerHTML = `<div class="share-hub"><h1>${esc(t('share.hubTitle'))}</h1><p>${esc(t('share.hubSub'))} 💙</p><img class="share-art" src="assets/share-friends.webp" alt="" width="1200" height="630"><div class="share-rows">${row('rooms', svg.bubble, t('share.room'), t('share.roomSub'))}${row('products', svg.bag, t('share.product'), t('share.productSub'))}${row('invite', svg.invite, t('share.invite'), t('share.inviteSub'))}</div><div id="share-pick"></div></div>`;
  box.dataset.rooms = JSON.stringify(rooms.map(r => ({id: r.id, title: roomTitle(r)})));
  box.dataset.saved = JSON.stringify(saved.map(s => ({key: s.familyKey, name: s.name})));
}
const row = (id, ico, title, sub) => `<button class="share-row" data-share-hub="${id}"><span class="share-ico">${ico}</span><span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${svg.chevron}</button>`;

globalThis.document?.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.alertFilter) {
    alertFilter = b.dataset.alertFilter;
    document.querySelectorAll('[data-alert-filter]').forEach(x => { const on = x.dataset.alertFilter === alertFilter; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
    drawAlerts();
  } else if (b.dataset.shareHub) {
    const hub = b.closest('[data-rooms]'), pick = document.getElementById('share-pick'); if (!hub || !pick) return;
    const toast = m => { const el = document.getElementById('toast'); if (el) { el.textContent = m; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2500); } };
    if (b.dataset.shareHub === 'invite') { share({title: t('share.inviteMessage'), url: shareUrl({})}, toast); return; }
    const items = b.dataset.shareHub === 'rooms' ? JSON.parse(hub.dataset.rooms).map(r => ({title: r.title, url: shareUrl({room: r.id})})) : JSON.parse(hub.dataset.saved).filter(s => s.key).map(s => ({title: s.name, url: shareUrl({product: s.key})}));
    pick.innerHTML = items.length ? `<h2>${esc(t(b.dataset.shareHub === 'rooms' ? 'share.room' : 'share.product'))}</h2>${items.map((x, i) => `<button class="share-pick" data-share-index="${i}">${esc(x.title)}</button>`).join('')}` : `<p class="empty">${esc(t(b.dataset.shareHub === 'rooms' ? 'chat.mineEmpty' : 'saved.hint'))}</p>`;
    pick.dataset.items = JSON.stringify(items);
  } else if (b.dataset.shareIndex) {
    const items = JSON.parse(document.getElementById('share-pick')?.dataset.items ?? '[]'), x = items[+b.dataset.shareIndex];
    if (x) share(x, m => { const el = document.getElementById('toast'); if (el) { el.textContent = m; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2500); } });
  }
});
