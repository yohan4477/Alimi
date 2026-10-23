import {ROOM_EXPERIENCES_ENABLED} from './room-feature-release.js';
import {SUPABASE_URL,restGet,rpc} from './supabase.js';
// Deliberately public fields only; future private columns must never leak through select=*.
export const EXPERIENCE_FIELDS='room_id,product_key,author_tag,status,period,repeat,skin,opinion,reasons,concerns,source_message,updated_at';
const quote=value=>'"'+String(value).replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
export async function fetchExperiences(room,fetchImpl=fetch) {
  if(!ROOM_EXPERIENCES_ENABLED)throw Error('chat:unavailable');
  return readExperiencePages(room,fetchImpl);
}
// Pure injected transport reader; production entry remains the gated fetchExperiences.
export async function readExperiencePages(room,fetchImpl) {
  // Stable keyset pagination tolerates deletes and provider page caps. Never display a partial total.
  const rows=[],seen=new Set();let cursor;
  for(let pages=0;pages<101;pages++) {
    const params=new URLSearchParams({select:EXPERIENCE_FIELDS,room_id:'eq.'+room,order:'author_tag.asc,product_key.asc',limit:'500'});
    if(cursor)params.set('or',`(author_tag.gt.${quote(cursor.author_tag)},and(author_tag.eq.${quote(cursor.author_tag)},product_key.gt.${quote(cursor.product_key)}))`);
    const page=await restGet(SUPABASE_URL+'/rest/v1/room_experiences?'+params,fetchImpl);
    if(!Array.isArray(page)||page.length>500)throw Error('experience:response');
    if(!page.length)return rows;
    for(const row of page){
      if(row.room_id!==room||typeof row.author_tag!=='string'||!row.author_tag||typeof row.product_key!=='string'||!row.product_key)throw Error('experience:response');
      const key=JSON.stringify([row.author_tag,row.product_key]);
      if(seen.has(key))throw Error('experience:pagination');
      seen.add(key);rows.push(row);
    }
    if(rows.length>10000)throw Error('experience:limit');
    cursor=page.at(-1);
  }
  throw Error('experience:limit');
}
export const saveExperience=(secret,room,key,value,fetchImpl=fetch)=>rpc('set_room_experience',{p_secret:secret,p_room:room,p_product:key,p_value:value},fetchImpl);
export const deleteExperience=(secret,room,key,fetchImpl=fetch)=>rpc('delete_room_experience',{p_secret:secret,p_room:room,p_product:key},fetchImpl);
