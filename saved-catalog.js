// Saved items are local product snapshots. Saving never calls request_tracking or creates history.
const KEY='seoulbeauty-catalog-saves-v1';
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}};
export function readCatalogSaves(storage){
  try{const rows=JSON.parse(storage?.getItem(KEY)??'[]');return Array.isArray(rows)?rows.filter(p=>p&&typeof p.id==='string'&&p.id.startsWith('catalog|')&&typeof p.sku==='string'&&typeof p.name==='string'&&Number.isFinite(p.price)&&safeUrl(p.url)):[]}catch{return []}
}
export function saveCatalogSnapshot(item,storage){
  const url=safeUrl(item.url)||safeUrl(item.affiliate_url);if(!url)throw Error('No purchase URL');
  const p={id:['catalog',item.retailer,item.market,item.sku].join('|'),sku:item.sku,brand:item.brand,brandKo:item.brandKo??item.brand_ko??null,name:item.name,
    familyKey:item.family_key??null,category:item.category??'기타',size:item.size_label??'',retailer:item.retailer,currency:item.currency??'USD',url,affiliateUrl:safeUrl(item.affiliate_url),imageUrl:safeUrl(item.image_url),price:item.price??item.price_minor/100,
    delivery:null,availability:item.availability??'unknown',checkedAt:null,changedAt:null,history:[],savedAt:new Date().toISOString()};
  if(!Number.isFinite(p.price)||p.price<=0)throw Error('Invalid price');
  const rows=readCatalogSaves(storage).filter(x=>x.id!==p.id);rows.push(p);storage.setItem(KEY,JSON.stringify(rows));return p;
}
export function mergeCatalogSaves(products,saved){const keys=new Set(saved.map(p=>p.retailer+'|'+p.sku));return [...products.filter(p=>!keys.has(p.retailer+'|'+p.sku)),...saved]}
