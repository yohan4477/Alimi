import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler from '../api/language.js';
import {requestLanguage,browserLanguage,cookieLanguage,storedLanguage,resolveVisitorLanguage,rememberLanguage} from '../dist/language-preference.js';
const storage=values=>({getItem:k=>values[k],setItem:(k,v)=>{values[k]=v;}});
test('server locale precedence preserves explicit links/manual preference over country, never market',()=>{
 for(const [input,want] of [
 [{country:'KR'},'ko'],[{country:'US',acceptLanguage:'ko'},'en'],[{country:'JP'},'en'],
 [{country:'KR',cookie:'seoulbeauty-language=en'},'en'],[{country:'US',cookie:'seoulbeauty-language=ko'},'ko'],
 [{search:'?lang=en&region=kr',cookie:'seoulbeauty-language=ko',country:'KR'},'en'],
 [{search:'?lang=ko&region=us',cookie:'seoulbeauty-language=en',country:'US'},'ko'],
 [{country:'XX',acceptLanguage:'ko-KR, en;q=0.8'},'ko'],[{country:'ZZ',acceptLanguage:'en-US, ko;q=0.5'},'en'],
 [{country:'',acceptLanguage:'fr-FR'},'en'],[{country:'garbage',acceptLanguage:'ko;q=0.9,en;q=1'},'en'],
 [{country:'',acceptLanguage:'en;q=0,ko;q=0.8'},'ko']])assert.equal(requestLanguage(input),want);
 assert.equal(cookieLanguage('seoulbeauty-language=ko; seoulbeauty-language=en'),null);
 assert.equal(cookieLanguage('seoulbeauty-language=admin'),null);
 assert.equal(browserLanguage(''), 'en');
});
test('locale endpoint is read-only, no-store, returns only language and never country/IP/cookie',()=>{
 for(const country of ['KR','US']){
  const headers={};let body;
  const res={setHeader:(k,v)=>{headers[k.toLowerCase()]=v;},end:v=>{body=v;}};
  handler({method:'GET',url:'/api/language',headers:{'x-vercel-ip-country':country,'x-forwarded-for':'192.0.2.44'}},res);
  assert.deepEqual(JSON.parse(body),{language:country==='KR'?'ko':'en'});
  for(const key of ['cache-control','cdn-cache-control','vercel-cdn-cache-control'])assert.match(headers[key],/no-store/);
  assert.match(headers.vary,/Cookie.*X-Vercel-IP-Country.*Accept-Language/);
  assert.equal(headers['set-cookie'],undefined);assert.equal(res.statusCode,200);
 }
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};
 handler({method:'POST',url:'/api/language',headers:{}},res);assert.equal(res.statusCode,405);
});
test('explicit shared link does not overwrite manual preference or fetch locale',async()=>{
 const values={'seoulbeauty-language':'ko'};
 const lang=await resolveVisitorLanguage({search:'?lang=en',cookie:'seoulbeauty-language=ko',storage:storage(values)},()=>assert.fail('unneeded request'));
 assert.equal(lang,'en');assert.deepEqual(values,{'seoulbeauty-language':'ko'});
});
test('legacy migration is deterministic and ignores conflicting values',()=>{
 assert.equal(storedLanguage(storage({'beauty-language':'ko'})),'ko');
 assert.equal(storedLanguage(storage({'alimi-lang':'en'})),'en');
 assert.equal(storedLanguage(storage({'beauty-language':'en','alimi-lang':'en'})),'en');
 assert.equal(storedLanguage(storage({'beauty-language':'ko','alimi-lang':'en'})),null);
 assert.equal(storedLanguage(storage({'seoulbeauty-language':'ko','beauty-language':'en','alimi-lang':'en'})),'ko');
});
test('fresh client waits for server country and fallback is bounded browser language',async()=>{
 let release;const wait=new Promise(resolve=>{release=resolve;});let settled=false;
 const pending=resolveVisitorLanguage({search:'',cookie:'',browser:'en',storage:storage({})},async(url,options)=>{
  assert.equal(url,'/api/language');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');
  await wait;return {ok:true,json:async()=>({language:'ko'})};
 }).then(value=>{settled=true;return value;});
 await Promise.resolve();assert.equal(settled,false);release();assert.equal(await pending,'ko');
 assert.equal(await resolveVisitorLanguage({browser:'ko-KR'},async()=>{throw Error('offline');}),'ko');
 assert.equal(await resolveVisitorLanguage({browser:'en'},async()=>({ok:true,json:async()=>({language:'fr'})})),'en');
});
test('manual switch uses one host-only functional cookie and shared preference',()=>{
 const document={},values={};rememberLanguage('en',{document,storage:storage(values),secure:true});
 assert.equal(document.cookie,'seoulbeauty-language=en; Path=/; Max-Age=15552000; SameSite=Lax; Secure');
 assert.deepEqual(values,{'seoulbeauty-language':'en','beauty-language':'en','alimi-lang':'en'});
 assert.doesNotMatch(document.cookie,/Domain=|[Ii][Pp]|country/);
});
test('game and community gate first draw and keep same-origin locale API outside game proxy',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('web/beauty-play/locale.tsx'),/if\(!ready\)return null/);
 assert.match(read('dist/i18n.js'),/await resolveVisitorLanguage/);
 assert.match(read('dist/index.html'),/html\[data-locale-pending\] body\{visibility:hidden\}/);
 assert.match(read('dist/app.js'),/localizePage\(\);\s*document.documentElement.removeAttribute\('data-locale-pending'\)/);
 assert.match(read('web/beauty-play/main.tsx'),/!=='.api.language'/);
});
test('blocked cookie/storage does not prevent manual choice or browser fallback',async()=>{
 const document={get cookie(){throw Error('blocked');},set cookie(_value){throw Error('blocked');}};
 const storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.doesNotThrow(()=>rememberLanguage('ko',{document,storage,secure:true}));
 assert.equal(await resolveVisitorLanguage({cookie:'',storage,browser:'en-US'},async()=>{throw Error('offline');}),'en');
});
