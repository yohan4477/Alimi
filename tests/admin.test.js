import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {createAdminHandler} from '../api/admin.js';
import {SESSION_COOKIE, isAdmin, adminOrigin, readToken} from '../server/admin-auth.js';

const token = 'header.signed.token';
const admin = {id:'user-1',email_confirmed_at:'2026-10-19T00:00:00Z',is_anonymous:false,app_metadata:{seoulbeauty_admin:true}};
function response(body, status = 200) { return new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json'}}); }
async function request({method='GET',url='/admin',headers={},body,fetchImpl=async()=>response(admin),readPage=async()=>'<p>PRIVATE STRATEGY</p>',readReview,envOverrides={}}={}) {
  const req=Readable.from(body === undefined || typeof body === 'object' ? [] : [body]);
  Object.assign(req,{method,url,headers}); if (typeof body === 'object') req.body=body;
  const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v},end(b=''){this.body=b}};
  await createAdminHandler({fetchImpl,readPage,...(readReview&&{readReview}),env:{NODE_ENV:'test',ADMIN_ORIGIN:'https://admin.example',...envOverrides}})(req,res);
  return res;
}
const cookie={cookie:`${SESSION_COOKIE}=${token}`};
const form={origin:'https://admin.example','content-type':'application/x-www-form-urlencoded'};
test('metrics requires the same verified admin and fails closed for other users',async()=>{
  let called=0;
  const fetchImpl=async()=>{called++;return response({...admin,app_metadata:{}})};
  assert.equal((await request({url:'/api/admin?view=metrics',fetchImpl})).statusCode,401);
  assert.equal(called,0);
  assert.equal((await request({url:'/api/admin?view=metrics',headers:cookie,fetchImpl})).statusCode,403);
  const allowed=await request({url:'/api/admin?view=metrics',headers:cookie});
  assert.equal(allowed.statusCode,200);assert.equal(JSON.parse(allowed.body).state,'unconnected');
  assert.match(allowed.headers['cache-control'],/no-store/);
});

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
test('admin navigation preserves operations and planning panels with reciprocal ARIA links',async()=>{
  const html=await readFile(new URL('../server/admin-page.html',import.meta.url),'utf8');
  const expectedPanels=[
    'sb-dashboard','sb-users','sb-community','sb-products','sb-game','sb-revenue','sb-system',
    'sb-ui-library','sb-dev','sb-roadmap','sb-strategy','sb-plan','sb-design','sb-quality',
  ];
  const elements=role=>[...html.matchAll(new RegExp(`<[^>]+\\srole="${role}"[^>]*>`, 'g'))]
    .map(([tag])=>Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,name,value])=>[name,value])));
  const tabs=elements('tab').filter(x=>x.id.startsWith('sb-')),panels=elements('tabpanel').filter(x=>x.id.startsWith('sb-'));
  // Exact identities catch missing, duplicate, orphaned, or accidentally renamed sections.
  assert.deepEqual(panels.map(panel=>panel.id).sort(),[...expectedPanels].sort());
  assert.deepEqual(tabs.map(tab=>tab.id).sort(),expectedPanels.map(id=>`${id}-tab`).sort());
  for(const panel of panels){
    const tab=tabs.find(tab=>tab.id===`${panel.id}-tab`);
    assert.equal(tab['aria-controls'],panel.id);
    assert.equal(panel['aria-labelledby'],tab.id);
  }
  assert.deepEqual(tabs.filter(tab=>tab['aria-selected']==='true').map(tab=>tab.id),['sb-dashboard-tab']);
});

