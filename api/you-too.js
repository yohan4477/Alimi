import {createHash} from 'node:crypto';
import {products,validAnswer} from '../dist/you-too/model.js';
const secretPattern=/^[a-f0-9]{64}$/;
export function createYouTooHandler({env=process.env,fetchImpl=fetch}={}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Referrer-Policy','no-referrer');
  const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  if(req.method!=='POST')return reply(405,{error:'method'});
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return reply(415,{error:'content_type'});
  // Same-origin JSON API; never send capability secrets in query strings.
  const origin=req.headers.origin;
  if(origin){try{if(new URL(origin).host!==req.headers.host)return reply(403,{error:'origin'});}catch{return reply(403,{error:'origin'});}}
  let body;
  try{
   if(req.body!==undefined){body=typeof req.body==='string'?JSON.parse(req.body):req.body;}
   else {let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return reply(413,{error:'size'});}body=JSON.parse(raw);}
   if(JSON.stringify(body).length>4096)return reply(413,{error:'size'});
  }catch{return reply(400,{error:'body'});}
  if(!body || !['read','vote','share','invite'].includes(body.action))return reply(400,{error:'action'});
  if(body.invite!=null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.invite))return reply(400,{error:'invite'});
  if(body.action==='invite'){
   if(!/^[0-9a-f-]{36}$/.test(body.invite||''))return reply(400,{error:'invite'});
  }else{
   if(!secretPattern.test(body.secret||'') || !products.some(p=>p.id===body.product))return reply(400,{error:'identity'});
   if(body.action==='vote'&&!validAnswer(body.product,body.choice,body.detail??null))return reply(400,{error:'answer'});
  }
  const url=env.SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return reply(503,{error:'not_configured'});
  const owner=body.secret?createHash('sha256').update(body.secret).digest('hex'):null;
  try{
   const response=await fetchImpl(`${url}/rest/v1/rpc/you_too_action`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({p_action:body.action,p_owner:owner,p_product:body.product??null,p_choice:body.choice??null,p_detail:body.detail??null,p_invite:body.invite??null,p_include_detail:body.includeDetail===true}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)return reply(503,{error:'unavailable'});
   const data=await response.json();
   if(data===null)return reply(404,{error:'not_found'});
   return reply(200,data);
  }catch{return reply(503,{error:'unavailable'});}
 };
}
export default createYouTooHandler();
