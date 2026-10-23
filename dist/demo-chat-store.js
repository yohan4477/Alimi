// Local-only demo messages. This module never calls the production API.
import {lang} from './i18n.js';
import {isDemoArtifact, cleanDemoMessages} from './demo-content.js';
export const DEMO_CHAT_KEY = 'seoulbeauty-demo-chat-v1';
export function createDemoChatStore(storage) {
  let rooms = {};
  try { const saved = JSON.parse(storage?.getItem(DEMO_CHAT_KEY)); if (saved && typeof saved === 'object' && !Array.isArray(saved)) rooms = saved; } catch {}
  let cleaned = false;
  for (const [id, list] of Object.entries(rooms)) {
    if (!id.startsWith('demo-') || !Array.isArray(list)) continue;
    const next = cleanDemoMessages(list);
    if (JSON.stringify(next) !== JSON.stringify(list)) { rooms[id] = next; cleaned = true; }
  }
  if (cleaned) { try { storage?.setItem(DEMO_CHAT_KEY, JSON.stringify(rooms)); } catch {} }
  return {
    messages(roomId) { return Array.isArray(rooms[roomId]) ? rooms[roomId].filter(m => m.demo === true && m.room_id === roomId) : []; },
    send(roomId, body, item, replyTo, authorTag) {
      if (!roomId.startsWith('demo-')) throw Error('Demo room required');
      body = String(body).trim().slice(0, 500);
      if (isDemoArtifact(body)) throw Error('Artificial demo content');
      if (!body && !item) throw Error('Empty message');
      const previous = this.messages(roomId);
      const id = Math.max(Date.now(), ...Object.values(rooms).flat().map(m => Number(m.id) + 1 || 0));
      const message = {id, room_id: roomId, body, item, reply_to: replyTo, author_tag: authorTag, nickname: lang === 'ko' ? '나 · 데모' : 'Me · Demo', likes: 0, created_at: new Date().toISOString(), demo: true};
      rooms[roomId] = [...previous, message].slice(-200);
      let persisted = false;
      try { storage?.setItem(DEMO_CHAT_KEY, JSON.stringify(rooms)); persisted = Boolean(storage); } catch {}
      return {message, persisted};
    }
  };
}