test('no dashboard content resides in public assets; routing includes server-only HTML',async()=>{
  const conf=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(conf.outputDirectory,'dist');assert.ok(conf.rewrites.some(x=>x.source==='/admin'&&x.destination==='/api/admin'));assert.ok(conf.functions['api/admin.js'].includeFiles.includes('server/admin-*.html'));
  const css=await readFile(new URL('../dist/admin.css',import.meta.url),'utf8'),js=await readFile(new URL('../dist/admin.js',import.meta.url),'utf8');assert.doesNotMatch(css+js,/한국 뷰티에 대해 이야기하고|초기 고객|미국의 K뷰티/);
  const html=await readFile(new URL('../server/admin-page.html',import.meta.url),'utf8');assert.match(html,/미측정/);
  assert.match(html,/K-뷰티에 관심 있고/);assert.match(html,/미국 18~24세/);
  assert.match(html,/승인된 제휴 수수료 매출/);assert.match(html,/방문자 1,000명당 승인 제휴 수수료/);
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

test('planning review script hashes match browser newline normalization', async () => {
  const {createHash} = await import('node:crypto');
  const hash = text => "'sha256-" + createHash('sha256').update(text).digest('base64') + "'";
  // Windows checkouts (core.autocrlf) serve CRLF; browsers hash script text after normalizing it to LF.
  const allowed = await request({url:'/api/admin?view=planning-review',headers:cookie,readReview:async()=>'<script>\r\nrun();\r\n</script>'});
  assert.ok(allowed.headers['content-security-policy'].includes(`script-src ${hash('\nrun();\n')};`));
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
  assert.equal(login.statusCode,303);assert.equal(login.headers.location,'/admin');
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
  assert.match(html,/id="sb-dev-tab"/);assert.match(html,/id="sb-dev" role="tabpanel"/);
  assert.match(html,/data-state-panel="current"/);assert.match(html,/data-state-panel="history"[^>]*hidden/);
  for(const item of ['최신 현황','변경 이력','운영 DB 통합','검증 필요','UI만 완료','API 미연결'])assert.ok(html.includes(item),item);
  assert.doesNotMatch(html,/data-dev-item=/);
  const js=await readFile(new URL('../dist/admin.js',import.meta.url),'utf8');
  assert.match(js,/data-state-view/);assert.match(js,/section.hidden=section.dataset.statePanel!==selected/);
  assert.doesNotMatch(js,/seoulbeauty_admin|ADMIN_SHARED_PASSWORD|SECRET_KEY/);
  const noAuth=await request({url:'/admin',readPage:()=>assert.fail('private developer dashboard was read')});
  assert.equal(noAuth.statusCode,401);
  const readAllowed=await request({headers:cookie,readPage:()=>html});
  assert.equal(readAllowed.statusCode,200);assert.match(readAllowed.body,/id="sb-dev"/);
});


test('production alias login accepts matching host, rejects cross-site and arbitrary hosts', async () => {
  const envOverrides={ADMIN_ORIGIN:'https://alimi-omega.vercel.app',ADMIN_SHARED_PASSWORD:'test-password',ADMIN_SHARED_SESSION_SECRET:'test-signing-secret-with-at-least-32-characters'};
  const run=(origin,host,site='same-origin')=>request({envOverrides,method:'POST',url:'/api/admin?action=login',body:'password=test-password',headers:{origin,host,'sec-fetch-site':site,'content-type':'application/x-www-form-urlencoded'}});
  assert.equal((await run('https://seoulbeauty.me','seoulbeauty.me')).statusCode,303);
  assert.equal((await run('https://www.seoulbeauty.me','www.seoulbeauty.me')).statusCode,303);
  for(const [origin,host,site] of [['https://evil.example','evil.example'],['https://seoulbeauty.me','evil.example'],['https://seoulbeauty.me','seoulbeauty.me','cross-site'],['http://seoulbeauty.me','seoulbeauty.me']]) assert.equal((await run(origin,host,site)).statusCode,403);
});
test('UI library is authenticated and keeps executable preview confined to hashed scripts', async () => {
  assert.equal((await request({url:'/api/admin?view=ui-library'})).statusCode,401);
  const r=await request({url:'/api/admin?view=ui-library',headers:cookie});
  assert.equal(r.statusCode,200);assert.match(r.body,/UI Library/);
  assert.match(r.headers['content-security-policy'],/script-src 'sha256-/);
  assert.match(r.headers['content-security-policy'],/frame-ancestors 'self'/);
  assert.match(r.headers['cache-control'],/no-store/);
  for(const [,script] of r.body.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Function(script));
});

test('login return accepts only known admin tab IDs and never external URLs', async()=>{
 const envOverrides={ADMIN_SHARED_PASSWORD:'test-password',ADMIN_SHARED_SESSION_SECRET:'test-signing-secret-with-at-least-32-characters'};
 for(const [tab,target] of [['sb-dev','/admin#sb-dev'],['sb-dashboard','/admin#sb-dashboard'],['sb-plan','/admin#sb-plan'],['https://evil.example','/admin'],['//evil.example','/admin'],['sb-removed','/admin'],['','/admin']]){
  const r=await request({envOverrides,method:'POST',url:'/api/admin?action=login&tab='+encodeURIComponent(tab),headers:form,body:'password=test-password',fetchImpl:()=>assert.fail('external authentication')});
  assert.equal(r.statusCode,303);assert.equal(r.headers.location,target);assert.match(r.headers['set-cookie'],/HttpOnly; Secure; SameSite=Strict/);
 }
});
