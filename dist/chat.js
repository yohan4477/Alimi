import {shouldSuggestSetup,snoozeSetup} from './onboarding-nudge.js';
import {region, inRegion} from './region.js';
import {regionButton} from './region-picker.js';
import {findProductRooms,productRoomGroups} from './room-search.js';
import {productSortControls,rankProducts,aggregateProductStats} from './product-sort.js';
// Temporarily disabled for the anonymous SeoulBeauty community.
import {loadingMarkup} from './loading-companion.js';
import {createDemoChatStore} from './demo-chat-store.js';
import {demoRooms, demoMessages, demoEntries, createDemoProductRoom} from './demo-fixtures.js';
import {beginStartupLoading} from './startup-loading.js';
import {share, shareUrl} from './share.js';
// Community screen: topics → each topic has Posts (questions / recommendations / reviews with comments)
// and Live chat, kept in separate views. Product cards are the shared link: the same card in a post,
// comment or chat message opens the same product sheet and carries the source as Awin clickref.
// Live chat polls every few seconds while open.
import {reviewPrefill, saveFromReview, cachedProfile} from './profile.js';
import {activeRooms, mentionedProducts} from './community-home.js';
import {roomImages, roomListCard, roomThumb, roomCategory, topicPictures, pickCard, memberLine, concernsOf, roomTags} from './room-card.js';
import {exploreRow} from './explore.js';
import {loadRevisit, joinedCard, ago as timeAgo} from './revisit.js';
import {readInterests, recommendRooms, CONCERNS, canCreateRooms} from './onboarding.js';
import {track} from './events.js';
import {t, locale} from './i18n.js';
import {searchCatalog, brandLabel, usd, brandInitials, brandColor, fetchBrands, fetchFamiliesPage} from './live.js';
import {chatSecret, readBlocked, block, hasAgreed, agree, roomTitle, roomIntro, visible, errorKey,
  fetchRooms, createRoom, fetchMessages, fetchMyRooms, postMessage, likeMessage, reportMessage} from './chat-api.js';
import {KINDS, REASONS, USED_FOR, SKIN_TYPES, SKIN_TONES, UNDERTONES, CLIMATES, filterReviews, photoUrl, reviewPayload, uploadPhoto, ago, fetchPosts, fetchPost, fetchComments, fetchProductTalk, createPost, addComment, likeCommunity, reportCommunity} from './community-api.js';

import {$, esc} from './util.js';
let storage; try { storage = localStorage; } catch {}
const secret = chatSecret(storage);
const demoChat = createDemoChatStore(storage);
const likedKey = 'seoulbeauty-chat-hearts-' + secret;
let liked; try { liked = new Set(JSON.parse(storage.getItem(likedKey)) || []); } catch { liked = new Set(); }
const liking = new Set();
let unreadMessages = 0;
const chat = {rooms: [], room: null, messages: [], nickname: '', myTag: '', item: null, replyTo: null, menuFor: null, poll: null, sending: false};
const view = {mode: 'posts', post: null, comments: [], commentItem: null, draft: null};
let onClose = () => {}, toast = () => {}, pickFor = 'chat';
// Keep unsent content in memory while moving between rooms; never send it to analytics.
const roomDrafts = new Map();
function rememberDraft(){
  if(chat.room&&$('#chat-text'))roomDrafts.set(chat.room.id,{text:$('#chat-text').value,item:chat.item,replyTo:chat.replyTo});
}


async function tagOf(s) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
const time = iso => new Intl.DateTimeFormat(locale(), {hour: '2-digit', minute: '2-digit'}).format(new Date(iso));
// "3시간 전" / "3 hours ago" for the last activity of a room.
export function relTime(iso, now = Date.now()) {
  const at = Date.parse(iso ?? ''); if (!Number.isFinite(at)) return '';
  const s = Math.max(0, (now - at) / 1000), f = new Intl.RelativeTimeFormat(locale(), {numeric: 'auto'});
  return s < 60 ? f.format(0, 'second') : s < 3600 ? f.format(-Math.floor(s / 60), 'minute') : s < 86400 ? f.format(-Math.floor(s / 3600), 'hour') : f.format(-Math.floor(s / 86400), 'day');
}
// ref = where the card was seen ("post-12", "comment-4", "chat-88"); passed on to the product sheet / Awin.
const itemCard = (it, ref = '') => it.demo ? `<button class="chat-item" data-demo-product="${esc(it.label)}">${it.image_url ? `<img src="${esc(it.image_url)}" alt="${esc(it.name)}" loading="lazy">` : '<span class="no-photo"></span>'}<span><small>${esc(it.brand)} · ${esc(t('rooms.demoProducts'))}</small><b>${esc(it.name)}</b></span></button>` : `<button class="chat-item" ${it.family_key ? `data-family="${esc(it.family_key)}" data-sku="${esc(it.sku)}" data-retailer="${esc(it.retailer)}" data-market="${esc(it.market)}"` : `data-chat-product="${esc(JSON.stringify(it))}"`} data-ref="${esc(ref)}">${it.image_url ? `<img src="${esc(it.image_url)}" alt="" loading="lazy">` : '<span class="no-photo"></span>'}<span><small>${esc(brandLabel({brand: it.brand, brandKo: it.brand_ko}))}</small><b>${esc(it.name)}</b><em>${esc(t('chat.sharedPrice', {v: usd(it.price_minor / 100)}))}</em></span></button>`;
const shell = inner => { $('#chat').innerHTML = inner; };
const body = inner => { const b = $('#topic-body'); if (b) b.innerHTML = inner; };

const communityModeKey = 'seoulbeauty-community-mode';
const modeQuery = new URLSearchParams(globalThis.location?.search ?? '');
let savedMode; try { savedMode = storage?.getItem(communityModeKey); } catch {}
let demoActive = modeQuery.has('demo') ? modeQuery.get('demo') === '1' : savedMode === 'offline';
function saveCommunityMode() {
  try { storage?.setItem(communityModeKey, demoActive ? 'offline' : 'online'); } catch {}
  // Keep reloads and region/language navigation in the selected mode too.
  try {
    const url = new URL(globalThis.location.href);
    url.searchParams.set('demo', demoActive ? '1' : '0');
    globalThis.history.replaceState(globalThis.history.state, '', url);
  } catch {}
}
if (modeQuery.has('demo')) saveCommunityMode();
let firstCommunityLoad = true, communityOpenVersion = 0;
let finishStartup = () => {};
export async function openChat(opts = {}) {
  const version = ++communityOpenVersion;
  const initial = firstCommunityLoad;
  firstCommunityLoad = false;
  onClose = opts.onClose ?? onClose; toast = opts.toast ?? toast;
  chat.myTag ||= await tagOf(secret);
  if (version !== communityOpenVersion) return;
  track('community_open', null);
  if (pendingPost) { const id = pendingPost; pendingPost = null; if (!chat.rooms.length) chat.rooms = await fetchRooms().catch(() => []); chat.room = null; openPost(id); return; }
  if (pendingRoom) { if (!chat.rooms.length) chat.rooms = demoActive ? demoRooms : await fetchRooms().catch(() => []); const r = chat.rooms.find(r => r.id === pendingRoom); pendingRoom = null; if (r) { openTopic(r, 'live'); return; } }
  const showLaunch = initial && readInterests()?.done;
  const finish = showLaunch ? beginStartupLoading({label: t('loading'), line1: t('splash.line1'), line2: t('splash.line2')}) : () => {};
  finishStartup = finish;
  if (!keepHomeTab) homeTab = 'rec';
  keepHomeTab = false;
  try { await renderHome(); } finally { finish(); }
}
// Inside a room the composer gets the bottom of the screen: the tab bar hides (style.css).
function inRoom(on) { if (on) document.documentElement.dataset.room = '1'; else delete document.documentElement.dataset.room; }
// Called when the user switches to another tab: stop polling until the community screen is opened again.
export function leaveChat() { rememberDraft(); communityOpenVersion++; finishStartup(); stopPolling(); chat.room = null; inRoom(false); }
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
  comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  notice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3l6 4V6L7 10zM16 9a4 4 0 0 1 0 6"/></svg>',
  reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4 16-4-6.5z"/><path d="m12 13.5 8-9.5"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5-8 9.5z"/></svg>'
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
const reviewFacts = p => p.kind !== 'review' ? '' : `<div class="reason-chips review-facts">${p.sponsored ? `<span class="sponsored">${esc(t('review.sponsoredTag'))}</span>` : ''}${p.used_for ? `<span>${esc(t('review.used.' + p.used_for))}</span>` : ''}${p.skin_type ? `<span>${esc(t('skin.' + p.skin_type))}</span>` : ''}${p.skin_tone ? `<span>${esc(t('review.tone'))}: ${esc(t('tone.' + p.skin_tone))}</span>` : ''}${p.undertone ? `<span>${esc(t('under.' + p.undertone))}</span>` : ''}${p.goal ? `<span>${esc(p.goal)}</span>` : ''}</div>`;
// The writer's own past purchase, clearly labelled and kept apart from the app's current retailer button.
const buyerInfo = p => {
  const parts = [p.bought_where, p.bought_price_minor ? usd(p.bought_price_minor / 100) : null, p.ship_country && p.ship_days != null ? t('review.shipped', {country: p.ship_country, days: p.ship_days}) : p.ship_country].filter(Boolean);
  return parts.length ? `<div class="buyer-info"><small>${esc(t('review.buyerInfo'))}</small><p>${esc(parts.join(' · '))}</p></div>` : '';
};
export const postRow = p => `<button class="post-row" data-post="${p.id}"><span class="post-main"><span class="post-kind k-${esc(p.kind)}">${esc(t('community.kind.' + p.kind))}</span><b>${esc(p.title)}</b><small>${esc(p.nickname)} · ${esc(ago(p.created_at))} · ${icon.comment} ${p.comments}</small></span>${p.photos?.[0] ? `<img src="${esc(photoUrl(p.photos[0]))}" alt="" loading="lazy">` : p.item?.image_url ? `<img src="${esc(p.item.image_url)}" alt="" loading="lazy">` : ''}</button>`;

