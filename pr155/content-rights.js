// An arbitrary non-empty note is not permission. This record must be reviewed per use/platform.
export function contentGrant(raw, {retailer,market='US',platform='web',use='product_description'}={}) {
  let grant=raw;
  try { if(typeof raw==='string')grant=JSON.parse(raw); } catch { return null; }
  if(!grant || grant.status!=='verified' || grant.retailer!==retailer || grant.market!==market ||
    !Array.isArray(grant.platforms) || !grant.platforms.includes(platform) ||
    !Array.isArray(grant.uses) || !grant.uses.includes(use) ||
    !Number.isFinite(Date.parse(grant.checkedAt)))return null;
  try { const url=new URL(grant.evidenceUrl);if(url.protocol!=='https:'||url.username||url.password)return null; } catch {return null;}
  if(grant.expiresAt && (!Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt)<=Date.now()))return null;
  return grant;
}
