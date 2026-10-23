import {createHash,randomBytes} from 'node:crypto';
import {authRequest} from './admin-auth.js';
import {validateCommand,aggregateAnswers,shareSnapshot,supportedCharacterIds} from './beauty-game-domain.mjs';

const BASE='https://mqsnshnlfwsgabrsmqsz.supabase.co';
const ORIGINS=new Set(['https://seoulbeauty.me','https://www.seoulbeauty.me','https://alimi-omega.vercel.app']);
const ROUTES={session:'GET',record:'POST',invite:'GET',stats:'GET','share-config':'GET',reflection:'POST','link-account':'POST'};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const GAME_COOKIE='__Host-beauty_game';
const error=(status,message='요청을 처리할 수 없어요.')=>Object.assign(new Error(message),{status});
function sessionToken(headers,name) {
  const cookie=headers.cookie;
  if(typeof cookie!=='string'||cookie.length>8192) return null;
  const values=cookie.split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
  if(values.length!==1) return null;
  const token=values[0].slice(name.length+1);
  return /^[a-f0-9]{64}$/.test(token)?token:null;
}
async function inputBody(req) {
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')) throw error(415);
  if(Number(req.headers['content-length'])>4096) throw error(413);
  let body=req.body;
  if(body===undefined) {
    const chunks=[]; let size=0;
    for await(const chunk of req) {size+=Buffer.byteLength(chunk);if(size>4096)throw error(413);chunks.push(Buffer.from(chunk));}
    body=Buffer.concat(chunks).toString('utf8');
  }
  if(Buffer.isBuffer(body)) body=body.toString('utf8');
  if(typeof body==='string') {if(Buffer.byteLength(body)>4096)throw error(413);try{body=JSON.parse(body);}catch{throw error(400);}}
  if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>4096)throw error(400);
  return body;
}

export function createGameRpc({env=process.env,fetchImpl=fetch}={}) {
  return async(action,sessionHash,payload={})=>{
    const key=env.SUPABASE_SECRET_KEY;
    if(typeof key!=='string'||!key) throw error(503);
    const headers={apikey:key,'Content-Type':'application/json'};
    if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
    let response;
    try {response=await fetchImpl(BASE+'/rest/v1/rpc/beauty_game_command',{
      method:'POST',headers,body:JSON.stringify({p_action:action,p_session_hash:sessionHash,p_payload:payload}),
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)
    });}catch{throw error(503);}
    // Database text/errors may contain private values; never forward them or log them.
    if(!response.ok)throw error(response.status===429?429:503);
    let data;try{data=await response.json();}catch{throw error(503);}
    if(!data||typeof data!=='object'||Array.isArray(data))throw error(503);
    if(data.error)throw error([400,401,403,404,409,413,429].includes(data.status)?data.status:503);
    return data;
  };
}

