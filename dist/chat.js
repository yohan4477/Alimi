// Topic chat screen (#68): room list, join rules, messages with shared items, like / reply / report / block.
// New messages arrive by polling every few seconds while a room is open.
import {track} from './events.js';
import {t, locale} from './i18n.js';
import {searchCatalog, brandLabel, usd, brandInitials} from './live.js';
import {chatSecret, readBlocked, block, hasAgreed, agree, roomTitle, roomIntro, visible, errorKey, hotRooms, topicRooms, fetchMyRooms,
  fetchRooms, fetchMessages, joinRoom, postMessage, likeMessage, reportMessage} from './chat-api.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let storage; try { storage = localStorage; } catch {}
const secret = chatSecret(storage);
const chat = {rooms: [], room: null, messages: [], nickname: '', myTag: '', item: null, replyTo: null, menuFor: null, poll: null, sending: false};
let onClose = () => {}, toast = () => {};

async function tagOf(s) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
const time = iso => new Intl.DateTimeFormat(locale(), {hour: '2-digit', minute: '2-digit'}).format(new Date(iso));
const itemCard = it => `<button class="chat-item" ${it.family_key ? `data-family="${esc(it.family_key)}"` : `data-track="${esc(it.sku)}" data-retailer="${esc(it.retailer)}" data-market="${esc(it.market)}"`}>${it.image_url ? `<img src="${esc(it.image_url)}" alt="" loading="lazy">` : '<span class="no-photo"></span>'}<span><small>${esc(brandLabel({brand: it.brand, brandKo: it.brand_ko}))}</small><b>${esc(it.name)}</b><em>${esc(t('chat.sharedPrice', {v: usd(it.price_minor / 100)}))}</em></span></button>`;

const shell = inner => { $('#chat').innerHTML = inner; };
export async function openChat(opts = {}) {
  onClose = opts.onClose ?? onClose; toast = opts.toast ?? toast;
  chat.myTag ||= await tagOf(secret);
  track('chat_open', null);
  renderRooms();
}
function closeChat() { leaveChat(); onClose(); }
// Called when the user switches to another tab: stop polling until the chat screen is opened again.
export function leaveChat() { stopPolling(); chat.room = null; }

// Room list in three tabs like the reference app: Rooms (busy cards + brand rooms), Topics (tag chips), My chats.
const people = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15 5.2a3.2 3.2 0 0 1 0 6M17 14a5 5 0 0 1 3.5 5"/></svg>';
const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const roomIcon = r => r.kind === 'brand'
  ? `<i class="room-ico brand">${r.logo_url ? `<img src="${esc(r.logo_url)}" alt="" loading="lazy">` : `<span>${esc(brandInitials(r.brand ?? r.title_en))}</span>`}</i>`
  : `<i class="room-ico">${people}</i>`;