// Community home (journey reference): Seoul Beauty header, 추천 / 대화방 / 발견 tabs.
// 추천: guide, trending rooms with a real product picture, recommended rooms. 발견: products and questions
// from conversations. Every number shown is a real count from the fetched sample.
const HOME_TABS = ['rec', 'rooms', 'discover'];
let topicRoomLimit = 3, productGroupLimit = 3;
let homeVersion = 0, homeTab = 'rec', home = null, catalogPics = null;
let roomFindMode = new URLSearchParams(globalThis.location?.search ?? '').get('productRooms') === '1' ? 'products' : 'topics', productRoomQuery = '', selectedProductGroup = null;
let keepHomeTab = false;
export function openProductRoomsNext(query = '') {
  pendingRoom = null; pendingPost = null; homeTab = 'rooms'; keepHomeTab = true; roomFindMode = 'products'; productRoomQuery = String(query).trim(); selectedProductGroup = null;
}
export function openRoomListNext() {
  pendingRoom = null; pendingPost = null; homeTab = 'rooms'; keepHomeTab = true; roomFindMode = 'topics'; productRoomQuery = ''; selectedProductGroup = null;
}
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
  rememberDraft(); stopPolling(); chat.room = null; view.post = null; inRoom(false);
  // Journey 1 home: wordmark left, alerts / search right, hero, then trending conversations. No sub-tabs:
  // topic / product / brand browsing lives in the 탐색 tab; 대화방 and 발견 open as sub-pages with a back button.
  shell(`<div class="logo-head sb-head"><img class="sb-logo" src="assets/seoul-beauty-logo.webp" alt="Seoul Beauty" width="200" height="60"><span class="sb-head-actions"><button class="demo-toggle" data-chat-action="toggle-demo" aria-pressed="${demoActive}">${demoActive ? 'offline' : 'online'}</button><button class="icon-btn home-alerts" data-screen="alerts" aria-label="${esc(t('alerts.title'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></button><button class="icon-btn" data-screen="search" aria-label="${esc(t('search.title'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button></span></div><div class="service-context">${regionButton()}</div><div class="chat-rooms" id="community-home">${loadingMarkup(t('loading'))}</div><button class="start-conversation" data-chat-action="create-room" ${demoActive ? 'hidden disabled' : ''}>＋ ${esc(t('room.new'))}</button>`);


  if (demoActive) {
    chat.rooms = demoRooms;
    const entries = demoEntries();
    home = {hot:demoRooms.slice(0,6),topics:demoRooms,recent:[],previews:new Map(demoRooms.map(r => [r.id, demoMessages[r.id]?.at(-1)?.body ?? ''])),partial:false,joined:[],images:roomImages(entries),products:mentionedProducts(entries)};
    drawHome();
    return;
  }
  let posts = [], joined = [], postsFailed = false;
  try { [chat.rooms, posts, joined] = await Promise.all([fetchRooms(), fetchPosts(null, 40).catch(() => { postsFailed = true; return []; }), fetchMyRooms(chat.myTag).catch(() => [])]); }
  catch { if (version === homeVersion && $('#community-home')) $('#community-home').innerHTML = `<p class="empty">${esc(t('home.retry'))}</p><button data-chat-action="rooms">${esc(t('retry'))}</button>`; return; }
  if (version !== homeVersion || !$('#community-home')) return;
  const scopedPosts = posts.filter(p=>chat.rooms.some(r=>r.id===p.room_id));
  const recent = visiblePosts(scopedPosts), hot = activeRooms(chat.rooms), topics = chat.rooms.filter(r => r.kind !== 'brand').sort((a,b) => a.sort-b.sort);
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
// Home list row (journey 1): picture, title, latest line, real members and last activity.
const hotRow = (r, image, note) => `<button class="hot-row" data-chat-room="${esc(r.id)}"${r.messages_24h > 0 ? ' data-live="1"' : ''}>${roomThumb(r, image)}<span class="hot-text"><b>${esc(roomTitle(r))}</b>${note ? `<small>${esc(note)}</small>` : ''}<span class="hot-meta"><span>${icon.people}${esc(t('room.joined', {n: r.members ?? 0}))}</span>${r.last_message_at ? `<span>${icon.clock}${esc(relTime(r.last_message_at))}</span>` : ''}</span></span></button>`;
const homeHero = () => `<section class="home-hero"><div class="home-hero-text"><h1>${esc(t('home.hero.title'))}</h1><p>${esc(t('home.hero.sub'))}</p><button class="hero-cta" data-screen="search">${esc(t('home.hero.cta'))}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div><img src="assets/splash-photo.webp" alt="" width="196" height="236"></section>`;
const bigHead = (title, sub, more = 'data-home-tab="rooms"') => `<div class="big-head-row"><div><h2 class="big-head">${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div><button class="text-link" ${more}>${esc(t('home.seeAll'))} ›</button></div>`;
const sectionHead = (title, sub, more = '') => `<div class="section-head"><div><h2 class="chat-section">${esc(title)}</h2>${sub ? `<p class="home-note">${esc(sub)}</p>` : ''}</div>${more}</div>`;
function drawHome() {
  const box = $('#community-home'); if (!box || !home) return;
  box.setAttribute('aria-labelledby', 'home-tab-' + homeTab);
  const {hot, topics, recent, previews, partial, joined, images, products} = home;
  if(region==='kr' && !demoActive && !chat.rooms.length) { box.innerHTML=`<p class="empty">${esc(t('region.krPending'))}</p><button data-service-region>${esc(t('region.open'))}</button>`; return; }
  if (homeTab === 'rec') {
    const interests = readInterests();
    const picks = interests?.done && (interests.skincare || interests.makeup) ? recommendRooms(chat.rooms, interests, 4).map(x => x.room) : (hot.length ? hot : topics).slice(0, 4);
    const mine = home.revisit?.activity?.length ? sectionHead(t('rooms.mine'), '', `<button class="text-link" data-screen="rooms">${esc(t('home.seeAll'))} ›</button>`) + home.revisit.activity.slice(0, 2).map(a => joinedCard(a, images.get(a.room.id))).join('') : '';
    const seeAll = `<button class="text-link" data-home-tab="rooms">${esc(t('home.seeAll'))} ›</button>`;
    const trend = hot.length ? sectionHead(t('home.hot'), '', seeAll) + hot.map(r => hotRow(r, images.get(r.id), previews.get(r.id) || roomIntro(r))).join('') : '';
    const pickIds = new Set(hot.map(r => r.id)), rest = picks.filter(r => !pickIds.has(r.id));
    box.innerHTML = `${homeHero()}${mine}${trend}${rest.length ? sectionHead(t('home.recRooms'), '', hot.length ? '' : seeAll) + rest.map(r => hotRow(r, images.get(r.id), roomIntro(r))).join('') : ''}${!hot.length ? `<p class="empty">${esc(t('home.quiet'))}</p>` : ''}<div class="home-links"><button class="text-link" data-home-tab="rooms">${esc(t('home.tab.rooms'))} ›</button><button class="text-link" data-home-tab="discover">${esc(t('home.mentioned'))} ›</button><button class="text-link edit-interests" data-onb-manage>${esc(t(interests?.skincare || interests?.makeup ? 'onb.edit' : 'onb.manage'))}</button></div>`;
    return;
  }
  const sub = key => `<div class="page-bar home-sub"><button class="icon-btn" data-home-tab="rec" aria-label="${esc(t('back'))}">${icon.back}</button><h1>${esc(t(key))}</h1></div>`;
  if (homeTab === 'rooms') {
    const productIds = new Set(productRoomGroups(topics, home.popular ?? []).flatMap(g => g.rooms.map(r => r.id)));
    const topicRooms = topics.filter(r => !productIds.has(r.id));
    box.innerHTML = `${sub('home.tab.rooms')}<section class="room-topic-section">${sectionHead(t('home.topics'), '')}${topicRooms.slice(0, topicRoomLimit).map(r => roomListCard(r, {image: images.get(r.id), note: previews.get(r.id) || roomIntro(r)})).join('') || `<p class="empty">${esc(t('home.quiet'))}</p>`}${topicRooms.length > topicRoomLimit ? `<button class="text-link" data-chat-action="more-topic-rooms">${locale().startsWith('ko') ? '더보기' : 'See more'} ›</button>` : ''}</section><section class="room-product-section">${sectionHead(t('rooms.byProduct'), '')}<label class="room-product-search"><span>${esc(t('rooms.productLabel'))}</span><input id="room-product-query" type="search" maxlength="200" autocomplete="off" placeholder="${esc(t('rooms.productPh'))}" value="${esc(productRoomQuery)}"></label><div id="product-room-results" aria-live="polite"></div></section>`;
    drawProductRooms();
  } else if (homeTab === 'discover') {
    const mentioned = products.length ? `<div class="mentioned-products">${rankProducts(products, undefined, demoActive ? aggregateProductStats(demoEntries()) : undefined).map(g => `<article>${itemCard(g.item, g.entries[0].source + '-' + g.entries[0].id)}<small>${esc(t('home.mentionCount',{people:g.authors.size,rooms:g.rooms.size}))}</small><button class="conversation-link" ${g.entries[0].source === 'post' ? `data-post="${g.entries[0].id}"` : `data-chat-room="${esc(g.entries[0].room_id)}" data-live="1"`}>${esc(t('home.viewConversation'))} ›</button></article>`).join('')}</div>` : `<p class="empty">${esc(t('home.noProducts'))}</p><button class="text-link" data-home-tab="rooms">${esc(t('home.topics'))} ›</button>`;
    const talk = `${sectionHead(t('home.mentioned'), t('home.scope'))}${productSortControls()}${partial ? `<p class="home-note" role="status">${esc(t('home.productsFailed'))}</p>` : ''}${mentioned}`;
    // Discovery reflects actual conversation mentions, including an honest empty state.
    box.innerHTML = `${sub('home.tab.discover')}${talk}${recent.length ? `<h2 class="chat-section">${esc(t('home.questions'))}</h2>${recent.slice(0,6).map(postRow).join('')}` : ''}`;

  }
}
function drawProductRooms() {
  const box = $('#product-room-results'); if (!box || !home) return;
  const query = productRoomQuery.trim(), all = productRoomGroups(home.topics, home.popular ?? []);
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const groups = all.filter(g => words.every(w => g.name.toLocaleLowerCase().includes(w)));
  const shownGroups = query ? groups : groups.slice(0, productGroupLimit);
  const selected = all.find(g => g.id === selectedProductGroup);
  const rooms = selected?.rooms ?? findProductRooms(home.topics, query);
  const create = query || selected ? `<button class="text-link product-room-create" data-chat-action="create-product-room">＋ ${esc(t('rooms.productCreate'))}</button>` : '';
  if (selected) {
    box.innerHTML = `<button class="text-link" data-chat-action="product-list-back">‹ ${esc(t('rooms.productAll'))}</button><h3 class="chat-section">${esc(selected.name)}</h3>${rooms.map(r => roomListCard(r, {attrs: `data-chat-room="${esc(r.id)}" data-live="1"`})).join('')}${create}`;
    return;
  }
  if (groups.length) {
    box.innerHTML = `${demoActive ? `<p class="home-note">${esc(t('rooms.demoProducts'))}</p>` : ''}<div class="product-room-list">${shownGroups.map(g => `<button class="product-room-row" data-product-room-group="${esc(g.id)}">${g.image_url ? `<img class="product-room-photo" src="${esc(g.image_url)}" alt="" loading="lazy">` : '<span class="product-room-photo" aria-hidden="true"></span>'}<span class="product-room-label"><b>${esc(g.name)}</b><small>${esc(t('rooms.productCount', {n:g.rooms.length}))}</small></span><i aria-hidden="true">›</i></button>`).join('')}</div>${!query && groups.length > productGroupLimit ? `<button class="text-link" data-chat-action="more-product-rooms">${locale().startsWith('ko') ? '더보기' : 'See more'} ›</button>` : ''}`;

  } else if (query && rooms.length) {
    box.innerHTML = `<p class="home-note">${esc(t('rooms.productCount', {n:rooms.length}))}</p>${rooms.map(r => roomListCard(r, {attrs: `data-chat-room="${esc(r.id)}" data-live="1"`})).join('')}${create}`;
  } else {
    box.innerHTML = `<p class="empty">${esc(t(query?'rooms.productEmpty':'rooms.noProductRooms'))}</p>${create}`;
  }
}
document.addEventListener('input', e => {
  if (e.target.id === 'room-product-query') { productRoomQuery = e.target.value; selectedProductGroup = null; drawProductRooms(); }
});
let homeJoined = [];
function renderJoined() {
  inRoom(false);
  shell(`<div class="page-bar"><button class="icon-btn" data-chat-action="rooms" aria-label="${esc(t('back'))}">${icon.back}</button><h1>${esc(t('activity.chats'))}</h1></div><div class="chat-rooms">${homeJoined.map(j => { const r=chat.rooms.find(r=>r.id===j.room_id);return r ? roomListCard(r, {image: home?.images.get(r.id), note: j.last?.body || roomIntro(r)}) : ''; }).join('')}</div>`);
}

