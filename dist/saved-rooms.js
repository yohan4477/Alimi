// Rooms saved with the bookmark (journey 6-1): ids on this device only, newest first.
const KEY = 'seoulbeauty-saved-rooms-v1', RECENT = 'seoulbeauty-recent-rooms-v1';
let storage; try { storage = localStorage; } catch {}
const read = key => { try { const v = JSON.parse(storage.getItem(key)); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; } };
const write = (key, list) => { try { storage.setItem(key, JSON.stringify(list)); } catch {} };
export const readSavedRooms = () => read(KEY);
export const isSavedRoom = id => read(KEY).includes(id);
export function toggleSavedRoom(id) {
  const list = read(KEY), on = !list.includes(id);
  write(KEY, on ? [id, ...list].slice(0, 100) : list.filter(x => x !== id));
  return on;
}
// Rooms opened recently on this device (journey 6-5 "최근 본 대화").
export const readRecentRooms = () => read(RECENT);
export const addRecentRoom = id => write(RECENT, [id, ...read(RECENT).filter(x => x !== id)].slice(0, 10));