const roomRow = (r, sub, time = '') => `<button class="room-row" data-chat-room="${esc(r.id)}">${roomIcon(r)}<span class="room-text"><b>${esc(roomTitle(r))} <em>${esc(t('chat.count', {n: r.members}))}</em></b><small>${esc(sub)}</small></span>${time ? `<time>${esc(time)}</time>` : ''}</button>`;
const roomCard = r => `<button class="room-card" data-chat-room="${esc(r.id)}"><b>${esc(roomTitle(r))}</b><small>${esc(t('chat.members', {n: r.members}))}</small>${r.messages_24h > 0 ? `<i class="chat-dot" aria-label="${esc(t('chat.active'))}"></i>` : ''}<span class="room-card-ico">${r.kind === 'brand' ? roomIcon(r) : people}</span></button>`;
let roomTab = 'rooms', topicTag = 'all', roomQuery = '', searching = false;
async function renderRooms() {
  stopPolling(); chat.room = null;
  shell(`<div class="chat-top"><div class="chat-tabs">${['rooms', 'topics', 'mine'].map(k => `<button data-chat-tab="${k}" class="${roomTab === k ? 'on' : ''}">${esc(t('chat.tab.' + k))}</button>`).join('')}</div><button class="icon-btn" data-chat-action="search" aria-label="${esc(t('chat.searchRooms'))}">${searchIcon}</button></div>${searching ? `<div class="searchbar chat-search"><input id="chat-room-q" type="search" value="${esc(roomQuery)}" placeholder="${esc(t('chat.searchRooms'))}"></div>` : ''}<div id="chat-room-list" class="chat-rooms"><p class="empty">${esc(t('loading'))}</p></div>`);
  if (searching) { const q = $('#chat-room-q'); q.oninput = () => { roomQuery = q.value; renderRoomList(); }; q.focus(); }
  try { chat.rooms = await fetchRooms(); } catch { $('#chat-room-list').innerHTML = `<p class="empty">${esc(t('chat.loadFailed'))}</p>`; return; }
  renderRoomList();
}
async function renderRoomList() {
  const box = $('#chat-room-list'); if (!box) return;
  const q = roomQuery.trim().toLowerCase();
  const rooms = q ? chat.rooms.filter(r => (r.title_en + ' ' + r.title_ko).toLowerCase().includes(q)) : chat.rooms;
  if (roomTab === 'rooms') {
    const brandRooms = rooms.filter(r => r.kind === 'brand');
    box.innerHTML = `<h3 class="chat-hot">${esc(t('chat.hot'))}</h3><div class="room-cards">${hotRooms(rooms).map(roomCard).join('')}</div>${brandRooms.length ? `<h3 class="chat-section">${esc(t('chat.brandRooms'))}</h3>${brandRooms.map(r => roomRow(r, roomIntro(r))).join('')}` : ''}`;
  } else if (roomTab === 'topics') {
    box.innerHTML = `<div class="chat-chips">${['all', 'talk', 'skin', 'makeup', 'deals'].map(k => `<button data-chat-tag="${k}" class="${topicTag === k ? 'on' : ''}">${esc(t('chat.tag.' + k))}</button>`).join('')}</div>${topicRooms(rooms, topicTag).map(r => roomRow(r, roomIntro(r))).join('')}`;
  } else {
    box.innerHTML = `<p class="empty">${esc(t('loading'))}</p>`;
    let mine; try { mine = await fetchMyRooms(chat.myTag); } catch { box.innerHTML = `<p class="empty">${esc(t('chat.loadFailed'))}</p>`; return; }
    if (roomTab !== 'mine') return;
    const rows = mine.map(m => ({room: rooms.find(r => r.id === m.room_id), last: m.last})).filter(x => x.room);
    box.innerHTML = rows.length ? rows.map(({room, last}) => roomRow(room, last ? (last.body || last.item?.name || '') : t('chat.noMessages'), last ? time(last.created_at) : '')).join('') : `<p class="empty">${esc(t('chat.mineEmpty'))}</p>`;
  }
}

function askJoin(room) {
  if (hasAgreed(storage)) { enterRoom(room); return; }
  const dlg = $('#chat-join');
  dlg.innerHTML = `<h2>${esc(t('chat.joinTitle', {room: roomTitle(room)}))}</h2><p class="chat-intro">${esc(roomIntro(room))}</p><p class="chat-rules">${esc(t('chat.rules'))}</p><div class="chat-join-actions"><button data-chat-action="join-cancel">${esc(t('cancel'))}</button><button class="primary" data-chat-action="join-ok" data-room="${esc(room.id)}">${esc(t('chat.join'))}</button></div>`;
  dlg.showModal();
}

async function enterRoom(room) {
  chat.room = room; chat.messages = []; chat.item = null; chat.replyTo = null;
  shell(`<div class="detail-nav"><button data-chat-action="rooms" aria-label="${esc(t('back'))}">←</button><strong>${esc(roomTitle(room))} <small>${esc(t('chat.members', {n: room.members}))}</small></strong><span></span></div><div id="chat-log" class="chat-log" aria-live="polite"><p class="empty">${esc(t('loading'))}</p></div><form id="chat-form" class="chat-composer"><div id="chat-context"></div><div class="chat-input-row"><button type="button" class="chat-attach" data-chat-action="attach" aria-label="${esc(t('chat.attach'))}">＋</button><textarea id="chat-text" rows="1" maxlength="500"></textarea><button class="chat-send primary" aria-label="${esc(t('chat.send'))}">↑</button></div></form>`);
  $('#chat-form').onsubmit = e => { e.preventDefault(); send(); };
  $('#chat-text').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
  try {
    chat.nickname = await joinRoom(secret, room.id);
    track('chat_join', null, {room: room.id});
    $('#chat-text').placeholder = t('chat.placeholder', {name: chat.nickname});
    chat.messages = await fetchMessages(room.id);
  } catch { $('#chat-log').innerHTML = `<p class="empty">${esc(t('chat.loadFailed'))}</p>`; return; }
  renderLog(true);
  startPolling();
}

