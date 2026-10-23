// P0 funnel events (#49). Anonymous random device ID; never sends search text or personal data.
import {region} from './region.js';
import {lang} from './i18n.js';
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from './supabase.js';
export const EVENT_NAMES = ['home_view', 'search', 'product_view', 'wishlist_add', 'wishlist_remove', 'target_price_set', 'merchant_click', 'chat_open', 'chat_join', 'chat_send',
  'community_open', 'post_view', 'post_create', 'comment_create', 'product_card_click', 'post_save',
  'beauty_draft_open', 'beauty_room_selected', 'beauty_post_published'];
let memoryId;
export function deviceId(storage) {
  try {
    let id = storage.getItem('alimi-device-id');
    if (!/^[0-9a-f-]{36}$/.test(id ?? '')) { id = crypto.randomUUID(); storage.setItem('alimi-device-id', id); }
    return id;
  } catch { return memoryId ??= crypto.randomUUID(); }
}
export function buildEvent(name, productId, props, id) {
  if (!EVENT_NAMES.includes(name)) throw Error('Unknown event ' + name);
  return {device_id: id, platform: 'web', app_version: 'web-1', name, product_id: productId ?? null, props: {...props,service_region:region,ui_language:lang}};
}
export function track(name, productId, props, {storage = globalThis.localStorage, fetchImpl = globalThis.fetch} = {}) {
  try {
    // Synthetic activity never enters production event/KPI storage.
    if (props?.demo || String(props?.room ?? '').startsWith('demo-') || storage?.getItem('seoulbeauty-community-mode') === 'offline') return;
    const body = JSON.stringify(buildEvent(name, productId, props, deviceId(storage)));
    fetchImpl(SUPABASE_URL + '/rest/v1/app_events', {method: 'POST', keepalive: true, body,
      headers: {apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal'}}).catch(() => {});
  } catch {}
}
