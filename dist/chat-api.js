// Topic chat (#68) data layer. Anonymous: a random per-device secret proves authorship to the RPCs;
// the server only keeps its hash ("author_tag"), which is also what Block hides locally.
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, restGet, rpc} from './supabase.js';
import {lang} from './i18n.js';

const SECRET_KEY = 'alimi-chat-secret', BLOCK_KEY = 'alimi-chat-blocked', AGREED_KEY = 'alimi-chat-agreed';
export const MESSAGE_FIELDS = 'id,room_id,author_tag,nickname,body,item,reply_to,likes,created_at';

let memorySecret;
export function chatSecret(storage) {
  try {
    let s = storage.getItem(SECRET_KEY);
    if (!/^[0-9a-f-]{36}$/.test(s ?? '')) { s = crypto.randomUUID(); storage.setItem(SECRET_KEY, s); }
    return s;
  } catch { return memorySecret ??= crypto.randomUUID(); }
}
export function readBlocked(storage) {
  try { const v = JSON.parse(storage.getItem(BLOCK_KEY)); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
}
export function block(storage, tag) {
  const list = [...new Set([...readBlocked(storage), tag])];
  try { storage.setItem(BLOCK_KEY, JSON.stringify(list)); } catch {}
  return list;
}
export const hasAgreed = storage => { try { return storage.getItem(AGREED_KEY) === '1'; } catch { return false; } };
export const agree = storage => { try { storage.setItem(AGREED_KEY, '1'); } catch {} };

export const roomTitle = r => (lang === 'ko' ? r.title_ko : r.title_en);
export const roomIntro = r => (lang === 'ko' ? r.intro_ko : r.intro_en);
export const visible = (messages, blocked) => messages.filter(m => !blocked.includes(m.author_tag));
// Server errors are "chat:<code>"; anything else is a network / unknown failure.
export const errorKey = message => {
  const code = /chat:(\w+)/.exec(String(message ?? ''))?.[1];
  return ['slow', 'link', 'blocked', 'banned', 'long', 'item', 'photo'].includes(code) ? 'chat.err.' + code : 'chat.err.other';
};

export const roomsUrl = () => SUPABASE_URL + '/rest/v1/chat_room_list?' + new URLSearchParams({select: '*', order: 'sort'});
// Latest page when afterId is 0, otherwise only messages newer than afterId (polling).
export function messagesUrl(room, afterId = 0, limit = 60) {
  const params = new URLSearchParams({select: MESSAGE_FIELDS, room_id: 'eq.' + room, limit: String(limit)});
  if (afterId) { params.set('id', 'gt.' + afterId); params.set('order', 'id.asc'); } else params.set('order', 'id.desc');
  return SUPABASE_URL + '/rest/v1/chat_messages?' + params;
}

const get = restGet;

export const fetchRooms = (fetchImpl = fetch) => get(roomsUrl(), fetchImpl);
// Rooms this device joined ("My chats"), each with its latest message for the preview line.
export const myRoomsUrl = tag => SUPABASE_URL + '/rest/v1/chat_members?' + new URLSearchParams({select: 'room_id,joined_at', author_tag: 'eq.' + tag, order: 'joined_at.desc'});
export async function fetchMyRooms(tag, fetchImpl = fetch) {
  const joined = await get(myRoomsUrl(tag), fetchImpl);
  return Promise.all(joined.map(async j => {
    const params = new URLSearchParams({select: 'body,item,created_at', room_id: 'eq.' + j.room_id, order: 'id.desc', limit: '1'});
    const [last] = await get(SUPABASE_URL + '/rest/v1/chat_messages?' + params, fetchImpl).catch(() => []);
    return {room_id: j.room_id, last: last ?? null};
  }));
}
// Rooms tab: busiest topic rooms first (messages in 24h, then members); Topics tab: latest activity first.
export async function fetchMessages(room, afterId = 0, fetchImpl = fetch) {
  const rows = await get(messagesUrl(room, afterId), fetchImpl);
  return afterId ? rows : rows.reverse();
}
export const joinRoom = (secret, room, fetchImpl = fetch) => rpc('join_chat', {p_secret: secret, p_room: room}, fetchImpl);
export const postMessage = (secret, room, body, item = null, replyTo = null, fetchImpl = fetch) => rpc('post_chat', {
  p_secret: secret, p_room: room, p_body: body,
  p_retailer: item?.retailer ?? null, p_market: item?.market ?? null, p_sku: item?.sku ?? null, p_reply_to: replyTo
}, fetchImpl);
export const likeMessage = (secret, id, fetchImpl = fetch) => rpc('like_chat', {p_secret: secret, p_message: id}, fetchImpl);
export const reportMessage = (secret, id, reason, fetchImpl = fetch) => rpc('report_chat', {p_secret: secret, p_message: id, p_reason: reason}, fetchImpl);
