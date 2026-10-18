// Community posts and comments (topic Q&A next to each topic's live chat). Same anonymous identity,
// filters and error codes as chat (see chat-api.js); writes go through RPCs, clients only read.
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from './live.js';

const headers = {apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json'};
export const POST_FIELDS = 'id,room_id,author_tag,nickname,kind,title,body,item,reasons,comments,likes,created_at,last_activity_at,' +
  'used_for,skin_type,skin_tone,undertone,climate,goal,photos,bought_where,bought_price_minor,bought_currency,ship_country,ship_days,sponsored';
export const COMMENT_FIELDS = 'id,post_id,author_tag,nickname,body,item,likes,created_at';
export const KINDS = ['question', 'recommend', 'review'];
export const REASONS = ['price', 'texture', 'color', 'ingredients', 'shipping', 'skin_type', 'scent'];
export const USED_FOR = ['first', 'weeks', 'months', 'long'];
export const SKIN_TYPES = ['dry', 'oily', 'combination', 'sensitive', 'normal'];
export const SKIN_TONES = ['fair', 'light', 'medium', 'tan', 'deep'];
export const UNDERTONES = ['cool', 'warm', 'neutral'];
export const CLIMATES = ['humid', 'dry', 'mixed'];
export const PHOTO_BUCKET = 'review-photos';
export const photoUrl = path => SUPABASE_URL + '/storage/v1/object/public/' + PHOTO_BUCKET + '/' + path;
// Review details sent with create_post; empty fields are dropped, numbers validated before sending.
export function reviewPayload(d) {
  const out = {};
  if (USED_FOR.includes(d.usedFor)) out.used_for = d.usedFor;
  if (SKIN_TYPES.includes(d.skinType)) out.skin_type = d.skinType;
  if (SKIN_TONES.includes(d.skinTone)) out.skin_tone = d.skinTone;
  if (UNDERTONES.includes(d.undertone)) out.undertone = d.undertone;
  if (CLIMATES.includes(d.climate)) out.climate = d.climate;
  if (d.goal?.trim()) out.goal = d.goal.trim().slice(0, 60);
  if (d.photos?.length) out.photos = d.photos.slice(0, 4);
  if (d.where?.trim()) out.bought_where = d.where.trim().slice(0, 60);
  const price = Math.round(Number(d.price) * 100); if (price > 0 && price <= 10000000) { out.bought_price_minor = price; out.bought_currency = 'USD'; }
  if (/^[A-Za-z]{2}$/.test(d.shipCountry ?? '')) out.ship_country = d.shipCountry.toUpperCase();
  const days = Number(d.shipDays); if (d.shipDays !== '' && d.shipDays != null && Number.isInteger(days) && days >= 0 && days <= 120) out.ship_days = days;
  if (d.sponsored) out.sponsored = true;
  return out;
}
// Uploads one already re-encoded JPEG (see chat.js reencode) and returns its storage path.
export async function uploadPhoto(blob, fetchImpl = fetch) {
  const path = 'v1/' + crypto.randomUUID() + '.jpg';
  const res = await fetchImpl(SUPABASE_URL + '/storage/v1/object/' + PHOTO_BUCKET + '/' + path, {method: 'POST',
    headers: {apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'false'}, body: blob, signal: AbortSignal.timeout(20000)});
  if (!res.ok) throw Error('chat:photo');
  return path;
}

const rest = (table, params) => SUPABASE_URL + '/rest/v1/' + table + '?' + new URLSearchParams(params);
export const postsUrl = (room = null, limit = 30) => rest('community_posts', {select: POST_FIELDS, ...(room ? {room_id: 'eq.' + room, order: 'last_activity_at.desc'} : {order: 'created_at.desc'}), limit: String(limit)});
export const commentsUrl = post => rest('community_comments', {select: COMMENT_FIELDS, post_id: 'eq.' + post, order: 'id.asc', limit: '200'});
export const mentionsUrl = familyKey => rest('product_mentions', {select: 'source,source_id,post_id,room_id,created_at', family_key: 'eq.' + familyKey, order: 'created_at.desc', limit: '100'});

async function get(url, fetchImpl) {
  const res = await fetchImpl(url, {headers, signal: AbortSignal.timeout(10000)});
  if (!res.ok) throw Error('HTTP ' + res.status);
  return res.json();
}
async function rpc(name, body, fetchImpl) {
  const res = await fetchImpl(SUPABASE_URL + '/rest/v1/rpc/' + name, {method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)});
  if (!res.ok) { let msg = 'HTTP ' + res.status; try { msg = (await res.json()).message ?? msg; } catch {} throw Error(msg); }
  return res.status === 204 ? null : res.json();
}

export const fetchPosts = (room = null, limit = 30, fetchImpl = fetch) => get(postsUrl(room, limit), fetchImpl);
export async function fetchPost(id, fetchImpl = fetch) { const [p] = await get(rest('community_posts', {select: POST_FIELDS, id: 'eq.' + id}), fetchImpl); return p ?? null; }
export const fetchComments = (post, fetchImpl = fetch) => get(commentsUrl(post), fetchImpl);
// Everything said about one product: posts (directly or via a comment) and the number of chat mentions.
export async function fetchProductTalk(familyKey, fetchImpl = fetch) {
  const mentions = await get(mentionsUrl(familyKey), fetchImpl);
  const ids = [...new Set(mentions.map(m => m.post_id).filter(Boolean))].slice(0, 20);
  const posts = ids.length ? await get(rest('community_posts', {select: POST_FIELDS, id: `in.(${ids.join(',')})`, order: 'last_activity_at.desc'}), fetchImpl) : [];
  const reviewIds = new Set(mentions.filter(m => m.source === 'review').map(m => m.post_id));
  return {reviews: posts.filter(p => reviewIds.has(p.id)), posts: posts.filter(p => !reviewIds.has(p.id)), chatMentions: mentions.filter(m => m.source === 'chat').length};
}
const itemArgs = item => ({p_retailer: item?.retailer ?? null, p_market: item?.market ?? null, p_sku: item?.sku ?? null});
export const createPost = (secret, room, {kind, title, body = '', item = null, reasons = [], fromMessage = null, review = {}}, fetchImpl = fetch) =>
  rpc('create_post', {p_secret: secret, p_room: room, p_kind: kind, p_title: title, p_body: body, ...itemArgs(item), p_reasons: reasons, p_from_message: fromMessage, p_review: kind === 'review' ? review : {}}, fetchImpl);
export const addComment = (secret, post, body, item = null, fetchImpl = fetch) => rpc('add_comment', {p_secret: secret, p_post: post, p_body: body, ...itemArgs(item)}, fetchImpl);
export const likeCommunity = (secret, target, id, fetchImpl = fetch) => rpc('like_community', {p_secret: secret, p_target: target, p_id: id}, fetchImpl);
export const reportCommunity = (secret, target, id, reason, fetchImpl = fetch) => rpc('report_community', {p_secret: secret, p_target: target, p_id: id, p_reason: reason}, fetchImpl);
// "3m", "2h", "5d" style age for post lists.
// Product page review filter: reviews matching every chosen condition (skin type / tone).
export const filterReviews = (reviews, f = {}) => reviews.filter(r => (!f.skin_type || r.skin_type === f.skin_type) && (!f.skin_tone || r.skin_tone === f.skin_tone));
export function ago(iso, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd';
}
