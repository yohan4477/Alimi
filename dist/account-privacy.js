import {SYNC_KEYS} from './account-sync.js';

// This is a local preferences export, not a full server/account data export.
// The owner marker must match a freshly verified session before any values are read.
export function accountPreferencesExport(auth,storage,{expectedOwner=auth.user?.id,now=()=>new Date()}={}){
  const user=auth.user;
  if(!user?.id||!auth.session?.access_token||user.id!==expectedOwner||storage?.getItem('seoulbeauty-data-owner')!==user.id)throw Error('account_preferences_not_ready');
  const data={exported_at:now().toISOString(),scope:'locally_saved_account_preferences',account:{id:user.id,email:user.email??null,provider:user.app_metadata?.provider??null},preferences:{}};
  for(const key of SYNC_KEYS){
    const value=storage.getItem(key);
    if(value!==null&&value!==undefined){try{data.preferences[key]=JSON.parse(value)}catch{data.preferences[key]=value}}
  }
  return data;
}