function renderLog(scroll) {
  const log = $('#chat-log'); if (!log) return;
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  const list = visible(chat.messages, readBlocked(storage));
  const byId = new Map(list.map(m => [m.id, m])); // quotes of blocked authors are hidden too
  log.innerHTML = list.length ? list.map(m => {
    const mine = m.author_tag === chat.myTag, parent = m.reply_to ? byId.get(m.reply_to) : null;
    return `<article class="chat-msg${mine ? ' mine' : ''}" data-id="${m.id}">${mine ? '' : `<small class="chat-nick">${esc(m.nickname)}</small>`}<div class="chat-bubble-row"><div class="chat-bubble">${parent ? `<blockquote>${esc(parent.nickname)}: ${esc(parent.body || parent.item?.name || '')}</blockquote>` : ''}${m.body ? `<p>${esc(m.body)}</p>` : ''}${m.item ? itemCard(m.item) : ''}</div><span class="chat-side"><time>${esc(time(m.created_at))}</time><button class="chat-like" data-chat-like="${m.id}" aria-label="${esc(t('chat.like'))}">♡ ${m.likes || ''}</button>${mine ? '' : `<button class="chat-menu" data-chat-menu="${m.id}" aria-label="${esc(t('chat.more'))}">⋯</button>`}</span></div></article>`;
  }).join('') : `<p class="empty">${esc(t('chat.empty'))}</p>`;
  if (scroll || near) log.scrollTop = log.scrollHeight;
}

function renderContext() {
  const box = $('#chat-context'); if (!box) return;
  const reply = chat.replyTo ? chat.messages.find(m => m.id === chat.replyTo) : null;
  box.innerHTML = (reply ? `<div class="chat-chip">${esc(t('chat.replyingTo', {name: reply.nickname}))}<button type="button" data-chat-action="reply-cancel" aria-label="${esc(t('close'))}">×</button></div>` : '') +
    (chat.item ? `<div class="chat-chip">${esc(brandLabel(chat.item))} · ${esc(chat.item.name)}<button type="button" data-chat-action="item-cancel" aria-label="${esc(t('chat.removeItem'))}">×</button></div>` : '');
}

async function send() {
  const box = $('#chat-text'); const body = box.value.trim();
  if (chat.sending || (!body && !chat.item)) return;
  chat.sending = true;
  try {
    const m = await postMessage(secret, chat.room.id, body, chat.item, chat.replyTo);
    if (!chat.messages.some(x => x.id === m.id)) chat.messages.push(m);
    track('chat_send', null, {room: chat.room.id, item: chat.item ? 1 : 0, reply: chat.replyTo ? 1 : 0});
    box.value = ''; chat.item = null; chat.replyTo = null; renderContext(); renderLog(true);
  } catch (e) { toast(t(errorKey(e.message))); }
  finally { chat.sending = false; }
}

function startPolling() {
  stopPolling();
  chat.poll = setInterval(async () => {
    if (!chat.room || document.hidden) return;
    const last = chat.messages.at(-1)?.id ?? 0;
    try {
      const fresh = (await fetchMessages(chat.room.id, last)).filter(m => !chat.messages.some(x => x.id === m.id));
      if (fresh.length) { chat.messages.push(...fresh); renderLog(false); }
    } catch {}
  }, 4000);
}
function stopPolling() { clearInterval(chat.poll); chat.poll = null; }

