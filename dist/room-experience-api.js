import {SUPABASE_URL,restGet,rpc} from './supabase.js';
export async function fetchExperiences(room,fetchImpl=fetch) {
  // Read every page so counts are never silently capped by PostgREST's default row limit.
  const rows=[];
  for(let offset=0;;) {
    const page=await restGet(SUPABASE_URL+'/rest/v1/room_experiences?'+new URLSearchParams({select:'*',room_id:'eq.'+room,order:'author_tag,product_key',limit:'500',offset:String(offset)}),fetchImpl);
    rows.push(...page);if(!page.length)break;offset+=page.length;
  }
  return rows;
}
export const saveExperience=(secret,room,key,value,fetchImpl=fetch)=>rpc('set_room_experience',{p_secret:secret,p_room:room,p_product:key,p_value:value},fetchImpl);
export const deleteExperience=(secret,room,key,fetchImpl=fetch)=>rpc('delete_room_experience',{p_secret:secret,p_room:room,p_product:key},fetchImpl);