export async function renderMyConversations(box) {
  box.innerHTML = `<h2>${esc(t('activity.chats'))}</h2><p class="home-note">${esc(t('loading'))}</p>`;
  try {
    const tag = chat.myTag || await tagOf(secret);
    const [rooms, joined] = await Promise.all([chat.rooms.length ? chat.rooms : fetchRooms(), fetchMyRooms(tag)]);
    if (!box.isConnected) return;
    box.innerHTML = `<h2>${esc(t('activity.chats'))}</h2>${joined.length ? joined.map(j => { const r=rooms.find(r=>r.id===j.room_id);return r ? roomListCard(r, {image: home?.images.get(r.id), note: j.last?.body || roomIntro(r), fresh: hasNewSince(j.last, readSeen()[r.id]), attrs: `data-open-room="${esc(r.id)}"`}) : ''; }).join('') : `<div class="activity-empty"><p>${esc(t('chat.mineEmpty'))}</p><button class="text-link" data-activity-browse="rooms">${esc(t('activity.browseRooms'))} ›</button></div>`}`;
  } catch { if(box.isConnected)box.innerHTML = `<p class="home-note">${esc(t('home.retry'))}</p>`; }
}

function askRules(room, then) {
  if (hasAgreed(storage)) { then(); return; }
  const dlg = $('#chat-join');
  dlg.innerHTML = `<h2>${esc(t('chat.rulesTitle'))}</h2><p class="chat-intro">${esc(roomIntro(room))}</p><p class="chat-rules">${esc(t('chat.rules'))}</p><div class="chat-join-actions"><button data-chat-action="join-cancel">${esc(t('cancel'))}</button><button class="primary" data-chat-action="join-ok">${esc(t('community.agree'))}</button></div>`;
  joinThen = then; dlg.showModal();
}
let joinThen = () => {};

