import {loadingMarkup} from './loading-companion.js';
import {share, shareUrl} from './share.js';
// Community screen: topics → each topic has Posts (questions / recommendations / reviews with comments)
// and Live chat, kept in separate views. Product cards are the shared link: the same card in a post,
// comment or chat message opens the same product sheet and carries the source as Awin clickref.
// Live chat polls every few seconds while open.
import {reviewPrefill, saveFromReview, cachedProfile} from './profile.js';
import {activeRooms, mentionedProducts} from './community-home.js';
import {roomImages, roomListCard, roomThumb, roomCategory, topicPictures, pickCard, memberLine} from './room-card.js';
import {loadRevisit, welcomeBanner, joinedCard, ago as timeAgo} from './revisit.js';
import {readInterests, recommendRooms, CONCERNS, canCreateRooms} from './onboarding.js';
import {track} from './events.js';
import {t, locale} from './i18n.js';
import {searchCatalog, brandLabel, usd, brandInitials, brandColor, fetchBrands, fetchFamiliesPage} from './live.js';
import {chatSecret, readBlocked, block, hasAgreed, agree, roomTitle, roomIntro, visible, errorKey,
  fetchRooms, createRoom, fetchMessages, fetchMyRooms, joinRoom, postMessage, likeMessage, reportMessage} from './chat-api.js';
import {KINDS, REASONS, USED_FOR, SKIN_TYPES, SKIN_TONES, UNDERTONES, CLIMATES, filterReviews, photoUrl, reviewPayload, uploadPhoto, ago, fetchPosts, fetchPost, fetchComments, fetchProductTalk, createPost, addComment, likeCommunity, reportCommunity} from './community-api.js';

import {$, esc} from './util.js';
let storage; try { storage = localStorage; } catch {}
const secret = chatSecret(storage);
const chat = {rooms: [], room: null, messages: [], nickname: '', myTag: '', item: null, replyTo: null, menuFor: null, poll: null, sending: false};
const view = {mode: 'posts', post: null, comments: [], commentItem: null, draft: null};
let onClose = () => {}, toast = () => {}, pickFor = 'chat';

async function tagOf(s) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
const time = iso => new Intl.DateTimeFormat(locale(), {hour: '2-digit', minute: '2-digit'}).format(new Date(iso));
// ref = where the card was seen ("post-12", "comment-4", "chat-88"); passed on to the product sheet / Awin.
const itemCard = (it, ref = '') => `<button class="chat-item" ${it.family_key ? `data-family="${esc(it.family_key)}"` : `data-track="${esc(it.sku)}" data-retailer="${esc(it.retailer)}" data-market="${esc(it.market)}"`} data-ref="${esc(ref)}">${it.image_url ? `<img src="${esc(it.image_url)}" alt="" loading="lazy">` : '<span class="no-photo"></span>'}<span><small>${esc(brandLabel({brand: it.brand, brandKo: it.brand_ko}))}</small><b>${esc(it.name)}</b><em>${esc(t('chat.sharedPrice', {v: usd(it.price_minor / 100)}))}</em></span></button>`;
const shell = inner => { $('#chat').innerHTML = inner; };
const body = inner => { const b = $('#topic-body'); if (b) b.innerHTML = inner; };

export async function openChat(opts = {}) {
  onClose = opts.onClose ?? onClose; toast = opts.toast ?? toast;
  chat.myTag ||= await tagOf(secret);
  track('community_open', null);
  if (pendingPost) { const id = pendingPost; pendingPost = null; if (!chat.rooms.length) chat.rooms = await fetchRooms().catch(() => []); chat.room = null; openPost(id); return; }
  if (pendingRoom) { if (!chat.rooms.length) chat.rooms = await fetchRooms().catch(() => []); const r = chat.rooms.find(r => r.id === pendingRoom); pendingRoom = null; if (r) { openTopic(r, 'live'); return; } }
  renderHome();
}
// Called when the user switches to another tab: stop polling until the community screen is opened again.
export function leaveChat() { stopPolling(); chat.room = null; }
// Product sheet "대화에 첨부": only while a live room's composer is on screen.
export const canAttachToChat = () => Boolean(chat.room && $('#chat-text'));
export function attachToChat(it) {
  if (!canAttachToChat() || !it) return false;
  chat.item = it; renderContext(); $('#chat-text').focus();
  return true;
}

const icon = {
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6h14v-6"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15 5.2a3.2 3.2 0 0 1 0 6M17 14a5 5 0 0 1 3.5 5"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>',
  comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>'
};
const roomIcon = r => r.kind === 'brand'
  ? `<i class="room-ico brand">${`<span>${esc(brandInitials(r.brand ?? r.title_en))}</span>` + (r.logo_url ? `<img src="${esc(r.logo_url)}" alt="" loading="lazy">` : '')}</i>`
  : `<i class="room-ico">${icon.people}</i>`;
const roomRow = r => `<button class="room-row" data-chat-room="${esc(r.id)}">${roomIcon(r)}<span class="room-text"><b>${esc(roomTitle(r))} <em>${esc(t('chat.count', {n: r.members}))}</em></b><small>${esc(roomIntro(r))}</small></span></button>`;
const roomCard = r => `<button class="room-card" data-chat-room="${esc(r.id)}"><b>${esc(roomTitle(r))}</b><small>${esc(t('chat.members', {n: r.members}))}</small>${r.messages_24h > 0 ? `<i class="chat-dot" aria-label="${esc(t('chat.active'))}"></i>` : ''}<span class="room-card-ico">${icon.people}</span></button>`;
// Saved posts are per device (like saved products) and shown in the Saved tab.
const SAVED_POSTS = 'alimi-saved-posts';
export const readSavedPosts = () => { try { const v = JSON.parse(storage.getItem(SAVED_POSTS)); return Array.isArray(v) ? v.filter(x => x && Number.isInteger(x.id)) : []; } catch { return []; } };
function toggleSavedPost(p) {
  const list = readSavedPosts(), has = list.some(x => x.id === p.id);
  const next = has ? list.filter(x => x.id !== p.id) : [{id: p.id, title: p.title, kind: p.kind}, ...list].slice(0, 100);
  try { storage.setItem(SAVED_POSTS, JSON.stringify(next)); } catch {}
  if (!has) track('post_save', null, {post: p.id});
  return !has;
}
const visiblePosts = list => list.filter(p => !readBlocked(storage).includes(p.author_tag));
// Review facts the reader uses to judge "is this person like me": usage period, skin type, goal, sponsored.
const reviewFacts = p => p.kind !== 'review' ? '' : `<div class="reason-chips review-facts">${p.sponsored ? `<span class="sponsored">${esc(t('review.sponsoredTag'))}</span>` : ''}${p.used_for ? `<span>${esc(t('review.used.' + p.used_for))}</span>` : ''}${p.skin_type ? `<span>${esc(t('skin.' + p.skin_type))}</span>` : ''}${p.skin_tone ? `<span>${esc(t('review.tone'))}: ${esc(t('tone.' + p.skin_tone))}</span>` : ''}${p.undertone ? `<span>${esc(t('under.' + p.undertone))}</span>` : ''}${p.climate ? `<span>${esc(t('climate.' + p.climate))}</span>` : ''}${p.goal ? `<span>${esc(p.goal)}</span>` : ''}</div>`;
// The writer's own past purchase, clearly labelled and kept apart from the app's current retailer button.
const buyerInfo = p => {
  const parts = [p.bought_where, p.bought_price_minor ? usd(p.bought_price_minor / 100) : null, p.ship_country && p.ship_days != null ? t('review.shipped', {country: p.ship_country, days: p.ship_days}) : p.ship_country].filter(Boolean);
  return parts.length ? `<div class="buyer-info"><small>${esc(t('review.buyerInfo'))}</small><p>${esc(parts.join(' · '))}</p></div>` : '';
};
export const postRow = p => `<button class="post-row" data-post="${p.id}"><span class="post-main"><span class="post-kind k-${esc(p.kind)}">${esc(t('community.kind.' + p.kind))}</span><b>${esc(p.title)}</b><small>${esc(p.nickname)} · ${esc(ago(p.created_at))} · ${icon.comment} ${p.comments}</small></span>${p.photos?.[0] ? `<img src="${esc(photoUrl(p.photos[0]))}" alt="" loading="lazy">` : p.item?.image_url ? `<img src="${esc(p.item.image_url)}" alt="" loading="lazy">` : ''}</button>`;

