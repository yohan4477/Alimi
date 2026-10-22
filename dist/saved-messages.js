// Individual message bookmarks, separate from room bookmarks.
const KEY = 'seoulbeauty-saved-messages-v1';
let local; try { local = localStorage; } catch {}
export function readSavedMessages(storage = local) {
  try { const list = JSON.parse(storage.getItem(KEY)); return Array.isArray(list) ? list.filter(m => m && typeof m.room_id === 'string' && Number.isInteger(m.id)) : []; } catch { return []; }
}
export function toggleSavedMessage(message, storage = local) {
  const list = readSavedMessages(storage);
  const has = list.some(m => m.room_id === message.room_id && m.id === message.id);
  const next = has ? list.filter(m => m.room_id !== message.room_id || m.id !== message.id) : [{id:message.id,room_id:message.room_id,room_title:message.room_title,nickname:message.nickname,body:message.body,item:message.item,created_at:message.created_at}, ...list].slice(0,100);
  storage.setItem(KEY, JSON.stringify(next));
  return !has;
}
