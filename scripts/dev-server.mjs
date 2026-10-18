import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAdminHandler} from '../api/admin.js';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
export function createLocalServer({adminHandler = createAdminHandler({env: {...process.env, ADMIN_ORIGIN: process.env.ADMIN_ORIGIN || 'http://localhost:3000'}})} = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (['/admin','/admin/','/api/admin'].includes(url.pathname)) return adminHandler(req, res);
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    let name;
    try { name = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root) || name.split('/').some(p => p.startsWith('.'))) { res.writeHead(404); return res.end(); }
    try {
      const bytes = await readFile(file); res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); return res.end('Not found'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createLocalServer().listen(3000, '127.0.0.1', () => console.log('SeoulBeauty: http://localhost:3000/ · admin: http://localhost:3000/admin'));
}
