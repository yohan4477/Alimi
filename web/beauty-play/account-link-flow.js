import {AUTH_STORAGE_KEYS} from '../../dist/auth.js';

function storedToken(auth) {
  try { return JSON.parse(auth.storage.getItem(AUTH_STORAGE_KEYS.SESSION_KEY) || 'null')?.access_token || null; }
  catch { return null; }
}

// GoogleAuth may refresh and save a session. Do not let a refresh that started
// under account A overwrite a logout or account B arriving from another tab.
export async function restoreAccount(auth) {
  const storage=auth.storage;
  let expected=storage.getItem(AUTH_STORAGE_KEYS.SESSION_KEY);
  const check=()=>{if(storage.getItem(AUTH_STORAGE_KEYS.SESSION_KEY)!==expected)throw new Error('Account changed');};
  auth.storage={
    getItem:key=>storage.getItem(key),
    setItem:(key,value)=>{if(key===AUTH_STORAGE_KEYS.SESSION_KEY)check();storage.setItem(key,value);if(key===AUTH_STORAGE_KEYS.SESSION_KEY)expected=value;},
    removeItem:key=>{if(key===AUTH_STORAGE_KEYS.SESSION_KEY)check();storage.removeItem(key);if(key===AUTH_STORAGE_KEYS.SESSION_KEY)expected=null;},
  };
  try { return await auth.restore(); } finally { auth.storage=storage; }
}

// Only an explicit click calls this helper. User identity is verified by the API,
// not by decoding JWT claims in this client.
export async function linkGameAccount({consent,displayedUserId,auth,isCurrent=()=>true,fetchImpl=globalThis.fetch,navigate=url=>globalThis.location.assign(url)}) {
  if(consent !== true || !displayedUserId) return {status:'consent_required'};
  const user=await restoreAccount(auth);
  const token=auth.session?.access_token;
  if(!isCurrent() || !user || user.id !== displayedUserId || !token || storedToken(auth) !== token) return {status:'account_changed'};
  const response=await fetchImpl('/api/link-account',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({consent:true}),
  });
  // A storage/account change after dispatch cannot undo a request already sent.
  // Do not claim that the currently displayed account received that history.
  if(!isCurrent() || storedToken(auth) !== token) return {status:'account_changed_after_send'};
  if(!response.ok) throw new Error('Account link failed');
  const result=await response.json();
  if(result?.ok !== true) throw new Error('Account link failed');
  if(!isCurrent() || storedToken(auth) !== token) return {status:'account_changed_after_send'};
  navigate('/beauty-play/');
  return {status:'linked'};
}
