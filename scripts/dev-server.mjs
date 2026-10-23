import {staticEntryPath} from '../dist/public-routes.js';
import languageHandler from '../api/language.js';
import {configuredBeautyPlayHandler} from '../api/beauty-play.js';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAdminHandler} from '../api/admin.js';
import {createCoupangHandler} from '../api/coupang.js';
import {createOliveYoungHandler} from '../api/oliveyoung.js';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const beautyPlayHandler=configuredBeautyPlayHandler(process.env,{cookieSecure:false,allowedOrigins:new Set(['https://seoulbeauty.me','http://localhost:3000','http://terminal.local:4173'])});
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
export function createLocalServer({adminHandler = createAdminHandler({env: {...process.env, ADMIN_ORIGIN: process.env.ADMIN_ORIGIN || 'http://localhost:3000'}}), coupangHandler = createCoupangHandler(), oliveYoungHandler = createOliveYoungHandler()} = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname.startsWith('/beauty-play/api/')){req.url='/api/beauty-play?'+new URLSearchParams({...Object.fromEntries(url.searchParams),route:url.pathname.slice('/beauty-play/api/'.length)});return beautyPlayHandler(req,res);}
    if (['/admin','/admin/','/api/admin'].includes(url.pathname)) return adminHandler(req, res);
    if (url.pathname === '/api/language') return languageHandler(req,res);
    if (url.pathname === '/api/coupang') return coupangHandler(req, res);
    if (url.pathname === '/api/oliveyoung') return oliveYoungHandler(req, res);
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    let name;
    try { name = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
    const file = path.resolve(root, '.' + (['/beauty-play','/beauty-play/'].includes(name)?'/beauty-play/index.html':staticEntryPath(name)));
    if (!file.startsWith(root) || name.split('/').some(p => p.startsWith('.'))) { res.writeHead(404); return res.end(); }
    try {
      const bytes = await readFile(file); res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); return res.end('Not found'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||process.argv[process.argv.indexOf('--port')+1])||3000;const hostIndex=process.argv.indexOf('--host');const host=hostIndex>=0?process.argv[hostIndex+1]:'127.0.0.1';
  createLocalServer().listen(port,host,()=>console.log('SeoulBeauty: http://localhost:'+port+'/'));
}