// Item picker: search the catalog and attach one product to the next message.
let pickTimer, pickSeq = 0, picked = [];
function openPicker() {
  const dlg = $('#chat-pick');
  dlg.innerHTML = `<form method="dialog"><button class="close-dialog" aria-label="${esc(t('close'))}">×</button></form><h2>${esc(t('chat.attach'))}</h2><p>${esc(t('chat.attachHint'))}</p><input id="chat-pick-q" type="search" placeholder="${esc(t('chat.attachSearch'))}" aria-label="${esc(t('chat.attachSearch'))}"><div id="chat-pick-list"></div>`;
  dlg.showModal();
  $('#chat-pick-q').oninput = e => {
    clearTimeout(pickTimer); const q = e.target.value; const seq = ++pickSeq;
    pickTimer = setTimeout(async () => {
      try { picked = await searchCatalog(q); } catch { picked = []; }
      if (seq !== pickSeq) return;
      $('#chat-pick-list').innerHTML = picked.slice(0, 20).map((c, i) => `<button class="chat-pick-row" data-chat-pick="${i}">${c.image_url ? `<img src="${esc(c.image_url)}" alt="" loading="lazy">` : '<span class="no-photo"></span>'}<span><small>${esc(brandLabel(c))}</small><b>${esc(c.name)}</b></span><strong>${usd(c.price)}</strong></button>`).join('') || (q.trim().length >= 2 ? `<p class="empty">${esc(t('empty.catalogSearch'))}</p>` : '');
    }, 300);
  };
  $('#chat-pick-q').focus();
}

function openMenu(id) {
  chat.menuFor = chat.messages.find(m => m.id === id); if (!chat.menuFor) return;
  const dlg = $('#chat-menu');
  dlg.innerHTML = `<div class="chat-menu-list"><button data-chat-action="reply">${esc(t('chat.reply'))}</button><button data-chat-action="report">${esc(t('chat.report'))}</button><button data-chat-action="block">${esc(t('chat.block'))}</button><button data-chat-action="menu-close">${esc(t('cancel'))}</button></div>`;
  dlg.showModal();
}
function openReport() {
  $('#chat-menu').innerHTML = `<h2>${esc(t('chat.reportTitle'))}</h2><div class="chat-menu-list">${['spam', 'abuse', 'sexual', 'other'].map(r => `<button data-chat-report="${r}">${esc(t('chat.reason.' + r))}</button>`).join('')}<button data-chat-action="menu-close">${esc(t('cancel'))}</button></div>`;
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.chatAction;
  if (a === 'home') closeChat();
  else if (a === 'rooms') renderRooms();
  else if (a === 'search') { searching = !searching; if (!searching) roomQuery = ''; renderRooms(); }
  else if (b.dataset.chatTab) { roomTab = b.dataset.chatTab; document.querySelectorAll('[data-chat-tab]').forEach(x => x.classList.toggle('on', x === b)); renderRoomList(); }
  else if (b.dataset.chatTag) { topicTag = b.dataset.chatTag; renderRoomList(); }
  else if (a === 'join-cancel') $('#chat-join').close();
  else if (a === 'join-ok') { agree(storage); $('#chat-join').close(); enterRoom(chat.rooms.find(r => r.id === b.dataset.room)); }
  else if (a === 'attach') openPicker();
  else if (a === 'reply-cancel') { chat.replyTo = null; renderContext(); }
  else if (a === 'item-cancel') { chat.item = null; renderContext(); }
  else if (a === 'menu-close') $('#chat-menu').close();
  else if (a === 'reply') { chat.replyTo = chat.menuFor.id; $('#chat-menu').close(); renderContext(); $('#chat-text').focus(); }
  else if (a === 'report') openReport();
  else if (a === 'block') { block(storage, chat.menuFor.author_tag); $('#chat-menu').close(); renderLog(false); toast(t('chat.blocked')); }
  else if (b.dataset.chatReport) {
    $('#chat-menu').close();
    try { await reportMessage(secret, chat.menuFor.id, b.dataset.chatReport); toast(t('chat.reported')); } catch { toast(t('chat.err.other')); }
  }
  else if (b.dataset.chatRoom) { const r = chat.rooms.find(x => x.id === b.dataset.chatRoom); if (r) askJoin(r); }
  else if (b.dataset.chatPick) { chat.item = picked[+b.dataset.chatPick]; $('#chat-pick').close(); renderContext(); $('#chat-text').focus(); }
  else if (b.dataset.chatMenu) openMenu(+b.dataset.chatMenu);
  else if (b.dataset.chatLike) {
    const id = +b.dataset.chatLike;
    try { const n = await likeMessage(secret, id); const m = chat.messages.find(x => x.id === id); if (m) m.likes = n; renderLog(false); } catch {}
  }
});
