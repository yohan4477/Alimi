const UPSTREAM='https://seoulbeauty-muse-play.yohan4477.chatgpt.site';
const ROUTES={session:['GET'],record:['POST'],invite:['GET'],stats:['GET'],'share-config':['GET'],reflection:['POST']};
const ORIGINS=new Set(['https://seoulbeauty.me','https://www.seoulbeauty.me','https://alimi-omega.vercel.app']);
const deviceCookie=value=>String(value||'').match(/(?:^|;\s*)muse_device=([a-f0-9-]{36})(?:;|$)/)?.[0].replace(/^;\s*/,'')||'';
export function createBeautyPlayHandler({fetcher=fetch,allowedOrigins=ORIGINS,cookieSecure=true}={}){return async function handler(req,res){
 const u=new URL(req.url,'https://seoulbeauty.me'),route=req.query?.route||u.searchParams.get('route');
 if(typeof route!=='string'||!Object.hasOwn(ROUTES,route)){res.statusCode=404;return res.end('Not found');}
 if(!ROUTES[route].includes(req.method)){res.statusCode=405;res.setHeader('Allow',ROUTES[route].join(', '));return res.end('Method not allowed');}
 // Accept writes only from our own production origins, before re-originating upstream.
 if(req.method==='POST'&&!allowedOrigins.has(req.headers.origin)){res.statusCode=403;return res.end('Origin not allowed');}
 const target=new URL('/api/'+route,UPSTREAM);for(const [k,v] of u.searchParams)if(k!=='route')target.searchParams.append(k,v);
 const headers={'Accept':'application/json'};const cookie=deviceCookie(req.headers.cookie);if(cookie)headers.Cookie=cookie;
 let body;if(req.method==='POST'){body=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString():req.body?JSON.stringify(req.body):'';if(!body){for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)break;}}if(Buffer.byteLength(body)>4096){res.statusCode=413;return res.end('Too large');}headers['Content-Type']='application/json';headers.Origin=UPSTREAM;}
 try{const upstream=await fetcher(target,{method:req.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(12000)});if(upstream.status>=300&&upstream.status<400)throw Error('Unexpected redirect');
 res.statusCode=upstream.status;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',upstream.headers.get('content-type')||'application/json');res.setHeader('X-Content-Type-Options','nosniff');
 const setCookie=upstream.headers.get('set-cookie');if(route==='session'&&setCookie&&/^muse_device=[a-f0-9-]{36};/.test(setCookie))res.setHeader('Set-Cookie',setCookie.replace(/Path=\/[^;]*/i,'Path=/beauty-play').replace(/;\s*Domain=[^;]+/gi,'').replace(cookieSecure?/$^/:/;\s*Secure/gi,''));
 return res.end(Buffer.from(await upstream.arrayBuffer()));
 }catch{res.statusCode=502;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({error:'연결하지 못했어요. 잠시 후 다시 시도해 주세요.'}));}
};}
export default createBeautyPlayHandler();
