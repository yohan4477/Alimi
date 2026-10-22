// Generic decorative artwork, never a replacement for a product actually mentioned.
export const categoryArt = {skin:'skincare', skincare:'skincare', makeup:'makeup', sun:'sun', etc:'cushion'};
const defaults = {skincare:'cream-jar', makeup:'warm-palette', sun:'white-sunscreen', cushion:'ivory-cushion', lip:'mauve-tint', toner:'toner-pad-jar'};
export const artPath = name => `assets/category-hd/extra/${defaults[categoryArt[name] ?? name] ?? name}.webp`;
const variants = ['cream-jar','cleanser','ampoule','warm-palette','blush-compact','white-sunscreen','ivory-cushion','mauve-tint','peach-lip-balm','toner-pad-jar'];
export function roomArt(room) {
  const words = [room.id, room.tag, room.title_ko, room.title_en, ...(room.concerns ?? [])].join(' ');
  if (/sunscreen|선크림|선케어|spf/i.test(words)) return artPath('sun');
  if (/cleanse|세안|클렌/i.test(words)) return artPath('cleanser');
  if (/balm|립밤|입술.*건조/i.test(words)) return artPath('peach-lip-balm');
  if (/cushion|base|쿠션|베이스/i.test(words)) return artPath('cushion');
  if (/blush|블러셔|치크/i.test(words)) return artPath('blush-compact');
  if (/shadow|팔레트|섀도/i.test(words)) return artPath('makeup');
  if (/lip|shade|립|틴트/i.test(words)) return artPath('lip');
  if (/makeup|메이크업/i.test(words)) return artPath('blush-compact');
  if (/pores|routine|토너|모공/i.test(words)) return artPath('toner');
  if (/acne|trouble|여드름|트러블/i.test(words)) return artPath('ampoule');
  if (/dry|sensitive|건성|민감/i.test(words)) return artPath('cream-jar');
  if (/skin|피부/i.test(words)) return artPath('skincare');
  const hash = [...String(room.id ?? '')].reduce((n,c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  return artPath(variants[hash % variants.length]);
}
