import {roomArt} from './topic-art.js';
// Room list card from the journey reference: thumbnail, name, real member / activity numbers, concern tags.
// Use supplied product imagery first; otherwise the journey deck photo artwork.
// No profile photos or inferred personal attributes are used for room thumbnails.
// Numbers come straight from chat_room_list — never rounded up or invented.
import {t, lang} from './i18n.js';
import {esc} from './util.js';
import {roomTitle} from './chat-api.js';

export function roomThumb(room, image) {
  const src = image || (room.kind === 'brand' && room.logo_url) || roomArt(room);
  return `<span class="room-thumb${image && !String(image).startsWith('assets/category-hd/') ? '' : ' room-thumb-art'}"><img src="${esc(src)}" alt="" loading="lazy"></span>`;
}
// Seed rooms carry no concerns column before the user_rooms migration; this mapping stands in.
export const ROOM_CONCERNS = {
  acne: ['acne', 'trouble', 'sebum'], 'dry-sensitive': ['sensitive', 'dry'], routine: ['pores', 'spots', 'firmness', 'toneup'],
  makeup: ['lip', 'base', 'cushion', 'longwear', 'shade'],
};
export const concernsOf = room => Array.isArray(room.concerns) ? room.concerns : ROOM_CONCERNS[room.id] ?? [];
// 12400 → 1.2만 (ko) / 12.4K (en); real counts only, just shortened.
export function compactCount(n, code = lang) {
  const one = v => { const s = v.toFixed(1); return s.endsWith('.0') ? s.slice(0, -2) : s; };
  if (code === 'ko') return n >= 10000 ? one(n / 10000) + '만' : n >= 1000 ? one(n / 1000) + '천' : String(n);
  return n >= 1000 ? one(n / 1000) + 'K' : String(n);
}
// "지금 활발한 대화 중" only when the last message is under an hour old; otherwise today's count; else nothing.
export function roomActivity(room, now = Date.now()) {
  const last = Date.parse(room.last_message_at ?? '');
  if (Number.isFinite(last) && now - last < 3600000) return t('room.liveNow');
  return room.messages_24h > 0 ? t('room.newToday', {n: room.messages_24h}) : '';
}
export const memberLine = (room, now) => [t('room.memberCount', {n: compactCount(room.members ?? 0)}), roomActivity(room, now)].filter(Boolean).join(' · ');
export const roomTags = (room, highlight = []) => concernsOf(room).slice(0, 3)
  .map(id => `<span class="${highlight.includes(id) ? 'on' : ''}">#${esc(t('onb.c.' + id).replace(/\s+/g, ''))}</span>`).join('');
export const roomStats = (room, now) => [t('chat.members', {n: compactCount(room.members ?? 0)}), roomActivity(room, now)].filter(Boolean).join(' · ');
// Large room card of the journey screens: photo, name, members and activity, optional intro, tag pills.
export const pickCard = (room, {image = null, intro = true, highlight = [], attrs = `data-chat-room="${esc(room.id)}"`} = {}) =>
  `<button class="pick-card" ${attrs}>${roomThumb(room, image)}<span class="pick-text"><b>${esc(roomTitle(room))}</b><small>${esc(roomStats(room))}</small>${intro ? `<em>${esc(lang === 'ko' ? room.intro_ko ?? '' : room.intro_en ?? '')}</em>` : ''}${concernsOf(room).length ? `<span class="pick-tags">${roomTags(room, highlight)}</span>` : ''}</span><i aria-hidden="true">›</i></button>`;

// note: an extra line (why it was recommended, latest message); attrs: data-* to open the room.
export const roomListCard = (room, {image = null, note = '', highlight = [], fresh = false, attrs = `data-chat-room="${esc(room.id)}"`} = {}) =>
  `<button class="room-list-card" ${attrs}><span class="room-list-text"><span class="room-title-line"><b>${esc(roomTitle(room))}</b><span class="room-count" aria-label="${esc(t('chat.members', {n: room.members ?? 0}))}">${room.members ?? 0}</span>${fresh ? ` <span class="new-badge">${esc(t('home.newMessages'))}</span>` : ''}</span>${note ? `<em>${esc(note)}</em>` : roomActivity(room) ? `<small>${esc(roomActivity(room))}</small>` : ''}${concernsOf(room).length ? `<span class="room-tags">${roomTags(room, highlight)}</span>` : ''}</span><i aria-hidden="true">›</i></button>`;

// Catalog category that illustrates a room when nobody has mentioned a product there yet.
const ROOM_CATEGORY = {acne: '에센스·세럼', 'dry-sensitive': '크림·로션', routine: '토너·패드', sunscreen: '선케어', makeup: '립', 'korea-shopping': '마스크팩'};
const CONCERN_CATEGORY = {acne: '에센스·세럼', dry: '크림·로션', sensitive: '토너·패드', pores: '토너·패드', spots: '에센스·세럼', firmness: '크림·로션',
  sebum: '토너·패드', toneup: '에센스·세럼', trouble: '에센스·세럼', lip: '립', base: '베이스메이크업', cushion: '베이스메이크업', longwear: '베이스메이크업', shade: '베이스메이크업'};
export const roomCategory = room => ROOM_CATEGORY[room.id] ?? CONCERN_CATEGORY[(room.concerns ?? [])[0]]
  ?? (room.tag === 'skin' ? '에센스·세럼' : room.tag === 'makeup' ? '베이스메이크업' : null);
// Mentioned products keep priority. Topic rooms use decorative artwork; product rooms can use catalog photos.
export function topicPictures(rooms, byCategory, mentioned = new Map()) {
  const out = new Map(mentioned), taken = new Set(out.values());
  for (const room of rooms) {
    if (out.has(room.id)) continue;
    if (room.kind !== 'product') { out.set(room.id, roomArt(room)); continue; }
    const pic = [...(byCategory.get(roomCategory(room) ?? '전체') ?? []), ...(byCategory.get('전체') ?? [])].find(u => !taken.has(u));
    if (pic) { out.set(room.id, pic); taken.add(pic); }
  }
  return out;
}
// Latest product image mentioned per room, from messages / posts the home screen already fetched.
export function roomImages(entries) {
  const map = new Map();
  for (const e of [...entries].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')))
    if (e.room_id && e.item?.image_url && !map.has(e.room_id)) map.set(e.room_id, e.item.image_url);
  return map;
}