// Topic: header + Posts / Live chat switch. The two never share one stream.
function openTopic(room, mode = 'live') {
  rememberDraft(); stopPolling(); chat.room = room; view.mode = mode; view.post = null; inRoom(true);
  const other = mode === 'posts' ? 'live' : 'posts';
  // Journey 3 room header: back, centred title with real member count, ⋯ menu (share / posts ↔ live).
  shell(`<div class="room-top"><button class="room-back" data-chat-action="rooms" aria-label="${esc(t('back'))}">${icon.back}</button><div class="room-top-text"><h1>${esc(roomTitle(room))}</h1><small class="room-count">${esc(t('room.joined', {n: room.members ?? 0}))}</small></div>${!room.demo ? `<div class="room-more-wrap"><button class="room-more" data-chat-action="room-more" aria-label="${esc(t('chat.more'))}" aria-expanded="false">${icon.more}</button><div class="room-menu" id="room-menu" hidden><button data-chat-action="share-room">${esc(t('share.room'))}</button><button data-topic-mode="${other}">${esc(t(other === 'posts' ? 'community.posts' : 'community.live'))}</button></div></div>` : '<span class="room-more-wrap" aria-hidden="true"></span>'}</div><${room.demo ? 'div' : 'button'} class="room-notice" ${room.demo ? '' : `data-topic-mode="${other}"`}><span class="room-notice-ico">${icon.notice}</span><span>${mode === 'posts' ? esc(t('community.live')) : `<b>${esc(t('room.noticeTitle'))}</b><small>${esc(roomIntro(room))}</small>`}</span>${room.demo ? '' : '<i aria-hidden="true">›</i>'}</${room.demo ? 'div' : 'button'}><div id="topic-body"></div>`);
  if (room.demo) { startLive(room); return; }
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
  stopPolling(); inRoom(true);
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
  chat.sending = true;box.disabled=true;
  try {
    const c = await addComment(secret, view.post.id, text, view.commentItem);
    view.comments.push(c); view.post.comments++; track('comment_create', null, {post: view.post.id, item: view.commentItem ? 1 : 0});
    view.commentItem = null; renderPost();
  } catch (e) { toast(t(errorKey(e.message))); }
  finally { chat.sending = false;box.disabled=false; }
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
const reviewFields = d => `${d.item ? '' : `<p class="write-warn">${esc(t('review.needItem'))}</p>`}<p class="write-label">${esc(t('review.usedFor'))}</p><div class="chat-chips">${USED_FOR.map(u => `<button type="button" data-write-used="${u}" class="${d.usedFor === u ? 'on' : ''}">${esc(t('review.used.' + u))}</button>`).join('')}</div><p class="write-note">${esc(t('review.showMine'))}</p>${chipRow('review.skin', SKIN_TYPES, 'skin', d.skinType, 'skinType')}${chipRow('review.tone', SKIN_TONES, 'tone', d.skinTone, 'skinTone')}${chipRow('review.undertone', UNDERTONES, 'under', d.undertone, 'undertone')}<label class="profile-check"><input type="checkbox" id="write-save-profile" ${d.saveProfile ? 'checked' : ''}><span><b>${esc(t('profile.saveFromReview'))}</b></span></label><input id="write-goal" maxlength="60" placeholder="${esc(t('review.goal'))}" value="${esc(d.goal)}"><p class="write-label">${esc(t('review.photos'))}</p><p class="write-note">${esc(t('review.photoNote'))}</p><div class="write-photos">${d.photos.map((ph, i) => `<span><img src="${esc(photoUrl(ph))}" alt=""><button type="button" data-write-photo-remove="${i}" aria-label="${esc(t('close'))}">×</button></span>`).join('')}${d.photos.length < 4 ? `<label class="photo-add">＋<input id="write-photo" type="file" accept="image/*" hidden><span>${esc(t('review.addPhoto'))}</span></label>` : ''}</div><p class="write-label">${esc(t('review.purchase'))}</p><div class="write-grid"><input id="write-where" maxlength="60" placeholder="${esc(t('review.where'))}" value="${esc(d.where)}"><input id="write-price" inputmode="decimal" placeholder="${esc(t('review.price'))}" value="${esc(d.price)}"><input id="write-country" maxlength="2" placeholder="${esc(t('review.shipCountry'))}" value="${esc(d.shipCountry)}"><input id="write-days" inputmode="numeric" placeholder="${esc(t('review.shipDays'))}" value="${esc(d.shipDays)}"></div><label class="write-check"><input id="write-sponsored" type="checkbox" ${d.sponsored ? 'checked' : ''}> ${esc(t('review.sponsored'))}</label>`;
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
  if (chat.room?.demo) return;
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
  const draft=roomDrafts.get(room.id);
  chat.messages = []; chat.item = draft?.item??null; chat.replyTo = draft?.replyTo??null; unreadMessages = 0;
  const setupNudge = shouldSuggestSetup(readInterests(), storage) ? `<aside id="setup-nudge" class="setup-nudge"><b>${esc(t('onb.nudgeTitle'))}</b><p>${esc(t('onb.nudgeHint'))}</p><div><button class="text-link" data-onb-manage data-onb-context="chat">${esc(t('onb.manage'))}</button><button class="text-btn" data-setup-snooze>${esc(t('onb.snooze'))}</button></div></aside>` : '';
  logSort = 'all';
  body(`${setupNudge}<div class="log-sorts" role="group" aria-label="${esc(t('community.live'))}">${LOG_SORTS.map(k => `<button data-log-sort="${k}" aria-pressed="${k === 'all'}" class="${k === 'all' ? 'on' : ''}">${esc(t('chat.sort.' + k))}</button>`).join('')}</div><div id="chat-log" class="chat-log" aria-live="polite">${loadingMarkup(t('loading'))}</div><button id="chat-latest" class="chat-latest" data-chat-action="latest" hidden></button><form id="chat-form" class="chat-composer"><div class="composer-tools"><p class="chat-rules">${esc(t('chat.quickRules'))}</p><button type="button" class="exp-open" data-chat-action="experience">${icon.spark}<span>${esc(t('exp.open'))}</span></button></div><div id="chat-context"></div><div class="chat-input-row"><button type="button" class="chat-attach" data-chat-action="attach" aria-label="${esc(t('chat.attach'))}">${icon.plus}</button><textarea id="chat-text" rows="1" maxlength="500" placeholder="${esc(t('chat.composePh'))}"></textarea><button class="chat-send" aria-label="${esc(t('chat.send'))}">${icon.send}</button></div></form>`);
  {
    $('#chat-text').value=draft?.text??'';renderContext();
    $('#chat-form').onsubmit = e => { e.preventDefault(); send(); };
    $('#chat-text').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
  }
  if (room.demo) {
    chat.messages = [...(demoMessages[room.id] || []), ...demoChat.messages(room.id)];
    $('#chat-form .chat-rules').textContent = locale().startsWith('ko') ? '데모 대화 · 작성한 메시지는 이 기기에만 저장돼요' : 'Demo chat · Messages stay on this device';
    renderLog(true);
    return;
  }
  try {
    const messages = await fetchMessages(room.id);
    if(chat.room?.id!==room.id||!$('#chat-log'))return;
    chat.messages = messages;
  } catch { if(chat.room?.id!==room.id||!$('#chat-log'))return; $('#chat-log').innerHTML = `<p class="empty">${esc(t('chat.loadFailed'))}</p>`; return; }
  track('chat_open',null,{room:room.id,entry_mode:roomFindMode});
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
// Stable nickname colors shared with iPhone; dark enough on white.
const NICK_COLORS = ['#147B86','#2463AB','#8056A3','#99601B','#B43F67','#397845','#5265A0','#9C4F32'];
function nicknameColor(nickname) {
  let hash = 0;
  for (const byte of new TextEncoder().encode(nickname)) hash = (hash * 31 + byte) % NICK_COLORS.length;
  return NICK_COLORS[hash];
}

// 3-2: 전체 = conversation order; 최신순 = newest first; 인기순 = most liked first (no grouping or day lines).
const LOG_SORTS = ['all', 'new', 'top'];
let logSort = 'all';
const msgTime = iso => Date.now() - Date.parse(iso) < 86400000 ? relTime(iso) : time(iso);
function renderLog(scroll) {
  const log = $('#chat-log'); if (!log) return;
  const near = logSort === 'all' && log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  const shown = visible(chat.messages, readBlocked(storage));
  const list = logSort === 'new' ? [...shown].reverse() : logSort === 'top' ? [...shown].sort((a, b) => (b.likes || 0) - (a.likes || 0) || b.id - a.id) : shown;
  const oldTop=log.scrollTop;
  if ((scroll||near) && chat.room && chat.messages.length) markSeen(chat.room.id, chat.messages.at(-1).created_at);
  const byId = new Map(list.map(m => [m.id, m])); // quotes of blocked authors are hidden too
  let previousDay = '';
  log.innerHTML = roomIntroCard() + (list.length ? list.map((m, index) => {
    const mine = m.author_tag === chat.myTag, parent = m.reply_to ? byId.get(m.reply_to) : null;
    const day = new Intl.DateTimeFormat(locale(), {year:'numeric', month:'long', day:'numeric'}).format(new Date(m.created_at));
    const divider = logSort === 'all' && day !== previousDay ? `<div class="chat-date"><span>${esc(day)}</span></div>` : '';
    const prev = list[index - 1];
    const elapsed = prev ? Date.parse(m.created_at) - Date.parse(prev.created_at) : Infinity;
    const grouped = logSort === 'all' && !divider && prev?.author_tag === m.author_tag && elapsed >= 0 && elapsed <= 300000;
    previousDay = day;
    // Journey 3 feed row: nickname · time, text, product card, ♡ / 답글. No avatars (removed by product decision).
    return `${divider}<article class="chat-msg feed${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}" data-id="${m.id}" tabindex="0"><div class="msg-main">${!grouped ? `<div class="msg-head"><b class="chat-nick" style="color:${nicknameColor(m.nickname)}">${esc(m.nickname)}</b>${mine ? `<span class="me-tag">${esc(t('chat.meTag'))}</span>` : ''}<time class="msg-time" datetime="${esc(m.created_at)}">${esc(msgTime(m.created_at))}</time></div>` : ''}${parent ? `<button class="chat-quote" data-chat-jump="${parent.id}"><b style="color:${nicknameColor(parent.nickname)}">${esc(parent.nickname)}</b><span>${esc(parent.body || parent.item?.name || '')}</span></button>` : ''}${m.body ? msgBody(m.body) : ''}${m.item ? itemCard(m.item, 'chat-' + m.id) : ''}<div class="msg-actions"><button class="chat-heart${liked.has(m.id) ? ' selected' : ''}" data-chat-like="${m.id}" aria-label="${esc(t('chat.like'))}" aria-pressed="${liked.has(m.id)}" ${liking.has(m.id) ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span>${m.likes || 0}</span></button><button class="msg-reply" data-chat-reply="${m.id}">${icon.reply}<span>${esc(t('chat.replyShort'))}</span></button></div></div></article>`;
  }).join('') : `<p class="empty">${esc(t('chat.empty'))}</p>`);
  log.oncontextmenu = e => { const row = e.target.closest('.chat-msg'); if (row) { e.preventDefault(); openMenu(+row.dataset.id); } };
  log.onkeydown = e => { if (e.target.matches('.chat-msg') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMenu(+e.target.dataset.id); } };
  let press;
  log.onpointerdown = e => { if (e.target.closest('button')) return; const row = e.target.closest('.chat-msg'); if (row) press = setTimeout(() => openMenu(+row.dataset.id), 550); };
  log.onpointerup = log.onpointercancel = log.onpointermove = () => clearTimeout(press);

  if (logSort !== 'all') { if (scroll) log.scrollTop = 0; }
  else if (scroll || near) { log.scrollTop = log.scrollHeight; unreadMessages = 0; }
  else { log.scrollTop = oldTop; }
  const latest = $('#chat-latest');
  if (latest) { latest.hidden = unreadMessages === 0; latest.textContent = t('chat.newMessages', {n: unreadMessages}); }
  log.onscroll = () => { if (log.scrollHeight - log.scrollTop - log.clientHeight < 120) { unreadMessages = 0; if(chat.room&&chat.messages.length)markSeen(chat.room.id,chat.messages.at(-1).created_at); if (latest) latest.hidden = true; } };
}
function renderContext() {
  const box = $('#chat-context'); if (!box) return;
  const reply = chat.replyTo ? chat.messages.find(m => m.id === chat.replyTo) : null;
  box.innerHTML = (reply ? `<div class="chat-chip"><span>${esc(t('chat.replyingTo', {name: reply.nickname}))}<small>${esc(reply.body || reply.item?.name || '')}</small></span><button type="button" data-chat-action="reply-cancel" aria-label="${esc(t('close'))}">×</button></div>` : '') +
    (chat.item ? `<div class="chat-chip">${esc(brandLabel(chat.item))} · ${esc(chat.item.name)}<button type="button" data-chat-action="item-cancel" aria-label="${esc(t('chat.removeItem'))}">×</button></div>` : '');
}
async function send() {
  const box = $('#chat-text'); if(!box||!chat.room)return;const text = box.value.trim(),roomId=chat.room.id,item=chat.item,replyTo=chat.replyTo;
  if (chat.sending || (!text && !chat.item)) return;
  chat.sending = true;box.disabled=true;
  try {
    if (chat.room.demo) {
      const {message, persisted} = demoChat.send(roomId, text, item, replyTo, chat.myTag);
      chat.messages.push(message); roomDrafts.delete(roomId);
      box.value = ''; chat.item = null; chat.replyTo = null; renderContext(); renderLog(true);
      if (!persisted) toast(locale().startsWith('ko') ? '기기 저장이 안 돼요. 이번 실행 중에만 유지됩니다.' : 'Storage unavailable. Messages last for this session only.');
      return;
    }
    const m = await postMessage(secret, roomId, text, item, replyTo);
    roomDrafts.delete(roomId);
    if (!homeJoined.some(j => j.room_id === roomId)) homeJoined.unshift({room_id: roomId, last: m});
    chat.nickname = m.nickname;
    track('chat_send', null, {room:roomId,item:item?1:0,reply:replyTo?1:0});
    if(chat.room?.id!==roomId||!box.isConnected)return;
    if (!chat.messages.some(x => x.id === m.id)) chat.messages.push(m);
    box.value = ''; chat.item = null; chat.replyTo = null; renderContext(); renderLog(true);
  } catch (e) { toast(t(errorKey(e.message))); }
  finally { chat.sending = false;box.disabled=false; }
}
function startPolling() {
  if (chat.room?.demo) return;
  stopPolling();
  chat.poll = setInterval(async () => {
    if (!chat.room || document.hidden || view.mode !== 'live') return;
    const roomId=chat.room.id,last = chat.messages.at(-1)?.id ?? 0;
    try {
      const fresh = (await fetchMessages(roomId, last)).filter(m => !chat.messages.some(x => x.id === m.id));
      if(chat.room?.id!==roomId)return;
      if (fresh.length) { unreadMessages += fresh.length; chat.messages.push(...fresh); renderLog(false); }
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
  else { chat.item = it; renderContext(); if ($('#exp-sheet')?.open) renderExperience(); else $('#chat-text')?.focus(); }
}

// Journey 2-4 room preview card at the top of the conversation: picture, real members / last activity, tags,
// and 2-5 related rooms. Reading needs no login or join step.
function roomIntroCard() {
  const r = chat.room; if (!r) return '';
  const image = home?.images?.get(r.id) ?? r.topic_product?.image_url;
  const stats = [t('room.joined', {n: r.members ?? 0}), r.last_message_at ? t('room.lastActive', {t: relTime(r.last_message_at)}) : ''].filter(Boolean).join(' · ');
  return `<section class="room-intro-card">${image ? `<img class="room-intro-photo" src="${esc(image)}" alt="" loading="lazy">` : ''}<div class="room-intro-head">${image ? '' : roomThumb(r)}<div><h2>${esc(roomTitle(r))}</h2><small>${esc(stats)}</small></div></div>${concernsOf(r).length ? `<div class="room-tags">${roomTags(r)}</div>` : ''}<button class="text-link" data-chat-action="related">${esc(t('room.related'))} ›</button></section>`;
}
const RELATED = ['product', 'brand', 'concern'];
let relatedTab = 'concern';
function relatedRooms(kind) {
  const r = chat.room, others = chat.rooms.filter(x => x.id !== r.id);
  const product = r.topic_product, brand = product?.brand ?? (r.kind === 'brand' ? r.brand : null);
  if (kind === 'product') return product ? others.filter(x => (x.topic_product?.id ?? x.topic_product?.label) === (product.id ?? product.label)) : [];
  if (kind === 'brand') return brand ? others.filter(x => x.topic_product?.brand === brand || (x.kind === 'brand' && x.brand === brand)) : [];
  const mine = concernsOf(r);
  return others.filter(x => x.kind !== 'brand' && (concernsOf(x).some(c => mine.includes(c)) || (!mine.length && x.tag === r.tag)))
    .sort((a, b) => (b.messages_24h ?? 0) - (a.messages_24h ?? 0)).slice(0, 12);
}
function openRelated() {
  if (!chat.room) return;
  relatedTab = RELATED.find(k => relatedRooms(k).length) ?? 'concern'; // most specific link first
  let dlg = $('#related-rooms'); if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'related-rooms'; dlg.className = 'chat-dialog related-rooms'; dlg.setAttribute('aria-labelledby', 'related-title'); document.body.append(dlg); }
  drawRelated(); if (!dlg.open) dlg.showModal();
}
function drawRelated() {
  const list = relatedRooms(relatedTab);
  $('#related-rooms').innerHTML = `<form method="dialog"><button class="close-dialog" aria-label="${esc(t('close'))}">×</button></form><h2 id="related-title">${esc(t('related.title'))}</h2><div class="related-tabs" role="group">${RELATED.map(k => `<button data-related-tab="${k}" aria-pressed="${relatedTab === k}" class="${relatedTab === k ? 'on' : ''}">${esc(t('related.' + k))}</button>`).join('')}</div><div class="related-list">${list.length ? list.map(x => exploreRow(x, home?.images?.get(x.id), 'data-related-room')).join('') : `<p class="empty">${esc(t('related.empty'))}</p>`}</div>`;
}

// Journey 4 "경험 공유하기": three optional steps — 4-2 used it?, 4-3 details, 4-4 write — sent as one ordinary
// chat message in this room. Nothing is required and nothing is stored apart from the message itself.
const EXP = {used: ['yes', 'now', 'no'], period: ['lt1w', '1w1m', '1m3m', 'gt3m'], skin: ['dry', 'oily', 'combination', 'sensitive', 'unsure'],
  good: ['moist', 'lasting', 'cover', 'trouble', 'color', 'gentle', 'other']};
const EXP_MULTI = ['skin', 'good'];
const usedIcon = {
  yes: '<path d="m5 12 4.5 4.5L19 7"/>',
  now: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  no: '<path d="M5 6h14v9H11l-4 3v-3H5z"/><path d="m10 9 4 4M14 9l-4 4"/>'
};
let exp = null;
const expLabel = (group, v) => group === 'skin' ? t(v === 'unsure' ? 'exp.skin.unsure' : 'skin.' + v) : t(`exp.${group}.${v}`);
function openExperience() {
  if (!chat.room) return;
  exp = {step: 1, used: null, period: null, skin: [], good: [], note: $('#chat-text')?.value ?? ''};
  let dlg = $('#exp-sheet'); if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'exp-sheet'; dlg.className = 'exp-sheet'; dlg.setAttribute('aria-labelledby', 'exp-title'); document.body.append(dlg); }
  renderExperience(); dlg.showModal();
}
function renderExperience() {
  const room = chat.room, image = chat.item?.image_url ?? home?.images?.get(room.id) ?? room.topic_product?.image_url;
  const subject = chat.item ? `${brandLabel(chat.item)} ${chat.item.name}` : roomTitle(room);
  const chips = (g, title, hint = '') => `<fieldset class="exp-group"><legend>${esc(t(title))}${hint ? ` <span>${esc(t(hint))}</span>` : ''}</legend><div class="exp-chips">${EXP[g].map(v => { const on = EXP_MULTI.includes(g) ? exp[g].includes(v) : exp[g] === v; return `<button type="button" data-exp="${g}:${v}" aria-pressed="${on}" class="${on ? 'on' : ''}">${esc(expLabel(g, v))}</button>`; }).join('')}</div></fieldset>`;
  const close = `<button type="button" class="icon-btn" data-chat-action="exp-close" aria-label="${esc(t('close'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
  const back = `<button type="button" class="icon-btn" data-chat-action="exp-back" aria-label="${esc(t('back'))}">${icon.back}</button>`;
  const hero = `<div class="exp-hero">${image ? `<img src="${esc(image)}" alt="">` : roomThumb(room)}<b>${esc(subject)}</b></div>`;
  let title, bodyHtml, actions;
  if (exp.step === 1) {
    title = t('exp.title');
    bodyHtml = `${hero}<button type="button" class="exp-product" data-chat-action="exp-product"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>${chat.item ? esc(`${brandLabel(chat.item)} · ${chat.item.name}`) : esc(t('exp.product'))}</span></button><h3 class="exp-q">${esc(t('exp.q.used'))}</h3><div class="exp-cards">${EXP.used.map(v => `<button type="button" data-exp="used:${v}" aria-pressed="${exp.used === v}" class="${exp.used === v ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${usedIcon[v]}</svg><span>${esc(expLabel('used', v))}</span></button>`).join('')}</div><p class="exp-hint center">${esc(t('exp.q.hint'))}</p>`;
    actions = `<button type="button" class="primary" data-chat-action="exp-next">${esc(t('exp.next'))}</button><button type="button" class="text-btn" data-chat-action="exp-close">${esc(t('exp.skipChat'))}</button>`;
  } else if (exp.step === 2) {
    title = t('exp.detailTitle');
    bodyHtml = `${hero}${chips('period', 'exp.period')}${chips('skin', 'exp.skin', 'exp.multi')}${chips('good', 'exp.change', 'exp.multi')}`;
    actions = `<button type="button" class="primary" data-chat-action="exp-next">${esc(t('exp.next'))}</button><button type="button" class="text-btn" data-chat-action="exp-next">${esc(t('exp.skip'))}</button>`;
  } else {
    title = t('exp.writeTitle');
    const sum = [['exp.sum.period', exp.period && expLabel('period', exp.period)], ['exp.sum.skin', exp.skin.map(v => expLabel('skin', v)).join(', ')], ['exp.sum.good', exp.good.map(v => expLabel('good', v)).join(', ')]].filter(([, v]) => v);
    bodyHtml = `${sum.length ? `<div class="exp-summary">${sum.map(([k, v]) => `<div><small>${esc(t(k))}</small><b>${esc(v)}</b></div>`).join('')}</div>` : ''}<label class="exp-note"><span class="sr-only">${esc(t('exp.writeTitle'))}</span><textarea id="exp-note" rows="6" maxlength="400" placeholder="${esc(t('exp.notePh'))}">${esc(exp.note)}</textarea><small id="exp-count">${exp.note.length}/400</small></label><p class="exp-hint">${esc(t('exp.anonNote'))}</p>`;
    actions = `<button type="button" class="primary" data-chat-action="exp-submit">${esc(t('exp.post'))}</button>`;
  }
  $('#exp-sheet').innerHTML = `<div class="exp-bar">${exp.step === 1 ? close : back}<div><h2 id="exp-title">${esc(title)}</h2>${exp.step === 1 ? `<small>${esc(t('exp.optional'))}</small>` : ''}</div>${exp.step === 1 ? '' : close}</div><div class="exp-body">${bodyHtml}</div><div class="exp-actions">${actions}</div>`;
}
function experienceText() {
  const head = [exp.used && expLabel('used', exp.used), exp.used !== 'no' && exp.period && expLabel('period', exp.period), ...exp.skin.map(v => expLabel('skin', v))].filter(Boolean).join(' · ');
  const good = exp.used !== 'no' && exp.good.length ? t('exp.goodLine', {v: exp.good.map(v => expLabel('good', v)).join(', ')}) : '';
  return [head, good, exp.note.trim()].filter(Boolean).join('\n').slice(0, 500);
}
function stepExperience(dir) {
  exp.note = $('#exp-note')?.value ?? exp.note;
  exp.step += dir;
  if (exp.step === 2 && exp.used === 'no') exp.step += dir; // details only apply to people who used it
  exp.step = Math.min(3, Math.max(1, exp.step));
  renderExperience(); $('#exp-sheet .exp-body')?.scrollTo(0, 0);
}
function submitExperience() {
  exp.note = $('#exp-note')?.value ?? exp.note;
  const text = experienceText();
  if (!text) { toast(t('exp.empty')); return; }
  $('#exp-sheet').close();
  const box = $('#chat-text'); if (!box) return;
  box.value = text;
  send();
}
document.addEventListener('input', e => { if (e.target.id === 'exp-note' && exp) { exp.note = e.target.value; const c = $('#exp-count'); if (c) c.textContent = `${exp.note.length}/400`; } });
// 4-5: an experience message starts with a line of known choices ("사용했어요 · 1주~1개월 · 건성"); show them as tags.
function experienceTags(body) {
  const [first, ...rest] = String(body ?? '').split('\n'), parts = first.split(' · ');
  const known = new Set(Object.entries(EXP).flatMap(([g, vs]) => vs.map(v => expLabel(g, v))));
  if (!parts.every(p => known.has(p))) return null;
  return {tags: parts, text: rest.join('\n')};
}
const msgBody = body => { const x = experienceTags(body); return x ? `<div class="exp-tags">${x.tags.map(v => `<span>${esc(v)}</span>`).join('')}</div>${x.text ? `<p class="msg-body">${esc(x.text)}</p>` : ''}` : `<p class="msg-body">${esc(body)}</p>`; };

// Menus: chat messages (reply / save as post for mine / report / block) and posts or comments (report / block).
let menuTarget = null;
function openMenu(id) {
  chat.menuFor = chat.messages.find(m => m.id === id); if (!chat.menuFor) return;
  const mine = chat.menuFor.author_tag === chat.myTag; menuTarget = {type: 'chat', id};
  $('#chat-menu').innerHTML = `<div class="chat-menu-list"><button data-chat-action="reply">${esc(t('chat.reply'))}</button><button data-chat-action="copy">${esc(t('chat.copy'))}</button>${chat.room?.demo ? '' : mine ? `<button data-chat-action="save-as-post">${esc(t('community.saveAsPost'))}</button>` : `<button data-chat-action="report">${esc(t('chat.report'))}</button><button data-chat-action="block">${esc(t('chat.block'))}</button>`}<button data-chat-action="menu-close">${esc(t('cancel'))}</button></div>`;
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
  const request=Symbol(); box.talkRequest=request;
  box.innerHTML = `<h3 class="chat-section">${esc(t('product.reviews'))}</h3>${loadingMarkup(t('loading'))}`;
  let talk; try { talk = await fetchProductTalk(familyKey); } catch { if(box.talkRequest===request)box.innerHTML = ''; return; }
  if(box.talkRequest!==request||!box.isConnected)return;
  talkState = {box, talk}; talkFilter = {}; drawTalk();
}
// Filter reviews by the conditions writers chose to show (skin type / tone); a reference, not a promise.
let talkState = null, talkFilter = {};
function drawTalk() {
  if (!talkState) return; const {box, talk} = talkState;
  const all = visiblePosts(talk.reviews), reviews = filterReviews(all, talkFilter), posts = visiblePosts(talk.posts);
  if(!all.length&&!posts.length&&!talk.chatMentions){box.innerHTML=`<p class="home-note">${esc(t('product.talkEmpty'))}</p>`;return;}
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
  dlg.innerHTML = `<form method="dialog"><button class="close-dialog" aria-label="${esc(t('close'))}">×</button></form><h2>${esc(t('home.ask'))}</h2><p class="chat-sub">${esc(t('home.askHint'))}</p>${true ? `<button class="write-btn" data-chat-action="create-room">+ ${esc(t('room.new'))}</button>` : ''}${topics.map(r => roomRow(r).replace('data-chat-room=', 'data-chat-start=')).join('')}`;
  dlg.showModal();
}
// Free room creation: any subject. Field and concern tags are optional and only help others find the room.
const ROOM_TAGS = ['talk', 'skin', 'makeup'], TAG_GROUP = {skin: 'skincare', makeup: 'makeup'};
const newRoom = {productName: '', tag: 'talk', concerns: [], title: '', intro: '', error: '', busy: false};
function openCreateRoom(productName = '') {
  $('#chat-start')?.open && $('#chat-start').close();
  const sel = readInterests();
  newRoom.tag = sel?.skincare && !sel.makeup ? 'skin' : sel?.makeup && !sel.skincare ? 'makeup' : 'talk';
  Object.assign(newRoom, {productName: String(productName), concerns: [...(sel?.concerns ?? [])], title: String(productName).slice(0, 40), intro: '', error: '', busy: false});
  let dlg = $('#room-create'); if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'room-create'; dlg.className = 'chat-dialog post-write room-create'; dlg.setAttribute('aria-labelledby', 'room-create-title'); document.body.append(dlg); }
  renderCreateRoom(); dlg.showModal(); $('#room-title').focus();
}
const keepRoomText = () => { newRoom.title = $('#room-title')?.value ?? newRoom.title; newRoom.intro = $('#room-intro')?.value ?? newRoom.intro; };
function renderCreateRoom() {
  const group = TAG_GROUP[newRoom.tag], offered = CONCERNS.filter(c => !group || c.group === group);
  newRoom.concerns = newRoom.concerns.filter(id => offered.some(c => c.id === id));
  const chip = (attr, id, on, label) => `<button type="button" ${attr}="${id}" aria-pressed="${on}" class="${on ? 'on' : ''}">${esc(label)}</button>`;
  $('#room-create').innerHTML = `<form method="dialog"><button class="close-dialog" aria-label="${esc(t('close'))}">×</button></form><h2 id="room-create-title">${esc(t('room.new'))}</h2><p class="chat-sub">${esc(t(demoActive ? 'rooms.demoCreate' : 'room.newHint'))}</p><input id="room-title" maxlength="40" autocomplete="off" aria-label="${esc(t('room.titlePh'))}" placeholder="${esc(t('room.titlePh'))}" value="${esc(newRoom.title)}"><textarea id="room-intro" rows="2" maxlength="120" aria-label="${esc(t('room.introPh'))}" placeholder="${esc(t('room.introPh'))}">${esc(newRoom.intro)}</textarea><p class="write-label">${esc(t('room.field'))}</p><div class="chat-chips" role="group" aria-label="${esc(t('room.field'))}">${ROOM_TAGS.map(tag => chip('data-room-tag', tag, newRoom.tag === tag, t('room.tag.' + tag))).join('')}</div><p class="write-label">${esc(t('room.concerns'))}</p><div class="chat-chips room-concerns" role="group" aria-label="${esc(t('room.concerns'))}">${offered.map(c => chip('data-room-concern', c.id, newRoom.concerns.includes(c.id), t('onb.c.' + c.id))).join('')}</div><p class="write-note">${esc(t('room.note'))}</p><p class="write-warn" id="room-error" role="alert">${esc(newRoom.error)}</p><button class="primary" data-chat-action="room-submit" ${newRoom.busy ? 'disabled' : ''}>${esc(t('room.create'))}</button>`;
}
async function submitRoom() {
  keepRoomText();
  if (newRoom.title.trim().length < 3) { newRoom.error = t('chat.err.short'); renderCreateRoom(); $('#room-title').focus(); return; }
  newRoom.busy = true; newRoom.error = ''; renderCreateRoom();
  try {
    if (demoActive) {
      const room = createDemoProductRoom({...newRoom, productName: newRoom.productName || newRoom.title});
      chat.rooms = demoRooms; $('#room-create').close(); newRoom.busy = false; home = null;
      toast(t('rooms.demoCreated')); openTopic(room, 'live'); return;
    }
    const id = await createRoom(secret, newRoom);
    chat.rooms = await fetchRooms().catch(() => chat.rooms);
    $('#room-create').close(); toast(t('room.created'));
    const room = chat.rooms.find(r => r.id === id);
    if (room) { chat.room = room; openTopic(room, 'live'); } else renderHome();
  } catch (e) { newRoom.busy = false; newRoom.error = t(errorKey(e.message)); renderCreateRoom(); }
}
let pendingPost = null;
export const openPostNext = id => { pendingPost = id; };
let pendingRoom = null;
export const openRoomNext = id => { pendingRoom = id; };

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.chatAction;
  if (a === 'toggle-demo') { demoActive = !demoActive; saveCommunityMode(); home = null; homeJoined = []; chat.rooms = []; chat.messages = []; homeTab = 'rec'; renderHome(); }
  else if (a === 'latest') { const log = $('#chat-log'); if (log) log.scrollTop = log.scrollHeight; unreadMessages = 0; b.hidden = true; }
  else if (a === 'rooms') renderHome();
  else if (a === 'resume') renderJoined();
  else if (HOME_TABS.includes(b.dataset.homeTab)) { homeTab = b.dataset.homeTab; document.querySelectorAll('[data-home-tab][role=tab]').forEach(x => { const on = x.dataset.homeTab === homeTab; x.setAttribute('aria-selected', on); x.classList.toggle('on', on); }); drawHome(); }
  else if (a === 'more-topic-rooms') { topicRoomLimit += 6; drawHome(); }
  else if (a === 'more-product-rooms') { productGroupLimit += 6; drawProductRooms(); }
  else if (b.dataset.productRoomGroup) { selectedProductGroup = b.dataset.productRoomGroup; drawProductRooms(); }
  else if (a === 'product-list-back') { selectedProductGroup = null; drawProductRooms(); }
  else if (a === 'create-product-room') {
    const selected = productRoomGroups(home?.topics ?? [], home?.popular ?? []).find(g=>g.id===selectedProductGroup);
    openCreateRoom(selected?.name ?? productRoomQuery);
  }
  else if (a === 'room-more') { const m = $('#room-menu'); if (m) { m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); } }
  else if (b.dataset.chatJump) { $('#chat-log [data-id="' + b.dataset.chatJump + '"]')?.scrollIntoView({block:'center', behavior:'smooth'}); }
  else if (a === 'copy') { try { await navigator.clipboard.writeText(chat.menuFor.body || chat.menuFor.item?.name || ''); $('#chat-menu').close(); } catch { toast(t('chat.err.other')); } }
  else if (b.dataset.chatReply) { chat.replyTo = +b.dataset.chatReply; renderContext(); $('#chat-text')?.focus(); }
  else if (a === 'share-room' && chat.room && !chat.room.demo) share({title: roomTitle(chat.room), url: shareUrl({room: chat.room.id})}, toast);
  else if (a === 'find-topic') openStart();
  else if (a === 'create-room') { if (demoActive) return; openCreateRoom(); }
  else if (a === 'room-submit') submitRoom();
  else if (b.dataset.roomTag) { keepRoomText(); newRoom.tag = b.dataset.roomTag; renderCreateRoom(); $(`[data-room-tag="${newRoom.tag}"]`).focus(); }
  else if (b.dataset.roomConcern) { keepRoomText(); const id = b.dataset.roomConcern; newRoom.concerns = newRoom.concerns.includes(id) ? newRoom.concerns.filter(c => c !== id) : [...newRoom.concerns, id]; renderCreateRoom(); $(`[data-room-concern="${id}"]`).focus(); }
  else if (b.dataset.chatStart) { const room = chat.rooms.find(r => r.id === b.dataset.chatStart); $('#chat-start').close(); if (room) { chat.room = room; askRules(room, () => openWrite()); } }
  else if (a === 'topic') openTopic(chat.room, 'posts');
  else if (b.dataset.topicMode) openTopic(chat.room, b.dataset.topicMode);
  else if (a === 'join-cancel') $('#chat-join').close();
  else if (a === 'join-ok') { agree(storage); $('#chat-join').close(); joinThen(); }
  else if (a === 'write') askRules(chat.room, () => openWrite());
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
  else if (a === 'experience') openExperience();
  else if (a === 'related') openRelated();
  else if (b.dataset.relatedTab) { relatedTab = b.dataset.relatedTab; drawRelated(); $(`[data-related-tab="${relatedTab}"]`)?.focus(); }
  else if (b.dataset.relatedRoom) { const r = chat.rooms.find(x => x.id === b.dataset.relatedRoom); $('#related-rooms').close(); if (r) openTopic(r, 'live'); }
  else if (a === 'exp-close') $('#exp-sheet')?.close();
  else if (a === 'exp-submit') submitExperience();
  else if (a === 'exp-next') stepExperience(1);
  else if (a === 'exp-back') stepExperience(-1);
  else if (a === 'exp-product') { exp.note = $('#exp-note')?.value ?? exp.note; openPicker('chat'); }
  else if (b.dataset.logSort) { logSort = b.dataset.logSort; document.querySelectorAll('[data-log-sort]').forEach(x => { const on = x.dataset.logSort === logSort; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); renderLog(true); }
  else if (b.dataset.exp && exp) { const [g, v] = b.dataset.exp.split(':'); exp.note = $('#exp-note')?.value ?? exp.note; if (EXP_MULTI.includes(g)) exp[g] = exp[g].includes(v) ? exp[g].filter(x => x !== v) : [...exp[g], v]; else exp[g] = exp[g] === v ? null : v; renderExperience(); $(`[data-exp="${g}:${v}"]`)?.focus(); }
  else if (a === 'attach-comment') askRules(chat.room ?? {title_en: '', title_ko: '', intro_en: '', intro_ko: ''}, () => openPicker('comment'));
  else if (a === 'comment-item-cancel') { view.commentItem = null; renderPost(); }
  else if (a === 'reply-cancel') { chat.replyTo = null; renderContext(); }
  else if (a === 'item-cancel') { chat.item = null; renderContext(); }
  else if (a === 'menu-close') $('#chat-menu').close();
  else if (a === 'reply') { chat.replyTo = chat.menuFor.id; $('#chat-menu').close(); renderContext(); $('#chat-text').focus(); }
  else if (a === 'save-as-post' && !chat.room?.demo) { const m = chat.menuFor; $('#chat-menu').close(); openWrite({kind: 'recommend', title: m.body.slice(0, 60), body: m.body, item: m.item, fromMessage: m.id}); }
  else if (a === 'report') openReport();
  else if (a === 'block') {
    block(storage, menuTarget.type === 'chat' ? chat.menuFor.author_tag : menuTarget.author); $('#chat-menu').close();
    if (menuTarget.type === 'chat') renderLog(false); else if (menuTarget.type === 'post') openTopic(chat.room ?? chat.rooms[0], 'posts'); else renderPost();
    toast(t('chat.blocked'));
  }
  else if (b.dataset.chatReport && !chat.room?.demo) {
    $('#chat-menu').close();
    try {
      if (menuTarget.type === 'chat') await reportMessage(secret, chat.menuFor.id, b.dataset.chatReport);
      else await reportCommunity(secret, menuTarget.type, menuTarget.id, b.dataset.chatReport);
      toast(t('chat.reported'));
    } catch { toast(t('chat.err.other')); }
  }
  else if (b.dataset.chatRoom) { const r = chat.rooms.find(x => x.id === b.dataset.chatRoom); if (r) openTopic(r, 'live'); }
  else if (b.dataset.post && !b.closest('#family-dialog') && $('#chat') && !$('#chat').hidden) openPost(+b.dataset.post);
  else if (b.dataset.chatPick) picked1(+b.dataset.chatPick);
  else if (b.dataset.chatMenu) openMenu(+b.dataset.chatMenu);
  else if (b.dataset.communityMenu) openCommunityMenu(b.dataset.communityMenu);
  else if (b.dataset.communitySave && view.post) { toggleSavedPost(view.post); renderPost(); }
  else if (b.dataset.chatLike) {
    if (chat.room?.demo) return;
    const id = +b.dataset.chatLike;
    if ($('#chat-menu')?.open) $('#chat-menu').close();
    if (liking.has(id)) return;
    liking.add(id); b.disabled = true;
    try {
      const n = await likeMessage(secret, id);
      const m = chat.messages.find(x => x.id === id); if (m) m.likes = n;
      if (liked.has(id)) liked.delete(id); else liked.add(id);
      try { storage.setItem(likedKey, JSON.stringify([...liked])); } catch {}
    } catch { toast(t('chat.err.other')); }
    finally { liking.delete(id); renderLog(false); }
  }
  else if (b.dataset.communityLike) {
    const [type, id] = b.dataset.communityLike.split(':');
    try { const n = await likeCommunity(secret, type, +id); const x = type === 'post' ? view.post : view.comments.find(c => c.id === +id); if (x) x.likes = n; renderPost(); } catch { toast(t('chat.err.other')); }
  }
});

// Rooms and their pictures for the first-visit flow (onboarding.js).
export async function onboardingData() {
  const rooms = demoActive ? demoRooms : chat.rooms.length ? chat.rooms : (chat.rooms = await fetchRooms());
  if (demoActive) return {rooms, products:productRoomGroups(rooms), pictures:new Map()};
  const pics = await loadCatalogPictures(rooms).catch(() => null);
  return {rooms, products: productRoomGroups(rooms, pics?.popular ?? []), pictures: pics ? topicPictures(rooms.filter(r => r.kind !== 'brand'), pics.byCategory) : new Map()};
}
export const openRoomById = id => { pendingRoom = id; };
// Rooms and their pictures for the 탐색 tab (explore.js); same sources as the community home.
export async function exploreData() {
  if (!chat.rooms.length) chat.rooms = demoActive ? demoRooms : await fetchRooms();
  if (demoActive) return {rooms: chat.rooms, images: home?.images ?? roomImages(demoEntries()), popular: []};
  const pics = await loadCatalogPictures(chat.rooms).catch(() => null);
  const images = home?.images ?? (pics ? topicPictures(chat.rooms.filter(r => r.kind !== 'brand'), pics.byCategory) : new Map());
  return {rooms: chat.rooms, images, popular: pics?.popular ?? []};
}

document.addEventListener('seoulbeauty-create-room', () => openCreateRoom());




document.addEventListener('product-sort-change',()=>{if(home&&homeTab==='discover'&&$('#community-home'))drawHome()});
document.addEventListener('product-stats-ready',()=>{if(home&&homeTab==='discover'&&$('#community-home'))drawHome()});

document.addEventListener('click',e=>{if(e.target.closest('[data-setup-snooze]')){snoozeSetup(storage);document.getElementById('setup-nudge')?.remove();}});

