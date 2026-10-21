// Seoul Beauty discovery seed: retailer rankings are NOT community popularity.
// Feed image presence is not proof of reuse permission.
const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
export const productIdentity = p => p.ean ? 'ean:'+String(p.ean).trim() : [p.brand,p.name,p.size,p.option].map(norm).join(':');
export function mergeRetailerRankings(entries, catalogProducts = []) {
  const byEan = new Map(catalogProducts.filter(p=>p.ean).map(p=>[String(p.ean),p]));
  const byName = new Map(catalogProducts.map(p=>[[p.brand,p.name,p.size,p.option].map(norm).join(':'),p]));
  const result = new Map();
  for (const e of entries) {
    if (!['ulta_us','oliveyoung_global'].includes(e.source)) throw Error('Unknown ranking source');
    if (!Number.isInteger(e.rank) || e.rank < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(e.observedOn)) throw Error('Invalid ranking observation');
    const match = (e.ean && byEan.get(String(e.ean))) || byName.get([e.brand,e.name,e.size,e.option].map(norm).join(':'));
    const id = match ? productIdentity(match) : productIdentity(e);
    const item = result.get(id) ?? {id, brand:e.brand, name:e.name, size:e.size??null, option:e.option??null, catalogSlug:match?.slug??null, sources:[]};
    if (!item.sources.some(s=>s.source===e.source && s.observedOn===e.observedOn && s.rank===e.rank)) {
      item.sources.push({source:e.source,rank:e.rank,observedOn:e.observedOn,sourceUrl:e.sourceUrl??null,market:e.source==='ulta_us'?'US':'Global'});
    }
    result.set(id,item);
  }
  return [...result.values()];
}
export function imageEligible(product, permission) {
  return Boolean(product?.catalogSlug && permission?.verified === true && permission?.scope?.includes('community_onboarding') && permission?.source === 'stylevana_awin');
}
