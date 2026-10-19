// Room list card from the journey reference: thumbnail, name, real member / activity numbers, concern tags.
// Use actual product imagery where supplied; otherwise a topic-specific SVG icon.
// No profile photos or inferred personal attributes are used for room thumbnails.
// Numbers come straight from chat_room_list — never rounded up or invented.
import {t, lang} from './i18n.js';
import {esc} from './util.js';
import {roomTitle} from './chat-api.js';

const FIELD = {skin: 'skin', makeup: 'makeup', deals: 'deals', travel: 'travel'};
const glyph = {
  skin: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>',
  makeup: '<path d="M9 21V11l3-8 3 8v10z"/><path d="M9 14h6"/>',
  deals: '<path d="M4 12V4h8l8 8-8 8z"/><circle cx="8" cy="8" r="1.5"/>',
  travel: '<path d="M3 12h18M12 3l3 9-3 9-3-9z"/>',
  talk: '<path d="M5 5h14v11H11l-4 3v-3H5z"/>',
  sensitive: '<path d="M12 3C8 7 6 10 6 14a6 6 0 0 0 12 0c0-4-2-7-6-11z"/><path d="M9 15c1 2 3 3 5 2"/>',
  acne: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="13" r="1.2"/><path d="M8 16c3-1 5-1 8 0"/>',
  pores: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="16" cy="16" r="1"/>',
  lips: '<path d="M3 12c2-1 4-5 7-4l2 2 2-2c3-1 5 3 7 4-3 5-7 7-9 7s-6-2-9-7z"/><path d="M3 12c5 1 13 1 18 0"/>',
};
export function roomThumb(room, image) {
  const field = (room.concerns ?? []).includes('sensitive') ? 'sensitive'
    : (room.concerns ?? []).includes('acne') ? 'acne'
    : (room.concerns ?? []).includes('pores') ? 'pores'
    : (room.concerns ?? []).some(c => ['lip', 'longwear', 'shade'].includes(c)) ? 'lips'
    : FIELD[room.tag] ?? 'talk';
  return image
    ? `<span class="room-thumb"><img src="${esc(image)}" alt="" loading="lazy"></span>`
    : `<span class="room-thumb room-thumb-${field}"><svg viewBox="0 0 24 24" aria-hidden="true">${glyph[field]}</svg></span>`;
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
  `<button class="room-list-card" ${attrs}>${roomThumb(room, image)}<span class="room-list-text"><b>${esc(roomTitle(room))}${fresh ? ` <span class="new-badge">${esc(t('home.newMessages'))}</span>` : ''}</b><small>${esc(roomStats(room))}</small>${note ? `<em>${esc(note)}</em>` : ''}${concernsOf(room).length ? `<span class="room-tags">${roomTags(room, highlight)}</span>` : ''}</span><i aria-hidden="true">›</i></button>`;

// Catalog category that illustrates a room when nobody has mentioned a product there yet.
const ROOM_CATEGORY = {acne: '에센스·세럼', 'dry-sensitive': '크림·로션', routine: '토너·패드', sunscreen: '선케어', makeup: '립', 'korea-shopping': '마스크팩'};
const CONCERN_CATEGORY = {acne: '에센스·세럼', dry: '크림·로션', sensitive: '토너·패드', pores: '토너·패드', spots: '에센스·세럼', firmness: '크림·로션',
  sebum: '토너·패드', toneup: '에센스·세럼', trouble: '에센스·세럼', lip: '립', base: '베이스메이크업', cushion: '베이스메이크업', longwear: '베이스메이크업', shade: '베이스메이크업'};
export const roomCategory = room => ROOM_CATEGORY[room.id] ?? CONCERN_CATEGORY[(room.concerns ?? [])[0]]
  ?? (room.tag === 'skin' ? '에센스·세럼' : room.tag === 'makeup' ? '베이스메이크업' : null);
// Distinct catalog pictures per category, handed out in room order; mentioned products keep priority.
export function topicPictures(rooms, byCategory, mentioned = new Map()) {
  const out = new Map(mentioned), taken = new Set(out.values());
  for (const room of rooms) {
    if (out.has(room.id)) continue;
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
