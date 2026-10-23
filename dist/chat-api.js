import {requireServerCatalogItem} from './catalog-attachments.js';
// Topic chat (#68) data layer. Anonymous: a random per-device secret proves authorship to the RPCs;
// the server only keeps its hash ("author_tag"), which is also what Block hides locally.
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, restGet, rpc} from './supabase.js';
import {region, inRegion} from './region.js';
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

// Titles and intros follow the UI language (falling back to the other one); the region only decides which rooms exist.
export const roomTitle = r => (lang === 'ko' ? r.title_ko || r.title_en : r.title_en || r.title_ko);
export const roomIntro = r => (lang === 'ko' ? r.intro_ko || r.intro_en : r.intro_en || r.intro_ko);
export const visible = (messages, blocked) => messages.filter(m => !blocked.includes(m.author_tag));
// Server errors are "chat:<code>"; anything else is a network / unknown failure.
export const errorKey = message => {
  if (/PGRST202|Could not find the function/.test(String(message))) return 'chat.err.unavailable';
  if (/abort|timeout|fetch failed|Failed to fetch/i.test(String(message))) return 'chat.err.network';
  const code = /chat:(\w+)/.exec(String(message ?? ''))?.[1];
  return ['slow', 'link', 'blocked', 'banned', 'long', 'item', 'photo', 'short', 'duplicate', 'tag', 'tags', 'room', 'owner', 'participated', 'secret', 'unavailable'].includes(code) ? 'chat.err.' + code : 'chat.err.other';
};

export const roomsUrl = () => SUPABASE_URL + '/rest/v1/chat_room_list?' + new URLSearchParams({select: '*', order: 'sort'});
// Latest page when afterId is 0, otherwise only messages newer than afterId (polling).
export function messagesUrl(room, afterId = 0, limit = 60) {
  const params = new URLSearchParams({select: MESSAGE_FIELDS, room_id: 'eq.' + room, limit: String(limit)});
  if (afterId) { params.set('id', 'gt.' + afterId); params.set('order', 'id.asc'); } else params.set('order', 'id.desc');
  return SUPABASE_URL + '/rest/v1/chat_messages?' + params;
}

const get = restGet;

export const fetchRooms = async (fetchImpl = fetch) => (await get(roomsUrl(), fetchImpl)).filter(r=>inRegion(r));
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
export const postMessage = async (secret, room, body, item = null, replyTo = null, fetchImpl = fetch) => {
  requireServerCatalogItem(item);
  return rpc('post_chat', {
  p_secret: secret, p_room: room, p_body: body,
  p_retailer: item?.retailer ?? null, p_market: item?.market ?? null, p_sku: item?.sku ?? null, p_reply_to: replyTo
}, fetchImpl);
};
// Anyone can open a public topic room; the server checks length, links, words, duplicates and rate.
export async function createRoom(secret, {title, intro = '', tag = 'talk', concerns = []}, fetchImpl = fetch) {
  const args={p_secret:secret,p_title:String(title??'').trim(),p_intro:String(intro??'').trim(),p_tag:tag,p_concerns:concerns};
  try { return await rpc('create_region_room',{...args,p_service_region:region},fetchImpl); }
  catch(e) {
    // Only the original US pilot can use the old RPC when the migration is missing.
    if(region==='us' && /Could not find|PGRST202/.test(e.message)) return rpc('create_room',args,fetchImpl);
    throw e;
  }
}
export const likeMessage = (secret, id, fetchImpl = fetch) => rpc('like_chat', {p_secret: secret, p_message: id}, fetchImpl);
export const reportMessage = (secret, id, reason, fetchImpl = fetch) => rpc('report_chat', {p_secret: secret, p_message: id, p_reason: reason}, fetchImpl);


export const roomActions = (secret, room, fetchImpl = fetch) => rpc('room_actions', {p_secret: secret, p_room: room}, fetchImpl);
export const leaveRoom = (secret, room, fetchImpl = fetch) => rpc('leave_room', {p_secret: secret, p_room: room}, fetchImpl);
export const deleteRoom = (secret, room, fetchImpl = fetch) => rpc('delete_room', {p_secret: secret, p_room: room}, fetchImpl);
export const deleteMessage = (secret, id, fetchImpl = fetch) => rpc('delete_chat_message', {p_secret: secret, p_message: id}, fetchImpl);
