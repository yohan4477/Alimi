import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {createAdminHandler} from '../api/admin.js';
import {SESSION_COOKIE, isAdmin, adminOrigin, readToken} from '../server/admin-auth.js';

const token = 'header.signed.token';
const admin = {id:'user-1',email_confirmed_at:'2026-10-19T00:00:00Z',is_anonymous:false,app_metadata:{seoulbeauty_admin:true}};
function response(body, status = 200) { return new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json'}}); }
async function request({method='GET',url='/admin',headers={},body,fetchImpl=async()=>response(admin),readPage=async()=>'<p>PRIVATE STRATEGY</p>',envOverrides={}}={}) {
  const req=Readable.from(body === undefined || typeof body === 'object' ? [] : [body]);
  Object.assign(req,{method,url,headers}); if (typeof body === 'object') req.body=body;
  const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v},end(b=''){this.body=b}};
  await createAdminHandler({fetchImpl,readPage,env:{NODE_ENV:'test',ADMIN_ORIGIN:'https://admin.example',...envOverrides}})(req,res);
  return res;
}
const cookie={cookie:`${SESSION_COOKIE}=${token}`};
const form={origin:'https://admin.example','content-type':'application/x-www-form-urlencoded'};

test('anonymous page and direct API do not read or expose private content',async()=>{
  for (const url of ['/admin','/api/admin','/admin/']) {
    const r=await request({url,readPage:()=>assert.fail('private page read')});assert.equal(r.statusCode,401);assert.doesNotMatch(r.body,/PRIVATE STRATEGY|sb-strategy/);
    assert.equal(r.headers['referrer-policy'],'same-origin');assert.match(r.headers['cache-control'],/no-store/);assert.equal(r.headers['vercel-cdn-cache-control'],'no-store');assert.match(r.headers['content-security-policy'],/frame-ancestors 'none'/);
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
  assert.equal(conf.outputDirectory,'dist');assert.ok(conf.rewrites.some(x=>x.source==='/admin'&&x.destination==='/api/admin'));assert.equal(conf.functions['api/admin.js'].includeFiles,'server/admin-*.html');
  const css=await readFile(new URL('../dist/admin.css',import.meta.url),'utf8'),js=await readFile(new URL('../dist/admin.js',import.meta.url),'utf8');assert.doesNotMatch(css+js,/한국 뷰티에 대해 이야기하고|초기 고객|미국의 K뷰티/);
  const html=await readFile(new URL('../server/admin-page.html',import.meta.url),'utf8');assert.equal((html.match(/role="tabpanel"/g)||[]).length,6);assert.match(html,/미측정/);
  assert.match(html,/K-뷰티에 관심 있고/);assert.match(html,/미국 18~24세/);
  assert.match(html,/승인된 제휴 수수료 매출/);assert.match(html,/방문자 1,000명당 제휴 수익/);
});

test('planning review is authenticated and keeps original interactive UI isolated', async () => {
  const anonymous = await request({url:'/api/admin?view=planning-review'});
  assert.equal(anonymous.statusCode,401);
  assert.doesNotMatch(anonymous.body,/sb-reference-review/);
  const denied = await request({url:'/api/admin?view=planning-review',headers:cookie,fetchImpl:async()=>response({...admin,app_metadata:{}})});
  assert.equal(denied.statusCode,403);
  const allowed = await request({url:'/api/admin?view=planning-review',headers:cookie});
  assert.equal(allowed.statusCode,200);
  assert.match(allowed.body,/sb-reference-review/);
  assert.match(allowed.body,/data:image\/jpeg;base64/);
  assert.match(allowed.headers['content-security-policy'],/script-src 'sha256-/);
  assert.match(allowed.headers['content-security-policy'],/frame-ancestors 'self'/);
  assert.match(allowed.headers['cache-control'],/no-store/);
  const page = await readFile(new URL('../server/admin-page.html',import.meta.url),'utf8');
  assert.match(page,/data-src="\/api\/admin\?view=planning-review"/);
});

test('review loads only after its tab is visible and responds to width changes', async () => {
  const page = await readFile(new URL('../server/admin-page.html',import.meta.url),'utf8');
  const frame = page.match(/<iframe[^>]*id="sb-planning-review"[^>]*>/)[0];
  assert.doesNotMatch(frame, /\ssrc=/);
  assert.match(frame,/data-src=/);
  const review = await readFile(new URL('../server/admin-planning-review.html',import.meta.url),'utf8');
  assert.match(review,/new ResizeObserver/);
  assert.match(review,/width > 0 && width !== lastWidth/);
});

test('planning preview supports both interests, dynamic concern tags, free room creation and KPI funnel', async () => {
  const page=await readFile(new URL('../server/admin-page.html',import.meta.url),'utf8');
  assert.match(page,/스킨케어·메이크업 함께 선택/);
  assert.match(page,/자유 방 생성/);
  assert.match(page,/고객 이용/);
  assert.match(page,/FUNNEL_KPI_REVIEW\.md/);
  const review=await readFile(new URL('../server/admin-planning-review.html',import.meta.url),'utf8');
  assert.match(review,/data-onboard-step="0"/);
  assert.match(review,/1\. 관심 분야/);
  assert.match(review,/const interests=new Set\(\)/);
  assert.match(review,/chosenConcerns=new Set\(\)/);
  assert.match(review,/data-onboard-create/);
  assert.match(review,/data-onboard-save-room/);
  assert.match(review,/rooms\.unshift\(room\)/);
  assert.match(review,/실제 앱\/데이터와 연결되지 않습니다/);
  assert.doesNotMatch(review,/1\. 피부 타입/);
  const scripts=[...review.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.ok(scripts.length>=2,'admin planning preview preserves original review and new onboarding');
  // Parsing is independent of Playwright/browser availability; syntax errors must fail CI.
  for(const script of scripts)assert.doesNotThrow(()=>new Function(script));
});

test('password-only login, protected review, invalid credentials and logout', async () => {
  const envOverrides={ADMIN_SHARED_PASSWORD:'test-password',ADMIN_SHARED_SESSION_SECRET:'test-signing-secret-with-at-least-32-characters'};
  const run=options=>request({envOverrides,fetchImpl:()=>assert.fail('password mode must not call external Auth'),...options});
  const page=await run({});assert.equal(page.statusCode,401);assert.doesNotMatch(page.body,/name="email"/);
  assert.equal((await run({method:'POST',url:'/api/admin?action=login',headers:form,body:'password=incorrect'})).statusCode,401);
  const login=await run({method:'POST',url:'/api/admin?action=login',headers:form,body:'password=test-password'});
  assert.equal(login.statusCode,303);assert.equal(login.headers.location,'/admin#sb-plan');
  const cookie=login.headers['set-cookie'].split(';')[0];
  assert.match(login.headers['set-cookie'],/HttpOnly; Secure; SameSite=Strict/);
  const review=await run({url:'/api/admin?view=planning-review',headers:{cookie}});
  assert.equal(review.statusCode,200);assert.match(review.body,/sb-reference-review/);
  assert.equal((await run({headers:{cookie:cookie+'tampered'}})).statusCode,401);
  const logout=await run({method:'POST',url:'/api/admin?action=logout',headers:{...form,cookie}});
  assert.equal(logout.statusCode,303);assert.match(logout.headers['set-cookie'],/Max-Age=0/);
});
test('password sessions expire, rotate and fail closed without signing secret', async () => {
  const {passwordSession,validPasswordSession}=await import('../server/admin-password.js');
  const env={ADMIN_SHARED_PASSWORD:'example',ADMIN_SHARED_SESSION_SECRET:'test-signing-secret-with-at-least-32-characters'};
  const token=passwordSession(env,1000000);
  assert.equal(validPasswordSession(token,env,1000000),true);
  assert.equal(validPasswordSession(token,env,4600000),false);
  assert.equal(validPasswordSession(token,{...env,ADMIN_SHARED_PASSWORD:'changed'},1000000),false);
  const unavailable=await request({envOverrides:{ADMIN_SHARED_PASSWORD:'example'},method:'POST',url:'/api/admin?action=login',headers:form,body:'password=example'});
  assert.equal(unavailable.statusCode,503);
});

test('developer dashboard is protected and differentiates specs, implementation and release',async()=>{
  const html=await readFile(new URL('../server/admin-page.html',import.meta.url),'utf8');
  assert.equal((html.match(/role="tab"/g)||[]).length,6);
  assert.match(html,/id="sb-dev-tab"/);assert.match(html,/id="sb-dev" role="tabpanel"/);
  const cards=[...html.matchAll(/data-dev-item="(D\d+)"/g)];
  assert.equal(cards.length,10);assert.equal(new Set(cards.map(item=>item[1])).size,10);
  for(const item of ['data-dev-filter="priority"','data-dev-filter="platform"','data-dev-jump="sb-plan-tab"','data-dev-priority="P0"','data-dev-priority="P1"','미측정','실제 방','build-rate-limit'])assert.ok(html.includes(item),item);
  const js=await readFile(new URL('../dist/admin.js',import.meta.url),'utf8');
  assert.match(js,/const devPanel = document.getElementById\('sb-dev'\)/);
  assert.match(js,/state\.platform/);assert.match(js,/state\.priority/);
  assert.match(js,/'#sb-dev':'sb-dev-tab'/);
  assert.doesNotMatch(js,/seoulbeauty_admin|ADMIN_SHARED_PASSWORD|SECRET_KEY/);
  const noAuth=await request({url:'/admin',readPage:()=>assert.fail('private developer dashboard was read')});
  assert.equal(noAuth.statusCode,401);
  const readAllowed=await request({headers:cookie,readPage:()=>html});
  assert.equal(readAllowed.statusCode,200);assert.match(readAllowed.body,/id="sb-dev"/);
});