export function createBeautyGameHandler({env=process.env,fetchImpl=fetch,rpc=createGameRpc({env,fetchImpl}),allowedOrigins=ORIGINS,cookieSecure=true,randomToken=()=>randomBytes(32).toString('hex'),verifyAccount=async token=>authRequest('/user',{token,fetchImpl})}={}) {
  const cookieName=cookieSecure?GAME_COOKIE:'beauty_game_dev';
  const setCookie=(res,token)=>res.setHeader('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${cookieSecure?'; Secure':''}; Max-Age=15552000`);
  const newSession=async()=>{
    const token=randomToken();if(!/^[a-f0-9]{64}$/.test(token))throw error(503);
    await rpc('session',createHash('sha256').update(token).digest('hex'),{});return token;
  };
  return async(req,res)=>{
    for(const [k,v] of Object.entries({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}))res.setHeader(k,v);
    const send=(status,data)=>{res.statusCode=status;return res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'https://seoulbeauty.me');
      const route=req.query?.route??url.searchParams.get('route');
      if(typeof route!=='string'||!Object.hasOwn(ROUTES,route))return send(404,{error:'Not found'});
      // Separate release gate: callers must use explicit consent and restart after rotation.
      if(route==='link-account'&&env.BEAUTY_GAME_ACCOUNT_LINK_ENABLED!=='true')return send(404,{error:'Not found'});
      if(req.method!==ROUTES[route]){res.setHeader('Allow',ROUTES[route]);return send(405,{error:'Method not allowed'});}
      if(req.headers['sec-fetch-site']==='cross-site')throw error(403);
      if(req.method==='POST'&&!allowedOrigins.has(req.headers.origin))throw error(403);
      if(route==='share-config')return send(200,{kakaoKey:env.KAKAO_JAVASCRIPT_KEY||null});
      let token=sessionToken(req.headers,cookieName);
      if(route==='session') {
        if(!token)token=await newSession();
        else if((await rpc('session',createHash('sha256').update(token).digest('hex'),{})).rotate)token=await newSession();
        setCookie(res,token);
        return send(200,{ok:true,supportedCharacterIds,accountLinkEnabled:env.BEAUTY_GAME_ACCOUNT_LINK_ENABLED==='true'});
      }
      if(!token)throw error(401);
      const sessionHash=createHash('sha256').update(token).digest('hex');
      let input;
      if(req.method==='POST')input=await inputBody(req);
      else {
        input={};for(const [k,v] of url.searchParams){if(k==='route')continue;if(Object.hasOwn(input,k))throw error(400);input[k]=v;}
      }
      let context;
      if(route==='record'&&input.invite) {
        if(typeof input.invite!=='string'||!UUID.test(input.invite)||!UUID.test(input.play||''))throw error(400);
        const invitation=await rpc('invite',sessionHash,{id:input.invite,play:input.play,reveal:false});
        if(invitation.character!==input.character||Boolean(invitation.test)!==Boolean(input.test))throw error(400);
        context={snapshot:invitation.snapshot};
      }
      const normalized=validateCommand(route,input,context);
      if(route==='link-account') {
        const bearer=req.headers.authorization;
        if(typeof bearer!=='string'||bearer.length>4096||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer))throw error(401);
        const user=await verifyAccount(bearer.slice(7));
        if(!user||!UUID.test(user.id||'')||user.is_anonymous!==false)throw error(401);
        const linked=await rpc('link',sessionHash,{user_id:user.id,consent:normalized.consent});
        if(linked.ok!==true)throw error(503);
        // The linked session is sealed in the same DB transaction. All future gameplay
        // receives a fresh unlinked identity, including after logout/account switching.
        setCookie(res,await newSession());
        return send(200,{ok:linked.ok===true});
      }
      if(route==='stats') {
        const result=await rpc('stats',sessionHash,{characters:normalized.characters,test:normalized.test});
        if(!Array.isArray(result.answers))throw error(503);
        return send(200,aggregateAnswers(result.answers,normalized));
      }
      if(route==='invite') {
        const result=await rpc('invite',sessionHash,normalized);
        if(!UUID.test(result.id||'')||typeof result.character!=='string')throw error(503);
        // Explicit response projection prevents leaking private DB fields if RPC evolves.
        const output={id:result.id,character:result.character,test:Number(Boolean(result.test)),snapshot:result.snapshot};
        if(normalized.reveal)for(const key of ['product','reason','shade','advice','adviceLabel'])if(Object.hasOwn(result,key))output[key]=result[key];
        return send(200,output);
      }
      const {kind,...payload}=normalized;
      const action=route==='record'?kind:'reflection';
      payload.version='muse-v4';
      if(action==='share')payload.snapshot=context?.snapshot||shareSnapshot(payload.character);
      const result=await rpc(action,sessionHash,payload);
      if(action==='share') {
        if(!UUID.test(result.id||''))throw error(503);
        return send(200,{ok:true,id:result.id,character:payload.character,test:Number(payload.test)});
      }
      return send(200,{ok:true});
    }catch(e){
      const status=[400,401,403,404,409,413,415,429,503].includes(e?.status)?e.status:503;
      if(status===429)res.setHeader('Retry-After','60');
      return send(status,{error:status===503?'연결하지 못했어요. 잠시 후 다시 시도해 주세요.':'요청을 처리할 수 없어요.'});
    }
  };
}
