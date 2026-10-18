import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {createAdminHandler} from '../api/admin.js';
import {SESSION_COOKIE, isAdmin, adminOrigin, readToken} from '../server/admin-auth.js';

const token = 'header.signed.token';
const admin = {id:'user-1',email_confirmed_at:'2026-10-19T00:00:00Z',is_anonymous:false,app_metadata:{seoulbeauty_admin:true}};
function response(body, status = 200) { return new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json'}}); }
async function request({method='GET',url='/admin',headers={},body,fetchImpl=async()=>response(admin),readPage=async()=>'<p>PRIVATE STRATEGY</p>'}={}) {
  const req=Readable.from(body === undefined || typeof body === 'object' ? [] : [body]);
  Object.assign(req,{method,url,headers}); if (typeof body === 'object') req.body=body;
  const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v},end(b=''){this.body=b}};
  await createAdminHandler({fetchImpl,readPage,env:{NODE_ENV:'test',ADMIN_ORIGIN:'https://admin.example'}})(req,res);
  return res;
}
const cookie={cookie:`${SESSION_COOKIE}=${token}`};
const form={origin:'https://admin.example','content-type':'application/x-www-form-urlencoded'};

test('anonymous page and direct API do not read or expose private content',async()=>{
  for (const url of ['/admin','/api/admin','/admin/']) {
    const r=await request({url,readPage:()=>assert.fail('private page read')});assert.equal(r.statusCode,401);assert.doesNotMatch(r.body,/PRIVATE STRATEGY|sb-strategy/);
    assert.match(r.headers['cache-control'],/no-store/);assert.equal(r.headers['vercel-cdn-cache-control'],'no-store');assert.match(r.headers['content-security-policy'],/frame-ancestors 'none'/);
  }
});
test('authorization ignores editable metadata and requires verified nonanonymous admin',()=>{
  for(const u of [null,{}, {...admin,app_metadata:{},user_metadata:{seoulbeauty_admin:true}}, {...admin,app_metadata:{seoulbeauty_admin:'true'}}, {...admin,is_anonymous:true}, {...admin,email_confirmed_at:null}]) assert.equal(isAdmin(u),false);
  assert.equal(isAdmin(admin),true);
});
test('ordinary user cannot fetch private HTML even with a valid token',async()=>{
  const r=await request({headers:cookie,fetchImpl:async()=>response({...admin,app_metadata:{}}),readPage:()=>assert.fail('private page read')});assert.equal(r.statusCode,403);assert.doesNotMatch(r.body,/PRIVATE STRATEGY/);
});
test('expired or forged token is rejected by Auth server',async()=>{
  const r=await request({headers:cookie,fetchImpl:async()=>response({},401)});assert.equal(r.statusCode,401);assert.match(r.headers['set-cookie'],/Max-Age=0/);
});
test('each admin request revalidates fresh role; demotion takes effect',async()=>{
  let count=0;const calls=[];const fetchImpl=async(url,opt)=>{calls.push([url,opt]);return response(count++===0?admin:{...admin,app_metadata:{}})};
  assert.equal((await request({headers:cookie,fetchImpl})).statusCode,200);
  assert.equal((await request({headers:cookie,fetchImpl})).statusCode,403);
  assert.equal(calls.length,2);assert.ok(calls.every(([url,opt])=>url.endsWith('/user')&&opt.headers.Authorization===`Bearer ${token}`&&opt.cache==='no-store'));
});
test('Auth outage fails closed and never reads dashboard',async()=>{
  const r=await request({headers:cookie,fetchImpl:async()=>response({},503),readPage:()=>assert.fail('private page read')});assert.equal(r.statusCode,503);assert.doesNotMatch(r.body,/PRIVATE STRATEGY/);
});
test('login requires same origin and rejects GET and cross-site POST',async()=>{
  assert.equal((await request({url:'/api/admin?action=login'})).statusCode,405);
  for(const headers of [{}, {...form,origin:'https://evil.example'}, {...form,'sec-fetch-site':'cross-site'}]) {
    const r=await request({method:'POST',url:'/api/admin?action=login',headers,body:'email=a%40b.com&password=secret',fetchImpl:()=>assert.fail('auth request')});assert.equal(r.statusCode,403);
  }
});
test('login keeps tokens HttpOnly, checks live role, and redirects to fixed admin path',async()=>{
  const calls=[];const r=await request({method:'POST',url:'/api/admin?action=login&next=https://evil.example',headers:form,body:'email=a%40b.com&password=secret',fetchImpl:async(url,opt)=>{calls.push([url,opt]);return response(url.includes('/token')?{access_token:token,refresh_token:'never-in-client',expires_in:7200}:admin)}});
  assert.equal(r.statusCode,303);assert.equal(r.headers.location,'/admin');assert.equal(calls.length,2);
  const set=r.headers['set-cookie'];for(const required of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=3600'])assert.ok(set.includes(required));
  assert.doesNotMatch(r.body,/never-in-client|header.signed.token|secret/);assert.equal(JSON.parse(calls[0][1].body).password,'secret');
});
test('password login cannot turn regular user into admin',async()=>{
  const r=await request({method:'POST',url:'/api/admin?action=login',headers:form,body:{email:'user@example.com',password:'secret'},fetchImpl:async(url)=>response(url.includes('/token')?{access_token:token,expires_in:3600,user:admin}:{...admin,app_metadata:{},user_metadata:{seoulbeauty_admin:true}})});
  assert.equal(r.statusCode,403);assert.match(r.headers['set-cookie'],/Max-Age=0/);
});
test('login rejects bad credentials and malformed or oversized forms without leakage',async()=>{
  for(const body of ['email=a%40b.com&password=a&password=b','password=secret','email=x&password=secret','x'.repeat(4100),{email:['a@b.com'],password:'secret'}]) {
    const r=await request({method:'POST',url:'/api/admin?action=login',headers:form,body,fetchImpl:()=>assert.fail('no Auth call')});assert.equal(r.statusCode,400);
  }
  const r=await request({method:'POST',url:'/api/admin?action=login',headers:form,body:'email=a%40b.com&password=secret',fetchImpl:async()=>response({message:'sensitive upstream detail'},400)});assert.equal(r.statusCode,401);assert.doesNotMatch(r.body,/sensitive upstream detail|secret/);
});
test('malformed and duplicate session cookies fail closed',()=>{
  for(const value of ['garbage',`${token}; ${SESSION_COOKIE}=${token}`,'x'.repeat(9000)]) assert.equal(readToken({headers:{cookie:`${SESSION_COOKIE}=${value}`}}),null);
});
test('logout requires POST/same-origin and clears cookie even if upstream fails',async()=>{
  assert.equal((await request({url:'/api/admin?action=logout',headers:cookie})).statusCode,405);
  const r=await request({method:'POST',url:'/api/admin?action=logout',headers:{...cookie,...form},fetchImpl:async()=>{throw Error('offline')}});assert.equal(r.statusCode,303);assert.match(r.headers['set-cookie'],/Max-Age=0/);
});
test('origin is canonical and cannot be configured to a path or insecure production URL',()=>{
  assert.equal(adminOrigin({}), 'https://alimi-omega.vercel.app');
  for(const value of ['https://good.example/path','https://good.example/','http://good.example','https://user:pass@good.example'])assert.throws(()=>adminOrigin({ADMIN_ORIGIN:value,NODE_ENV:'production'}));
});
test('no dashboard content resides in public assets; routing includes server-only HTML',async()=>{
  const conf=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(conf.outputDirectory,'dist');assert.ok(conf.rewrites.some(x=>x.source==='/admin'&&x.destination==='/api/admin'));assert.equal(conf.functions['api/admin.js'].includeFiles,'server/admin-page.html');
  const css=await readFile(new URL('../dist/admin.css',import.meta.url),'utf8'),js=await readFile(new URL('../dist/admin.js',import.meta.url),'utf8');assert.doesNotMatch(css+js,/한국 뷰티에 대해 이야기하고|초기 고객|미국의 K뷰티/);
  const html=await readFile(new URL('../server/admin-page.html',import.meta.url),'utf8');assert.equal((html.match(/role="tabpanel"/g)||[]).length,4);assert.match(html,/미측정/);
});
