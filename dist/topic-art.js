// Decorative artwork reused from the supplied journey deck, not a claim about products mentioned.
export const categoryArt = {skin:'skincare', skincare:'skincare', makeup:'makeup', sun:'sun', etc:'cushion'};
export const artPath = name => `assets/category/${categoryArt[name] ?? name}.png`;
export function roomArt(room) {
  const words = [room.id, room.tag, room.title_ko, room.title_en, ...(room.concerns ?? [])].join(' ');
  if (/sunscreen|선크림|선케어|spf/i.test(words)) return artPath('sun');
  if (/cushion|base|쿠션|베이스/i.test(words)) return artPath('cushion');
  if (/lip|shade|립|틴트/i.test(words)) return artPath('lip');
  if (/makeup|메이크업/i.test(words)) return artPath('makeup');
  if (/pores|routine|토너|모공/i.test(words)) return artPath('toner');
  if (/skin|acne|dry|sensitive|피부|여드름/i.test(words)) return artPath('skincare');
  return artPath('cushion');
}