// Community home (journey reference): Seoul Beauty header, 추천 / 대화방 / 발견 / 브랜드 tabs.
// 추천: guide, trending rooms with a real product picture, recommended rooms. 발견: products and questions
// from conversations. Every number shown is a real count from the fetched sample.
const HOME_TABS = ['rec', 'rooms', 'discover', 'brands'];
let homeVersion = 0, homeTab = 'rec', home = null, homeBrands = null, catalogPics = null;
// Top catalog products per category (real images) to illustrate rooms; loaded once, never blocks the home.
async function loadCatalogPictures(rooms) {
  if (catalogPics) return catalogPics;
  const cats = [...new Set([...rooms.map(roomCategory).filter(Boolean), '전체'])];
  const pages = await Promise.all(cats.map(c => fetchFamiliesPage(c, 0, 6).catch(() => [])));
  catalogPics = {byCategory: new Map(cats.map((c, i) => [c, pages[i].map(f => f.image_url).filter(Boolean)])), popular: pages[cats.indexOf('전체')].filter(f => f.image_url)};
  return catalogPics;
}
async function renderHome() {
  const version = ++homeVersion;
  stopPolling(); chat.room = null; view.post = null;
  shell(`<div class="logo-head center"><img src="assets/seoul-beauty-logo.webp" alt="Seoul Beauty" width="200" height="60"><button class="icon-btn" data-screen="search" aria-label="${esc(t('search.title'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button></div><div class="home-tabs" role="tablist" aria-label="${esc(t('community.title'))}">${HOME_TABS.map(k => `<button role="tab" id="home-tab-${k}" data-home-tab="${k}" aria-selected="${homeTab === k}" aria-controls="community-home" class="${homeTab === k ? 'on' : ''}">${esc(t('home.tab.' + k))}</button>`).join('')}</div><div class="chat-rooms" id="community-home" role="tabpanel" aria-labelledby="home-tab-${homeTab}">${loadingMarkup(t('loading'))}</div><button class="start-conversation" data-chat-action="find-topic">＋ ${esc(t('home.ask'))}</button>`);
  let posts = [], joined = [], postsFailed = false;
  try { [chat.rooms, posts, joined] = await Promise.all([fetchRooms(), fetchPosts(null, 40).catch(() => { postsFailed = true; return []; }), fetchMyRooms(chat.myTag).catch(() => [])]); }
  catch { if (version === homeVersion && $('#community-home')) $('#community-home').innerHTML = `<p class="empty">${esc(t('home.retry'))}</p><button data-chat-action="rooms">${esc(t('retry'))}</button>`; return; }
  if (version !== homeVersion || !$('#community-home')) return;
  const recent = visiblePosts(posts), hot = activeRooms(chat.rooms), topics = chat.rooms.filter(r => r.kind !== 'brand').sort((a,b) => a.sort-b.sort);
  const entries = recent.map(p => ({...p,source:'post'}));
  let partial = postsFailed;
  const previews = new Map();
  await Promise.all(hot.map(async r => { try { const list = visible(await fetchMessages(r.id), readBlocked(storage)); previews.set(r.id, list.at(-1)?.body ?? ''); entries.push(...list.map(m => ({...m,room_id:r.id,source:'chat'}))); } catch { partial = true; } }));
  if (version !== homeVersion || !$('#community-home')) return;
  home = {hot, topics, recent, previews, partial, joined, images: roomImages(entries), products: mentionedProducts(entries, readBlocked(storage))};
  homeJoined = joined;
  drawHome();
  loadRevisit().then(r => { if (version === homeVersion && home) { home.revisit = r; drawHome(); } }, () => {});
  loadCatalogPictures(chat.rooms).then(pics => {
    if (version !== homeVersion || !home) return;
    home.images = topicPictures([...hot, ...topics], pics.byCategory, roomImages(entries)); home.popular = pics.popular;
    drawHome();
  }, () => {});
}
const trendCard = r => `<button class="trend-card" data-chat-room="${esc(r.id)}" data-live="1"><span class="trend-img">${home.images.get(r.id) ? `<img src="${esc(home.images.get(r.id))}" alt="" loading="lazy">` : roomThumb(r)}</span><b>${esc(roomTitle(r))}</b><small>${esc(t('room.newToday', {n: r.messages_24h}))}</small></button>`;
const bigHead = (title, sub, more = 'data-home-tab="rooms"') => `<div class="big-head-row"><div><h2 class="big-head">${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div><button class="text-link" ${more}>${esc(t('home.seeAll'))} ›</button></div>`;
const sectionHead = (title, sub, more = '') => `<div class="section-head"><div><h2 class="chat-section">${esc(title)}</h2>${sub ? `<p class="home-note">${esc(sub)}</p>` : ''}</div>${more}</div>`;
function drawHome() {
  const box = $('#community-home'); if (!box || !home) return;
  box.setAttribute('aria-labelledby', 'home-tab-' + homeTab);
  const {hot, topics, recent, previews, partial, joined, images, products} = home;
  if (homeTab === 'rec') {
    const interests = readInterests();
    const picks = interests?.done && (interests.skincare || interests.makeup) ? recommendRooms(chat.rooms, interests, 4).map(x => x.room) : (hot.length ? hot : topics).slice(0, 4);
    const mine = home.revisit?.activity?.length ? welcomeBanner() + bigHead(t('rooms.mine'), '', 'data-screen="rooms"') + home.revisit.activity.slice(0, 2).map(a => joinedCard(a, images.get(a.room.id))).join('') : '';
    const trend = hot.length ? bigHead(t('home.trending'), t('home.trendingSub')) + `<div class="trend-row">${hot.map(trendCard).join('')}</div>` : '';
    box.innerHTML = `${mine}${trend}${bigHead(t('home.recRooms'), t('home.recRoomsSub'))}${picks.map(r => pickCard(r, {image: images.get(r.id), intro: false, highlight: interests?.concerns ?? [], attrs: `data-chat-room="${esc(r.id)}"${r.messages_24h > 0 ? ' data-live="1"' : ''}`})).join('')}${!hot.length ? `<p class="empty">${esc(t('home.quiet'))}</p>` : ''}<button class="share-card" data-screen="share"><img src="assets/share-friends.webp" alt="" width="92" height="64"><span><b>${esc(t('share.hubTitle'))}</b><small>${esc(t('share.hubSub'))}</small></span><i aria-hidden="true">›</i></button><button class="text-link edit-interests" data-onb-manage>${esc(t(interests?.skincare || interests?.makeup ? 'onb.edit' : 'onb.manage'))}</button>`;
  } else if (homeTab === 'rooms') {
    box.innerHTML = `${sectionHead(t('home.topics'), t('home.askHint'), canCreateRooms(chat.rooms) ? `<button class="text-link" data-chat-action="create-room">+ ${esc(t('room.new'))}</button>` : '')}${topics.map(r => roomListCard(r, {image: images.get(r.id), note: previews.get(r.id) || roomIntro(r)})).join('')}`;
  } else if (homeTab === 'discover') {
    const mentioned = products.length ? `<div class="mentioned-products">${products.map(g => `<article>${itemCard(g.item, g.entries[0].source + '-' + g.entries[0].id)}<small>${esc(t('home.mentionCount',{people:g.authors.size,rooms:g.rooms.size}))}</small><button class="conversation-link" ${g.entries[0].source === 'post' ? `data-post="${g.entries[0].id}"` : `data-chat-room="${esc(g.entries[0].room_id)}" data-live="1"`}>${esc(t('home.viewConversation'))} ›</button></article>`).join('')}</div>` : `<p class="empty">${esc(t('home.noProducts'))}</p>`;
    const popular = home.popular?.length ? sectionHead(t('home.popular'), t('home.popularSub')) + `<div class="popular-grid">${home.popular.map(f => `<button class="popular-item" data-family="${esc(f.family_key)}" data-ref="discover"><span class="popular-img"><img src="${esc(f.image_url)}" alt="" loading="lazy"></span><small>${esc(brandLabel(f))}</small><b>${esc(f.base_name)}</b>${f.minPrice ? `<em>${esc(usd(f.minPrice))}</em>` : ''}</button>`).join('')}</div>` : '';
    const talk = `${sectionHead(t('home.mentioned'), t('home.scope'))}${partial ? `<p class="home-note" role="status">${esc(t('home.productsFailed'))}</p>` : ''}${mentioned}`;
    // Conversation mentions lead when there are any; otherwise the catalog fills the screen first.
    box.innerHTML = `${products.length ? talk + popular : popular + talk}${recent.length ? `<h2 class="chat-section">${esc(t('home.questions'))}</h2>${recent.slice(0,6).map(postRow).join('')}` : ''}`;
  } else {
    box.innerHTML = sectionHead(t('brands.title'), '') + (homeBrands === 'failed' ? `<p class="empty" role="status">${esc(t('home.brandsFailed'))}</p><button class="text-link" data-home-brands-retry>${esc(t('retry'))}</button>` : homeBrands ? homeBrands.length ? `<div class="home-brands">${homeBrands.map(b => `<button class="home-brand" data-brand="${esc(b.brand)}"><i style="background:${brandColor(b.brand)}">${esc(brandInitials(b.brand))}${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="" loading="lazy">` : ''}</i><span><b>${esc(brandLabel(b))}</b>${b.families ? `<small>${esc(t('count', {n: b.families}))}</small>` : ''}</span></button>`).join('')}</div>` : `<p class="empty">${esc(t('home.noBrands'))}</p>` : loadingMarkup(t('loading')));
    if (!homeBrands) fetchBrands().then(list => { homeBrands = list; }, () => { homeBrands = 'failed'; }).then(() => { if (homeTab === 'brands') drawHome(); });
  }
}
let homeJoined = [];
function renderJoined() {
  shell(`<div class="page-bar"><button class="icon-btn" data-chat-action="rooms" aria-label="${esc(t('back'))}">${icon.back}</button><h1>${esc(t('activity.chats'))}</h1></div><div class="chat-rooms">${homeJoined.map(j => { const r=chat.rooms.find(r=>r.id===j.room_id);return r ? `<button class="conversation-row" data-chat-room="${esc(r.id)}" data-live="1"><span><b>${esc(roomTitle(r))}</b><p>${esc(j.last?.body || roomIntro(r))}</p></span></button>` : ''; }).join('')}</div>`);
}

export async function renderMyConversations(box) {
  box.innerHTML = `<h2>${esc(t('activity.chats'))}</h2><p class="home-note">${esc(t('loading'))}</p>`;
  try {
    const tag = chat.myTag || await tagOf(secret);
    const [rooms, joined] = await Promise.all([chat.rooms.length ? chat.rooms : fetchRooms(), fetchMyRooms(tag)]);
    if (!box.isConnected) return;
    box.innerHTML = `<h2>${esc(t('activity.chats'))}</h2>${joined.length ? joined.map(j => { const r=rooms.find(r=>r.id===j.room_id);return r ? roomListCard(r, {image: home?.images.get(r.id), note: j.last?.body || roomIntro(r), fresh: hasNewSince(j.last, readSeen()[r.id]), attrs: `data-open-room="${esc(r.id)}"`}) : ''; }).join('') : `<p class="home-note">${esc(t('chat.mineEmpty'))}</p>`}`;
  } catch { if(box.isConnected)box.innerHTML = `<p class="home-note">${esc(t('home.retry'))}</p>`; }
}

function askJoin(room, then) {
  if (hasAgreed(storage)) { then(); return; }
  const dlg = $('#chat-join');
  dlg.innerHTML = `<h2>${esc(t('chat.joinTitle', {room: roomTitle(room)}))}</h2><p class="chat-intro">${esc(roomIntro(room))}</p><p class="chat-rules">${esc(t('chat.rules'))}</p><div class="chat-join-actions"><button data-chat-action="join-cancel">${esc(t('cancel'))}</button><button class="primary" data-chat-action="join-ok">${esc(t('chat.join'))}</button></div>`;
  joinThen = then; dlg.showModal();
}
let joinThen = () => {};

// Topic: header + Posts / Live chat switch. The two never share one stream.
const joinedRooms = new Set();
function openTopic(room, mode = 'live') {
  stopPolling(); chat.room = room; view.mode = mode; view.post = null;
  const member = homeJoined.some(j => j.room_id === room.id);
  const canPost = hasAgreed(storage) && (member || joinedRooms.has(room.id)), other = mode === 'posts' ? 'live' : 'posts';
  shell(`<div class="room-top"><button class="room-back" data-chat-action="rooms" aria-label="${esc(t('back'))}">${icon.back}</button>${roomThumb(room, home?.images.get(room.id))}<div class="room-top-text"><h1>${esc(roomTitle(room))}</h1><small>${esc(memberLine(room))}</small></div>${canPost ? '' : `<button class="room-join" id="room-join" data-chat-action="join-room">+ ${esc(t('room.join'))}</button>`}<div class="room-more-wrap"><button class="room-more" data-chat-action="room-more" aria-label="${esc(t('chat.more'))}" aria-expanded="false">⋮</button><div class="room-menu" id="room-menu" hidden><button data-chat-action="share-room">${esc(t('share.room'))}</button><button data-topic-mode="${other}">${esc(t(other === 'posts' ? 'community.posts' : 'community.live'))}</button></div></div></div><button class="room-notice" data-topic-mode="${other}"><span aria-hidden="true">📣</span><span>${esc(mode === 'posts' ? t('community.live') : roomIntro(room))}</span><i aria-hidden="true">›</i></button><div id="topic-body"></div>`);
  if (mode === 'posts') renderTopicPosts(room); else startLive(room);
}
async function renderTopicPosts(room) {
  body(`<button class="write-btn" data-chat-action="write">${icon.pen}<span>${esc(t('community.write'))}</span></button><div id="post-list">${loadingMarkup(t('loading'))}</div>`);
  let posts; try { posts = visiblePosts(await fetchPosts(room.id)); } catch { posts = null; }
  const list = $('#post-list'); if (!list || chat.room?.id !== room.id || view.mode !== 'posts') return; // user moved on
  if (!posts) { list.innerHTML = `<p class="empty">${esc(t('chat.loadFailed'))}</p>`; return; }
  list.innerHTML = posts.length ? posts.map(postRow).join('') : `<p class="empty">${esc(t('community.empty'))}</p>`;
}

// Post detail with comments; each comment may carry a product card.
async function openPost(id) {
  stopPolling();
  shell(`<div class="page-bar"><button class="icon-btn" data-chat-action="${chat.room ? 'topic' : 'rooms'}" aria-label="${esc(t('back'))}">${icon.back}</button></div><div id="post-view" class="post-view">${loadingMarkup(t('loading'))}</div>`);
  let post, comments; try { [post, comments] = await Promise.all([fetchPost(id), fetchComments(id)]); } catch { post = null; }
  if (!$('#post-view')) return;
  if (!post) { $('#post-view').innerHTML = `<p class="empty">${esc(t('chat.loadFailed'))}</p>`; return; }
  view.post = post; view.comments = comments; view.commentItem = null;
  chat.room ??= chat.rooms.find(r => r.id === post.room_id) ?? null;
  track('post_view', null, {post: post.id, room: post.room_id, item: post.item ? 1 : 0});
  renderPost();
}
function renderPost() {
  const p = view.post, blocked = readBlocked(storage), mine = p.author_tag === chat.myTag;
  const comments = view.comments.filter(c => !blocked.includes(c.author_tag));
  $('#post-view').innerHTML = `<article class="post-full"><span class="post-kind k-${esc(p.kind)}">${esc(t('community.kind.' + p.kind))}</span><h1>${esc(p.title)}</h1><small class="post-meta">${esc(p.nickname)} · ${esc(ago(p.created_at))}</small>${p.body ? `<p class="post-body">${esc(p.body)}</p>` : ''}${p.reasons?.length ? `<div class="reason-chips">${p.reasons.map(r => `<span>${esc(t('reason.' + r))}</span>`).join('')}</div>` : ''}${reviewFacts(p)}${p.photos?.length ? `<div class="post-photos">${p.photos.map(ph => `<a href="${esc(photoUrl(ph))}" target="_blank" rel="noopener"><img src="${esc(photoUrl(ph))}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}${p.item ? itemCard(p.item, 'post-' + p.id) : ''}${buyerInfo(p)}<div class="post-actions"><button data-community-like="post:${p.id}">♡ ${p.likes || ''}</button><button data-community-save="${p.id}" class="${readSavedPosts().some(x => x.id === p.id) ? 'on' : ''}">${esc(t(readSavedPosts().some(x => x.id === p.id) ? 'community.saved' : 'community.save'))}</button>${mine ? '' : `<button data-community-menu="post:${p.id}">⋯</button>`}</div></article><h3 class="chat-section">${esc(t('community.comments', {n: comments.length}))}</h3>${comments.length ? comments.map(c => `<article class="comment"><small class="chat-nick">${esc(c.nickname)} · ${esc(ago(c.created_at))}</small>${c.body ? `<p>${esc(c.body)}</p>` : ''}${c.item ? itemCard(c.item, 'comment-' + c.id) : ''}<div class="post-actions"><button data-community-like="comment:${c.id}">♡ ${c.likes || ''}</button>${c.author_tag === chat.myTag ? '' : `<button data-community-menu="comment:${c.id}">⋯</button>`}</div></article>`).join('') : `<p class="empty">${esc(t('community.noComments'))}</p>`}<form id="comment-form" class="chat-composer"><div id="comment-context">${view.commentItem ? `<div class="chat-chip">${esc(brandLabel(view.commentItem))} · ${esc(view.commentItem.name)}<button type="button" data-chat-action="comment-item-cancel" aria-label="${esc(t('chat.removeItem'))}">×</button></div>` : ''}</div><div class="chat-input-row"><button type="button" class="chat-attach" data-chat-action="attach-comment" aria-label="${esc(t('chat.attach'))}">＋</button><textarea id="comment-text" rows="1" maxlength="1000" placeholder="${esc(t('community.commentPh'))}"></textarea><button class="chat-send primary" aria-label="${esc(t('chat.send'))}">↑</button></div></form>`;
  $('#comment-form').onsubmit = e => { e.preventDefault(); sendComment(); };
}
async function sendComment() {
  const box = $('#comment-text'), text = box.value.trim();
  if (chat.sending || (!text && !view.commentItem)) return;
  chat.sending = true;
  try {
    const c = await addComment(secret, view.post.id, text, view.commentItem);
    view.comments.push(c); view.post.comments++; track('comment_create', null, {post: view.post.id, item: view.commentItem ? 1 : 0});
    view.commentItem = null; renderPost();
  } catch (e) { toast(t(errorKey(e.message))); }
  finally { chat.sending = false; }
}

// Write a post (optionally from one of my chat messages: "Save as post").
function openWrite(draft = {}) {
  view.draft = {kind: 'question', title: '', body: '', item: null, reasons: [], fromMessage: null, usedFor: '', skinType: '', skinTone: '', undertone: '', climate: '', goal: '', photos: [], where: '', price: '', shipCountry: '', shipDays: '', sponsored: false, saveProfile: false, ...reviewPrefill(), ...draft};
  renderWrite(); $('#post-write').showModal();
}
function renderWrite() {
  const d = view.draft;
  let dlg = $('#post-write'); if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'post-write'; dlg.className = 'chat-dialog post-write'; document.body.append(dlg); }
  dlg.innerHTML = `<form method="dialog"><button class="close-dialog" aria-label="${esc(t('close'))}">×</button></form><h2>${esc(t('community.write'))} · ${esc(roomTitle(chat.room))}</h2><div class="chat-chips write-kinds">${KINDS.map(k => `<button type="button" data-write-kind="${k}" class="${d.kind === k ? 'on' : ''}">${esc(t('community.kind.' + k))}</button>`).join('')}</div><input id="write-title" maxlength="120" placeholder="${esc(t('community.titlePh'))}" value="${esc(d.title)}"><textarea id="write-body" rows="4" maxlength="2000" placeholder="${esc(t('community.bodyPh'))}">${esc(d.body)}</textarea>${d.item ? `<div class="chat-chip">${esc(brandLabel(d.item))} · ${esc(d.item.name)}<button type="button" data-chat-action="write-item-cancel" aria-label="${esc(t('chat.removeItem'))}">×</button></div>` : `<button type="button" class="write-attach" data-chat-action="attach-write">＋ ${esc(t('chat.attach'))}</button>`}${d.kind === 'review' ? reviewFields(d) : ''}<p class="write-label">${esc(t('community.reasons'))}</p><div class="chat-chips reason-pick">${REASONS.map(r => `<button type="button" data-write-reason="${r}" class="${d.reasons.includes(r) ? 'on' : ''}">${esc(t('reason.' + r))}</button>`).join('')}</div><button class="primary" data-chat-action="write-submit">${esc(t('community.post'))}</button>`;
}
// One optional single-choice row in the review form (tap again to clear).
const chipRow = (label, values, prefix, current, field) => `<p class="write-label">${esc(t(label))}</p><div class="chat-chips">${values.map(v => `<button type="button" data-write-field="${field}" data-value="${v}" class="${current === v ? 'on' : ''}">${esc(t(prefix + '.' + v))}</button>`).join('')}</div>`;
const reviewFields = d => `${d.item ? '' : `<p class="write-warn">${esc(t('review.needItem'))}</p>`}<p class="write-label">${esc(t('review.usedFor'))}</p><div class="chat-chips">${USED_FOR.map(u => `<button type="button" data-write-used="${u}" class="${d.usedFor === u ? 'on' : ''}">${esc(t('review.used.' + u))}</button>`).join('')}</div><p class="write-note">${esc(t('review.showMine'))}</p>${chipRow('review.skin', SKIN_TYPES, 'skin', d.skinType, 'skinType')}${chipRow('review.tone', SKIN_TONES, 'tone', d.skinTone, 'skinTone')}${chipRow('review.undertone', UNDERTONES, 'under', d.undertone, 'undertone')}${chipRow('review.climate', CLIMATES, 'climate', d.climate, 'climate')}<label class="profile-check"><input type="checkbox" id="write-save-profile" ${d.saveProfile ? 'checked' : ''}><span><b>${esc(t('profile.saveFromReview'))}</b></span></label><input id="write-goal" maxlength="60" placeholder="${esc(t('review.goal'))}" value="${esc(d.goal)}"><p class="write-label">${esc(t('review.photos'))}</p><p class="write-note">${esc(t('review.photoNote'))}</p><div class="write-photos">${d.photos.map((ph, i) => `<span><img src="${esc(photoUrl(ph))}" alt=""><button type="button" data-write-photo-remove="${i}" aria-label="${esc(t('close'))}">×</button></span>`).join('')}${d.photos.length < 4 ? `<label class="photo-add">＋<input id="write-photo" type="file" accept="image/*" hidden><span>${esc(t('review.addPhoto'))}</span></label>` : ''}</div><p class="write-label">${esc(t('review.purchase'))}</p><div class="write-grid"><input id="write-where" maxlength="60" placeholder="${esc(t('review.where'))}" value="${esc(d.where)}"><input id="write-price" inputmode="decimal" placeholder="${esc(t('review.price'))}" value="${esc(d.price)}"><input id="write-country" maxlength="2" placeholder="${esc(t('review.shipCountry'))}" value="${esc(d.shipCountry)}"><input id="write-days" inputmode="numeric" placeholder="${esc(t('review.shipDays'))}" value="${esc(d.shipDays)}"></div><label class="write-check"><input id="write-sponsored" type="checkbox" ${d.sponsored ? 'checked' : ''}> ${esc(t('review.sponsored'))}</label>`;
const keepDraftText = () => {
  if (!$('#write-title')) return; const d = view.draft;
  d.title = $('#write-title').value; d.body = $('#write-body').value;
  if ($('#write-goal')) { d.goal = $('#write-goal').value; d.where = $('#write-where').value; d.price = $('#write-price').value; d.shipCountry = $('#write-country').value; d.shipDays = $('#write-days').value; d.sponsored = $('#write-sponsored').checked; d.saveProfile = !!$('#write-save-profile')?.checked; }
};
// Re-encode in the browser before upload: drops EXIF (location, device) and shrinks to <= 1600px JPEG.
async function reencode(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const q of [0.85, 0.7, 0.55]) { const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q)); if (blob && blob.size <= 1000000) return blob; }
  throw Error('chat:photo');
}
document.addEventListener('change', async e => {
  if (e.target.id !== 'write-photo' || !e.target.files?.[0]) return;
  keepDraftText();
  try { view.draft.photos = [...view.draft.photos, await uploadPhoto(await reencode(e.target.files[0]))].slice(0, 4); }
  catch { toast(t('chat.err.photo')); }
  renderWrite();
});
async function submitPost() {
  keepDraftText(); const d = view.draft;
  try {
    const p = await createPost(secret, chat.room.id, {...d, review: reviewPayload(d)});
    track('post_create', null, {room: chat.room.id, kind: d.kind, item: d.item ? 1 : 0, from_chat: d.fromMessage ? 1 : 0, photos: d.photos.length, reasons: d.reasons.join(',')});
    if (d.kind === 'review' && d.saveProfile) saveFromReview(d).catch(() => {});
    $('#post-write').close();
    if (d.fromMessage) toast(t('community.savedAsPost'));
    openTopic(chat.room, 'posts'); openPost(p.id);
  } catch (e) { toast(t(errorKey(e.message))); }
}

