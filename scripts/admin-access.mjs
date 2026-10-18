// Run only in a trusted operator environment. Never ship the secret key to the browser.
const [action,id]=process.argv.slice(2);
if (!['grant','revoke'].includes(action)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'')) {
  console.error('Usage: SUPABASE_SECRET_KEY=<operator secret> node scripts/admin-access.mjs grant|revoke <Auth user UUID>');process.exit(1);
}
const key=process.env.SUPABASE_SECRET_KEY;
if(!key){console.error('Set SUPABASE_SECRET_KEY in the operator environment.');process.exit(1);}
const url='https://mqsnshnlfwsgabrsmqsz.supabase.co/auth/v1/admin/users/'+id;
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
try {
  const before=await fetch(url,{headers,signal:AbortSignal.timeout(10000)});
  if(!before.ok)throw Error();
  const user=await before.json();if(user.id!==id)throw Error();
  const updated=await fetch(url,{method:'PUT',headers,body:JSON.stringify({app_metadata:{...user.app_metadata,seoulbeauty_admin:action==='grant'}}),signal:AbortSignal.timeout(10000)});
  if(!updated.ok)throw Error();
  const check=await fetch(url,{headers,signal:AbortSignal.timeout(10000)});
  if(!check.ok||(await check.json()).app_metadata?.seoulbeauty_admin!==(action==='grant'))throw Error();
  console.log(action==='grant'?'Admin role granted and verified.':'Admin role revoked and verified.');
} catch {console.error('Admin role change could not be verified. Check operator permissions in Supabase; no credentials are printed.');process.exit(1);}
