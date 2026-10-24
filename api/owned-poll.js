// Staged product poll API. Disabled by default even on preview deployments.
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
const CATALOG=new Set(JSON.parse(readFileSync(new URL('../server/owned-poll-catalog.json',import.meta.url),'utf8')).map(p=>p.id));
const CHOICES=new Set(['owned','past','want','unknown']);
const FOLLOWUPS={owned:['daily','weekly','sometimes','rarely'],past:['rebuy_yes','rebuy_unsure','rebuy_no'],want:['looks','social','recommended','replacement'],unknown:['curious','not_sure']};
const ALLOWED=new Set(['https://seoulbeauty.me','https://www.seoulbeauty.me','https://alimi-omega.vercel.app']);
const COOKIE='sb_poll_id';
function parseCookie(req){return String(req.headers.cookie||'').match(/(?:^|;\s*)sb_poll_id=([0-9a-f-]{36})(?:;|$)/)?.[1]||null;}
function encode(id,secret){return createHmac('sha256',secret).update(id).digest('hex');}
function identity(req,res,secret){const raw=parseCookie(req);const sig=String(req.headers.cookie||'').match(/(?:^|;\s*)sb_poll_sig=([0-9a-f]{64})(?:;|$)/)?.[1];if(raw&&sig&&timingSafeEqual(Buffer.from(sig),Buffer.from(encode(raw,secret))))return raw;const id=randomUUID();const secure='; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000';res.setHeader('Set-Cookie',[COOKIE+'='+id+secure,'sb_poll_sig='+encode(id,secret)+secure]);return id;}
export function createOwnedPollHandler({env=process.env,fetcher=fetch}={}){return async (req,res)=>{
const send=(status,obj)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(obj));};
if(env.OWNED_POLL_ENABLED!=='true')return send(404,{error:'Feature not available'});
if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed'});
if(req.method==='POST'&&!ALLOWED.has(req.headers.origin))return send(403,{error:'Origin not allowed'});
const key=env.SUPABASE_SECRET_KEY,secret=env.OWNED_POLL_COOKIE_SECRET,url=env.SUPABASE_URL||'https://mqsnshnlfwsgabrsmqsz.supabase.co';
if(!key||!secret||secret.length<32)return send(503,{error:'Feature not configured'});
const u=new URL(req.url,'https://seoulbeauty.me'),product=u.searchParams.get('product');
if(!product||!CATALOG.has(product))return send(400,{error:'Invalid product'});
const id=identity(req,res,secret);
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
const endpoint=url+'/rest/v1/owned_product_votes';
try{
 if(req.method==='POST'){
  let body=req.body;
  if(body===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2048)return send(413,{error:'Too large'});chunks.push(chunk);}body=Buffer.concat(chunks).toString();}
  if(typeof body==='string'){if(Buffer.byteLength(body)>2048)return send(413,{error:'Too large'});body=JSON.parse(body);}
  if(!body||!CHOICES.has(body.choice))return send(400,{error:'Invalid choice'});
  if(body.followup!==undefined&&body.followup!==null&&!(FOLLOWUPS[body.choice]||[]).includes(body.followup))return send(400,{error:'Invalid follow-up'});
  if(body.note!==undefined&&(typeof body.note!=='string'||body.note.length>160||/[\\u0000-\\u001f]/.test(body.note)))return send(400,{error:'Invalid note'});
  const response=await fetcher(endpoint+'?on_conflict=product_id,voter_id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({product_id:product,voter_id:id,choice:body.choice,followup:body.followup??null,...(body.note!==undefined?{private_note:body.note.trim()}:{}),updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)return send(503,{error:'Vote could not be saved'});
 }
 const query=new URLSearchParams({select:'choice,followup,voter_id',product_id:'eq.'+product,limit:'10001'});
 const results=await fetcher(endpoint+'?'+query,{headers,signal:AbortSignal.timeout(8000)});
 if(!results.ok)return send(503,{error:'Results unavailable'});
 const rows=await results.json();if(!Array.isArray(rows)||rows.length>10000)return send(503,{error:'Results temporarily unavailable'});
 const counts=Object.fromEntries([...CHOICES].map(c=>[c,0]));let mine=null,mineFollowup=null;const followupCounts=Object.fromEntries(Object.entries(FOLLOWUPS).map(([k,v])=>[k,Object.fromEntries(v.map(x=>[x,0]))]));
 for(const row of rows){if(Object.hasOwn(counts,row.choice))counts[row.choice]++;if(row.followup&&followupCounts[row.choice]&&Object.hasOwn(followupCounts[row.choice],row.followup))followupCounts[row.choice][row.followup]++;if(row.voter_id===id){mine=row.choice;mineFollowup=row.followup||null;}}
 return send(200,{product,counts,total:rows.length,mine,mineFollowup,followupCounts});
}catch{return send(503,{error:'Please try again'});}
};}
export default createOwnedPollHandler();
