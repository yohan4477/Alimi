// Rankings describe only the fetched recent sample, never all conversations or recommendations.
export const activeRooms = rooms => [...rooms].filter(r => r.messages_24h > 0)
  .sort((a,b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '') || b.messages_24h-a.messages_24h).slice(0,6);
export function mentionedProducts(entries, blocked = [], now = Date.now()) {
  const groups = new Map(), seen = new Set();
  for (const e of entries) {
    if (!e.item || blocked.includes(e.author_tag) || now-Date.parse(e.created_at) > 86400000 || !Number.isFinite(Date.parse(e.created_at))) continue;
    const id = `${e.source}:${e.id}`; if (seen.has(id)) continue; seen.add(id);
    const key = e.item.sku ? [e.item.retailer,e.item.market,e.item.sku].join(':') : e.item.family_key;
    if (!groups.has(key)) groups.set(key,{item:e.item,authors:new Set(),rooms:new Set(),entries:[]});
    const g=groups.get(key);g.authors.add(e.author_tag);g.rooms.add(e.room_id);g.entries.push(e);
  }
  return [...groups.values()].sort((a,b)=>b.authors.size-a.authors.size || b.rooms.size-a.rooms.size).slice(0,12);
}
