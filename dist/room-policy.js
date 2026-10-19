// Room tags are separate from onboarding; legacy preferences remain compatible.
export const ROOM_TAGS = [{"id": "acne", "group": "skin"}, {"id": "dry", "group": "skin"}, {"id": "sensitive", "group": "skin"}, {"id": "pores", "group": "skin"}, {"id": "sebum", "group": "skin"}, {"id": "redness", "group": "skin"}, {"id": "spots", "group": "skin"}, {"id": "flakes", "group": "skin"}, {"id": "firmness", "group": "skin"}, {"id": "shade", "group": "makeup"}, {"id": "caking", "group": "makeup"}, {"id": "longwear", "group": "makeup"}, {"id": "coverage", "group": "makeup"}, {"id": "color", "group": "makeup"}, {"id": "lip", "group": "product"}, {"id": "base", "group": "product"}, {"id": "eye", "group": "product"}, {"id": "cheek", "group": "product"}, {"id": "sun", "group": "product"}];
export const TAG_ALIASES = {trouble: 'acne', cushion: 'base'};
export const canonicalTags = ids => [...new Set((ids ?? []).map(id => TAG_ALIASES[id] ?? id))];
export function offeredTags(field) {
  return ROOM_TAGS.filter(t => field === 'talk' || t.group === field || (t.group === 'product' && (field === 'skin' ? t.id === 'sun' : t.id !== 'sun')));
}
export function toggleRoomTag(selected, id) {
  if (selected.includes(id)) return selected.filter(t => t !== id);
  return selected.length < 3 ? [...selected, id] : selected;
}
export const deletedMessage = m => !m.body && !m.item;