// Live chat inside a topic.
async function startLive(room) {
  chat.messages = []; chat.item = null; chat.replyTo = null;
  const canPost = hasAgreed(storage) && (joinedRooms.has(room.id) || homeJoined.some(j => j.room_id === room.id));
  body(`<div id="chat-log" class="chat-log" aria-live="polite">${loadingMarkup(t('loading'))}</div>${canPost ? `<form id="chat-form" class="chat-composer"><div id="chat-context"></div><div class="chat-input-row"><button type="button" class="chat-attach" data-chat-action="attach" aria-label="${esc(t('chat.attach'))}">＋</button><textarea id="chat-text" rows="1" maxlength="500" placeholder="${esc(t('chat.typeHere'))}"></textarea><button class="chat-send primary" aria-label="${esc(t('chat.send'))}">↑</button></div></form>` : `<div class="join-bar"><p class="chat-rules">${esc(t('chat.rules'))}</p><button class="primary" id="join-live" data-chat-action="join-live">${esc(t('room.joinTalk'))}</button></div>`}`);
  if (canPost) {
    $('#chat-form').onsubmit = e => { e.preventDefault(); send(); };
    $('#chat-text').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
  }
  try {
    if (canPost) {
      chat.nickname = await joinRoom(secret, room.id);
      if (!homeJoined.some(j => j.room_id === room.id)) homeJoined = [{room_id: room.id, last: null}, ...homeJoined];
      track('chat_join', null, {room: room.id});
    }
    chat.messages = await fetchMessages(room.id);
  } catch { $('#chat-log').innerHTML = `<p class="empty">${esc(t('chat.loadFailed'))}</p>`; return; }
  renderLog(true);
  startPolling();
}
const SEEN_KEY = 'seoulbeauty-seen-v1';
const readSeen = () => { try { return JSON.parse(storage.getItem(SEEN_KEY)) || {}; } catch { return {}; } };
function markSeen(roomId, iso) {
  const seen = readSeen(); if (!iso || (seen[roomId] ?? '') >= iso) return;
  try { storage.setItem(SEEN_KEY, JSON.stringify({...seen, [roomId]: iso})); } catch {}
}
export const hasNewSince = (last, seenIso) => Boolean(last?.created_at && seenIso && last.created_at > seenIso);
function renderLog(scroll) {
  const log = $('#chat-log'); if (!log) return;
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  const list = visible(chat.messages, readBlocked(storage));
  if (chat.room && chat.messages.length) markSeen(chat.room.id, chat.messages.at(-1).created_at);
  const byId = new Map(list.map(m => [m.id, m])); // quotes of blocked authors are hidden too
  log.innerHTML = list.length ? list.map(m => {
    const mine = m.author_tag === chat.myTag, parent = m.reply_to ? byId.get(m.reply_to) : null;
    const replies = list.filter(x => x.reply_to === m.id).length;
    return `<article class="chat-msg${mine ? ' mine' : ''}" data-id="${m.id}">${mine ? '' : `<img class="msg-avatar" src="avatars/avatar-${avatarIndex(m.author_tag)}.webp" alt="" width="52" height="52">`}<div class="msg-main"><div class="msg-meta">${mine ? '' : `<b class="chat-nick">${esc(m.nickname)}</b>`}<time>${esc(timeAgo(m.created_at))}</time><button class="chat-menu" data-chat-menu="${m.id}" aria-label="${esc(t('chat.more'))}">⋯</button></div>${parent || m.body ? `<div class="chat-bubble">${parent ? `<blockquote>${esc(parent.nickname)}: ${esc(parent.body || parent.item?.name || '')}</blockquote>` : ''}${m.body ? `<p>${esc(m.body)}</p>` : ''}</div>` : ''}${m.item ? itemCard(m.item, 'chat-' + m.id) : ''}${m.likes || replies ? `<div class="msg-pills"><button class="pill${m.likes ? ' on' : ''}" data-chat-like="${m.id}" aria-label="${esc(t('chat.like'))}">♥ ${m.likes || 0}</button>${replies ? `<button class="pill" data-chat-reply="${m.id}" aria-label="${esc(t('chat.reply'))}">💬 ${replies}</button>` : ''}</div>` : ''}</div></article>`;
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
  const box = $('#chat-text'); const text = box.value.trim();
  if (chat.sending || (!text && !chat.item)) return;
  chat.sending = true;
  try {
    const m = await postMessage(secret, chat.room.id, text, chat.item, chat.replyTo);
    if (!chat.messages.some(x => x.id === m.id)) chat.messages.push(m);
    track('chat_send', null, {room: chat.room.id, item: chat.item ? 1 : 0, reply: chat.replyTo ? 1 : 0});
    box.value = ''; chat.item = null; chat.replyTo = null; renderContext(); renderLog(true);
  } catch (e) { toast(t(errorKey(e.message))); }
  finally { chat.sending = false; }
}
function startPolling() {
  stopPolling();
  chat.poll = setInterval(async () => {
    if (!chat.room || document.hidden || view.mode !== 'live') return;
    const last = chat.messages.at(-1)?.id ?? 0;
    try {
      const fresh = (await fetchMessages(chat.room.id, last)).filter(m => !chat.messages.some(x => x.id === m.id));
      if (fresh.length) { chat.messages.push(...fresh); renderLog(false); }
    } catch {}
  }, 4000);
}
function stopPolling() { clearInterval(chat.poll); chat.poll = null; }

// Item picker shared by chat messages, comments and new posts.
let pickTimer, pickSeq = 0, picked = [];
function openPicker(target) {
  pickFor = target;
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
function picked1(i) {
  const it = picked[i]; $('#chat-pick').close();
  if (pickFor === 'comment') { view.commentItem = it; renderPost(); $('#comment-text')?.focus(); }
  else if (pickFor === 'write') { view.draft.item = it; renderWrite(); }
  else { chat.item = it; renderContext(); $('#chat-text')?.focus(); }
}

// Menus: chat messages (reply / save as post for mine / report / block) and posts or comments (report / block).
let menuTarget = null;
function openMenu(id) {
  chat.menuFor = chat.messages.find(m => m.id === id); if (!chat.menuFor) return;
  const mine = chat.menuFor.author_tag === chat.myTag; menuTarget = {type: 'chat', id};
  $('#chat-menu').innerHTML = `<div class="chat-menu-list"><button data-chat-action="reply">${esc(t('chat.reply'))}</button><button data-chat-like="${id}">${esc(t('chat.like'))}</button>${mine ? `<button data-chat-action="save-as-post">${esc(t('community.saveAsPost'))}</button>` : `<button data-chat-action="report">${esc(t('chat.report'))}</button><button data-chat-action="block">${esc(t('chat.block'))}</button>`}<button data-chat-action="menu-close">${esc(t('cancel'))}</button></div>`;
  $('#chat-menu').showModal();
}
function openCommunityMenu(spec) {
  const [type, id] = spec.split(':'); const list = type === 'post' ? [view.post] : view.comments;
  const target = list.find(x => x && x.id === +id); if (!target) return;
  menuTarget = {type, id: +id, author: target.author_tag};
  $('#chat-menu').innerHTML = `<div class="chat-menu-list"><button data-chat-action="report">${esc(t('chat.report'))}</button><button data-chat-action="block">${esc(t('chat.block'))}</button><button data-chat-action="menu-close">${esc(t('cancel'))}</button></div>`;
  $('#chat-menu').showModal();
}
function openReport() {
  $('#chat-menu').innerHTML = `<h2>${esc(t('chat.reportTitle'))}</h2><div class="chat-menu-list">${['spam', 'abuse', 'sexual', 'other'].map(r => `<button data-chat-report="${r}">${esc(t('chat.reason.' + r))}</button>`).join('')}<button data-chat-action="menu-close">${esc(t('cancel'))}</button></div>`;
}

// "People talking about this" for a product sheet / detail page.
export async function renderProductTalk(box, familyKey) {
  if (!box || !familyKey) return;
  box.innerHTML = `<h3 class="chat-section">${esc(t('product.reviews'))}</h3>${loadingMarkup(t('loading'))}`;
  let talk; try { talk = await fetchProductTalk(familyKey); } catch { box.innerHTML = ''; return; }
  talkState = {box, talk}; talkFilter = {}; drawTalk();
}
// Filter reviews by the conditions writers chose to show (skin type / tone); a reference, not a promise.
let talkState = null, talkFilter = {};
function drawTalk() {
  if (!talkState) return; const {box, talk} = talkState;
  const all = visiblePosts(talk.reviews), reviews = filterReviews(all, talkFilter), posts = visiblePosts(talk.posts);
  const chips = (key, prefix) => [...new Set(all.map(r => r[key]).filter(Boolean))].map(v => `<button data-review-filter="${key}:${v}" class="${talkFilter[key] === v ? 'on' : ''}">${esc(t(prefix + '.' + v))}</button>`).join('');
  const me = cachedProfile(), mine = me && (me.skin_type || me.skin_tone);
  // "People like me" applies the person's own self-reported skin; without a profile it invites them to add one.
  const similar = !all.length ? '' : mine ? `<button data-review-similar class="${talkFilter.skin_type === (me.skin_type ?? '') && talkFilter.skin_tone === (me.skin_tone ?? '') ? 'on' : ''}">${esc(t('profile.similar'))}</button>` : `<button data-profile-open>${esc(t('profile.similarAdd'))}</button>`;
  const filters = similar + chips('skin_type', 'skin') + chips('skin_tone', 'tone');
  box.innerHTML = `<h3 class="chat-section">${esc(t('product.reviews'))} ${all.length ? `<em>${all.length}</em>` : ''}</h3>${filters ? `<div class="chat-chips review-filter">${filters}</div><p class="similar-note">${esc(t('product.similarNote'))}</p>` : ''}${reviews.length ? reviews.map(postRow).join('') : `<p class="empty talk-empty">${esc(t('product.reviewsEmpty'))}</p>`}<h3 class="chat-section">${esc(t('product.related'))}</h3>${posts.map(postRow).join('')}${talk.chatMentions ? `<p class="talk-chat">${esc(t('product.inChat'))} · ${talk.chatMentions}</p>` : ''}${!posts.length && !talk.chatMentions ? `<p class="empty talk-empty">${esc(t('product.talkEmpty'))}</p>` : ''}`;
}
// A post tapped outside the community (product sheet, detail page) opens there next time the screen opens.
// "Start a conversation": pick a topic in a sheet, then go straight to the write form for it.
function openStart() {
  let dlg = $('#chat-start'); if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'chat-start'; dlg.className = 'chat-dialog chat-start'; document.body.append(dlg); }
  const topics = chat.rooms.filter(r => r.kind !== 'brand').sort((a, b) => a.sort - b.sort);
  dlg.innerHTML = `<form method="dialog"><button class="close-dialog" aria-label="${esc(t('close'))}">×</button></form><h2>${esc(t('home.ask'))}</h2><p class="chat-sub">${esc(t('home.askHint'))}</p>${canCreateRooms(chat.rooms) ? `<button class="write-btn" data-chat-action="create-room">+ ${esc(t('room.new'))}</button>` : ''}${topics.map(r => roomRow(r).replace('data-chat-room=', 'data-chat-start=')).join('')}`;
  dlg.showModal();
}
// Free room creation: any subject. Field and concern tags are optional and only help others find the room.
const ROOM_TAGS = ['talk', 'skin', 'makeup'], TAG_GROUP = {skin: 'skincare', makeup: 'makeup'};
const newRoom = {tag: 'talk', concerns: [], title: '', intro: '', error: '', busy: false};
function openCreateRoom() {
  $('#chat-start')?.open && $('#chat-start').close();
  const sel = readInterests();
  newRoom.tag = sel?.skincare && !sel.makeup ? 'skin' : sel?.makeup && !sel.skincare ? 'makeup' : 'talk';
  Object.assign(newRoom, {concerns: [...(sel?.concerns ?? [])], title: '', intro: '', error: '', busy: false});
  let dlg = $('#room-create'); if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'room-create'; dlg.className = 'chat-dialog post-write room-create'; dlg.setAttribute('aria-labelledby', 'room-create-title'); document.body.append(dlg); }
  renderCreateRoom(); dlg.showModal(); $('#room-title').focus();
}
const keepRoomText = () => { newRoom.title = $('#room-title')?.value ?? newRoom.title; newRoom.intro = $('#room-intro')?.value ?? newRoom.intro; };
function renderCreateRoom() {
  const group = TAG_GROUP[newRoom.tag], offered = CONCERNS.filter(c => !group || c.group === group);
  newRoom.concerns = newRoom.concerns.filter(id => offered.some(c => c.id === id));
  const chip = (attr, id, on, label) => `<button type="button" ${attr}="${id}" aria-pressed="${on}" class="${on ? 'on' : ''}">${esc(label)}</button>`;
  $('#room-create').innerHTML = `<form method="dialog"><button class="close-dialog" aria-label="${esc(t('close'))}">×</button></form><h2 id="room-create-title">${esc(t('room.new'))}</h2><p class="chat-sub">${esc(t('room.newHint'))}</p><input id="room-title" maxlength="40" autocomplete="off" aria-label="${esc(t('room.titlePh'))}" placeholder="${esc(t('room.titlePh'))}" value="${esc(newRoom.title)}"><textarea id="room-intro" rows="2" maxlength="120" aria-label="${esc(t('room.introPh'))}" placeholder="${esc(t('room.introPh'))}">${esc(newRoom.intro)}</textarea><p class="write-label">${esc(t('room.field'))}</p><div class="chat-chips" role="group" aria-label="${esc(t('room.field'))}">${ROOM_TAGS.map(tag => chip('data-room-tag', tag, newRoom.tag === tag, t('room.tag.' + tag))).join('')}</div><p class="write-label">${esc(t('room.concerns'))}</p><div class="chat-chips room-concerns" role="group" aria-label="${esc(t('room.concerns'))}">${offered.map(c => chip('data-room-concern', c.id, newRoom.concerns.includes(c.id), t('onb.c.' + c.id))).join('')}</div><p class="write-note">${esc(t('room.note'))}</p><p class="write-warn" id="room-error" role="alert">${esc(newRoom.error)}</p><button class="primary" data-chat-action="room-submit" ${newRoom.busy ? 'disabled' : ''}>${esc(t('room.create'))}</button>`;
}
async function submitRoom() {
  keepRoomText();
  if (newRoom.title.trim().length < 3) { newRoom.error = t('chat.err.short'); renderCreateRoom(); $('#room-title').focus(); return; }
  newRoom.busy = true; newRoom.error = ''; renderCreateRoom();
  try {
    const id = await createRoom(secret, newRoom);
    chat.rooms = await fetchRooms().catch(() => chat.rooms);
    $('#room-create').close(); toast(t('room.created'));
    const room = chat.rooms.find(r => r.id === id);
    if (room) { chat.room = room; joinedRooms.add(room.id); openTopic(room, 'live'); } else renderHome();
  } catch (e) { newRoom.busy = false; newRoom.error = t(errorKey(e.message)); renderCreateRoom(); }
}
const avatarIndex = tag => [0xF4A3A8, 0x9CC3F5, 0xF7C873, 0x9FD8B8, 0xC8B5F2, 0xF5B38A][[...String(tag ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 6] % 5 + 1;
const AVATAR_COLORS = ['#f4a3a8', '#9cc3f5', '#f7c873', '#9fd8b8', '#c8b5f2', '#f5b38a'];
const avatarColor = tag => AVATAR_COLORS[[...String(tag ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLORS.length];
let pendingPost = null;
export const openPostNext = id => { pendingPost = id; };
let pendingRoom = null;
export const openRoomNext = id => { pendingRoom = id; };

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.chatAction;
  if (a === 'rooms') renderHome();
  else if (a === 'resume') renderJoined();
  else if (b.hasAttribute('data-home-brands-retry')) { homeBrands = null; drawHome(); }
  else if (b.dataset.homeTab) { homeTab = b.dataset.homeTab; document.querySelectorAll('[data-home-tab][role=tab]').forEach(x => { const on = x.dataset.homeTab === homeTab; x.setAttribute('aria-selected', on); x.classList.toggle('on', on); }); drawHome(); }
  else if (a === 'join-room') { const r = chat.room; if (hasAgreed(storage)) { joinedRooms.add(r.id); openTopic(r, 'live'); } else askJoin(r, () => { joinedRooms.add(r.id); openTopic(r, 'live'); }); }
  else if (a === 'join-live') { agree(storage); joinedRooms.add(chat.room.id); openTopic(chat.room, 'live'); }
  else if (a === 'room-more') { const m = $('#room-menu'); if (m) { m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); } }
  else if (b.dataset.chatReply) { chat.replyTo = +b.dataset.chatReply; renderContext(); $('#chat-text')?.focus(); }
  else if (a === 'share-room' && chat.room) share({title: roomTitle(chat.room), url: shareUrl({room: chat.room.id})}, toast);
  else if (a === 'find-topic') openStart();
  else if (a === 'create-room') openCreateRoom();
  else if (a === 'room-submit') submitRoom();
  else if (b.dataset.roomTag) { keepRoomText(); newRoom.tag = b.dataset.roomTag; renderCreateRoom(); $(`[data-room-tag="${newRoom.tag}"]`).focus(); }
  else if (b.dataset.roomConcern) { keepRoomText(); const id = b.dataset.roomConcern; newRoom.concerns = newRoom.concerns.includes(id) ? newRoom.concerns.filter(c => c !== id) : [...newRoom.concerns, id]; renderCreateRoom(); $(`[data-room-concern="${id}"]`).focus(); }
  else if (b.dataset.chatStart) { const room = chat.rooms.find(r => r.id === b.dataset.chatStart); $('#chat-start').close(); if (room) { chat.room = room; askJoin(room, () => openWrite()); } }
  else if (a === 'topic') openTopic(chat.room, 'posts');
  else if (b.dataset.topicMode) openTopic(chat.room, b.dataset.topicMode);
  else if (a === 'join-cancel') $('#chat-join').close();
  else if (a === 'join-ok') { agree(storage); $('#chat-join').close(); joinThen(); }
  else if (a === 'write') askJoin(chat.room, () => openWrite());
  else if (b.dataset.writeUsed) { keepDraftText(); view.draft.usedFor = view.draft.usedFor === b.dataset.writeUsed ? '' : b.dataset.writeUsed; renderWrite(); }
  else if (b.dataset.writeField) { keepDraftText(); const f = b.dataset.writeField; view.draft[f] = view.draft[f] === b.dataset.value ? '' : b.dataset.value; renderWrite(); }
  else if (b.hasAttribute('data-review-similar')) { const me = cachedProfile() ?? {}, on = talkFilter.skin_type === (me.skin_type ?? '') && talkFilter.skin_tone === (me.skin_tone ?? ''); talkFilter.skin_type = on ? '' : me.skin_type ?? ''; talkFilter.skin_tone = on ? '' : me.skin_tone ?? ''; drawTalk(); }
  else if (b.dataset.reviewFilter) { const [k, v] = b.dataset.reviewFilter.split(':'); talkFilter[k] = talkFilter[k] === v ? '' : v; drawTalk(); }
  else if (b.dataset.writePhotoRemove) { keepDraftText(); view.draft.photos.splice(+b.dataset.writePhotoRemove, 1); renderWrite(); }
  else if (b.dataset.writeKind) { keepDraftText(); view.draft.kind = b.dataset.writeKind; renderWrite(); }
  else if (b.dataset.writeReason) { keepDraftText(); const r = b.dataset.writeReason; view.draft.reasons = view.draft.reasons.includes(r) ? view.draft.reasons.filter(x => x !== r) : [...view.draft.reasons, r]; renderWrite(); }
  else if (a === 'attach-write') { keepDraftText(); openPicker('write'); }
  else if (a === 'write-item-cancel') { keepDraftText(); view.draft.item = null; renderWrite(); }
  else if (a === 'write-submit') { e.preventDefault(); submitPost(); }
  else if (a === 'attach') openPicker('chat');
  else if (a === 'attach-comment') askJoin(chat.room ?? {title_en: '', title_ko: '', intro_en: '', intro_ko: ''}, () => openPicker('comment'));
  else if (a === 'comment-item-cancel') { view.commentItem = null; renderPost(); }
  else if (a === 'reply-cancel') { chat.replyTo = null; renderContext(); }
  else if (a === 'item-cancel') { chat.item = null; renderContext(); }
  else if (a === 'menu-close') $('#chat-menu').close();
  else if (a === 'reply') { chat.replyTo = chat.menuFor.id; $('#chat-menu').close(); renderContext(); $('#chat-text').focus(); }
  else if (a === 'save-as-post') { const m = chat.menuFor; $('#chat-menu').close(); openWrite({kind: 'recommend', title: m.body.slice(0, 60), body: m.body, item: m.item, fromMessage: m.id}); }
  else if (a === 'report') openReport();
  else if (a === 'block') {
    block(storage, menuTarget.type === 'chat' ? chat.menuFor.author_tag : menuTarget.author); $('#chat-menu').close();
    if (menuTarget.type === 'chat') renderLog(false); else if (menuTarget.type === 'post') openTopic(chat.room ?? chat.rooms[0], 'posts'); else renderPost();
    toast(t('chat.blocked'));
  }
  else if (b.dataset.chatReport) {
    $('#chat-menu').close();
    try {
      if (menuTarget.type === 'chat') await reportMessage(secret, chat.menuFor.id, b.dataset.chatReport);
      else await reportCommunity(secret, menuTarget.type, menuTarget.id, b.dataset.chatReport);
      toast(t('chat.reported'));
    } catch { toast(t('chat.err.other')); }
  }
  else if (b.dataset.chatRoom) { const r = chat.rooms.find(x => x.id === b.dataset.chatRoom); if (r) openTopic(r, 'live'); }
  else if (b.dataset.post && $('#chat') && !$('#chat').hidden) openPost(+b.dataset.post);
  else if (b.dataset.chatPick) picked1(+b.dataset.chatPick);
  else if (b.dataset.chatMenu) openMenu(+b.dataset.chatMenu);
  else if (b.dataset.communityMenu) openCommunityMenu(b.dataset.communityMenu);
  else if (b.dataset.communitySave && view.post) { toggleSavedPost(view.post); renderPost(); }
  else if (b.dataset.chatLike) {
    const id = +b.dataset.chatLike;
    if ($('#chat-menu')?.open) $('#chat-menu').close();
    try { const n = await likeMessage(secret, id); const m = chat.messages.find(x => x.id === id); if (m) m.likes = n; renderLog(false); } catch { toast(t('chat.err.other')); }
  }
  else if (b.dataset.communityLike) {
    const [type, id] = b.dataset.communityLike.split(':');
    try { const n = await likeCommunity(secret, type, +id); const x = type === 'post' ? view.post : view.comments.find(c => c.id === +id); if (x) x.likes = n; renderPost(); } catch { toast(t('chat.err.other')); }
  }
});

// Rooms and their pictures for the first-visit flow (onboarding.js).
export async function onboardingData() {
  const rooms = chat.rooms.length ? chat.rooms : (chat.rooms = await fetchRooms());
  const pics = await loadCatalogPictures(rooms).catch(() => null);
  return {rooms, pictures: pics ? topicPictures(rooms.filter(r => r.kind !== 'brand'), pics.byCategory) : new Map()};
}
export const openRoomById = id => { pendingRoom = id; };
