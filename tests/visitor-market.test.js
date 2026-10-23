import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import handler from '../api/language.js';
import {marketDecision,rememberMarket,MANUAL_MARKET_KEY} from '../dist/market-preference.js';
import {requestLanguage,resolveVisitorLanguage,rememberLanguage,initialLanguage} from '../dist/language-preference.js';
import {startVisitorEntry} from '../dist/visitor-entry.js';
const storage=values=>({getItem:key=>values[key]??null,setItem:(key,value)=>{values[key]=value;}});
function documentFixture(){const element=()=>({children:[],dataset:{},listeners:{},append(child){this.children.push(child);},setAttribute(){},addEventListener(name,callback){this.listeners[name]=callback;}});const body=element();body.prepend=child=>body.children.unshift(child);return {cookie:'',body,createElement:element,documentElement:{lang:'',attributes:{},setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];}}};}
const server=country=>async()=>({ok:true,json:async()=>({language:country==='KR'?'ko':'en',suggestedRegion:country==='KR'?'kr':null})});
test('trusted country chooses only Korean first-visit market; language never implies market',()=>{
 assert.deepEqual(marketDecision({suggestedRegion:'kr'}),{region:'kr',needsChoice:false,recommended:null});
 for(const suggestedRegion of [null,'us','jp','ko'])assert.equal(marketDecision({suggestedRegion,search:'?lang=ko'}).region,null);
 for(const country of ['US','JP','GB'])assert.equal(requestLanguage({country,acceptLanguage:'ko-KR'}),'en');
 assert.equal(requestLanguage({country:'XX',acceptLanguage:'ko-KR'}),'ko');
 assert.equal(requestLanguage({country:'',acceptLanguage:'fr'}),'en');
});
test('explicit paths/query and marked manual selections win; old automatic-looking storage is never silently overwritten',()=>{
 const old={'seoulbeauty-region':'us'};const oldStore=storage(old);
 assert.deepEqual(marketDecision({storage:oldStore,suggestedRegion:'kr'}),{region:'kr',needsChoice:false,recommended:null});
 assert.deepEqual(old,{'seoulbeauty-region':'us'});
 assert.equal(marketDecision({pathname:'/us',suggestedRegion:'kr',storage:oldStore}).region,'us');
 assert.equal(marketDecision({search:'?region=kr&lang=en',storage:oldStore}).region,'kr');
 rememberMarket('us',oldStore);assert.equal(old[MANUAL_MARKET_KEY],'us');
 assert.equal(marketDecision({storage:oldStore,suggestedRegion:'kr'}).region,'us');
});
test('country endpoint is readonly no-store and exposes only language/coarse KR suggestion',()=>{
 for(const country of ['KR','US','JP','XX','']){
  const res={headers:{},setHeader(key,value){this.headers[key]=value;},end(value){this.body=value;}};
  handler({method:'GET',url:'/api/language?lang=en',headers:{'x-vercel-ip-country':country,'x-forwarded-for':'192.0.2.1','accept-language':'ko'}},res);
  assert.equal(res.statusCode,200);assert.deepEqual(JSON.parse(res.body),{language:'en',suggestedRegion:country==='KR'?'kr':null});
  assert.match(res.headers['Cache-Control'],/no-store/);assert.equal(res.headers['Set-Cookie'],undefined);
  assert.doesNotMatch(res.body,/192\.0|country|cookie/);
 }
});
test('KR fresh entry loads community only after resolving Korean market/language',async()=>{
 const document=documentFixture(),values={};let loaded=0;
 await startVisitorEntry({document,location:{pathname:'/',search:'',href:'https://seoulbeauty.me/'},storage:storage(values),fetchImpl:server('KR'),loadApp:async()=>{loaded++;assert.equal(document.documentElement.lang,'ko');}});
 assert.equal(loaded,1);assert.equal(document.body.children.length,0);assert.deepEqual(values,{});
});
test('non-KR and unknown legacy entry require market choice; shared query survives',async()=>{
 for(const [country,values] of [['JP',{}],['XX',{'seoulbeauty-region':'us'}]]){
  const document=documentFixture();let target;
  await startVisitorEntry({document,location:{pathname:'/',search:'?room=synthetic&code=oauth-fixture&lang=en',href:'https://seoulbeauty.me/?room=synthetic&code=oauth-fixture&lang=en',assign:value=>{target=value;}},storage:storage(values),fetchImpl:server(country),loadApp:()=>assert.fail('unresolved market loaded application')});
  assert.equal(document.documentElement.lang,'en');const buttons=document.body.children[0].children.filter(child=>child.dataset.marketChoice);
  assert.equal(buttons.length,2);buttons[0].listeners.click();const url=new URL(target);
  assert.equal(url.pathname,'/live');assert.equal(url.searchParams.get('region'),'kr');assert.equal(url.searchParams.get('lang'),'en');assert.equal(url.searchParams.get('room'),'synthetic');assert.equal(url.searchParams.get('code'),'oauth-fixture');assert.equal(values[MANUAL_MARKET_KEY],'kr');
 }
});
test('unknown country falls back to browser language but still requires market choice',async()=>{
 const document=documentFixture();
 await startVisitorEntry({document,location:{pathname:'/',search:'',href:'https://seoulbeauty.me/'},storage:storage({}),fetchImpl:async()=>{throw Error('offline');},loadApp:()=>assert.fail('unknown market loaded application')});
 assert.equal(document.body.children.length,1);
});
test('explicit shared language/manual language override country without changing market',async()=>{
 const values={'seoulbeauty-language':'ko'};
 assert.equal(await resolveVisitorLanguage({search:'?lang=en',cookie:'',storage:storage(values)},()=>assert.fail('shared language fetch')),'en');
 assert.equal(values['seoulbeauty-language'],'ko');
 const document={};rememberLanguage('en',{document,storage:storage(values),secure:true});
 assert.match(document.cookie,/SameSite=Lax; Secure/);assert.equal(values[MANUAL_MARKET_KEY],undefined);
});
test('local development routing invokes the actual country handler without a game proxy or socket',async()=>{
 const {createLocalServer}=await import('../scripts/dev-server.mjs');const server=createLocalServer();
 const res={headers:{},setHeader(key,value){this.headers[key]=value;},end(value){this.body=value;}};
 server.emit('request',{method:'GET',url:'/api/language',headers:{'x-vercel-ip-country':'KR','accept-language':'en'}},res);
 assert.equal(res.statusCode,200);assert.deepEqual(JSON.parse(res.body),{language:'ko',suggestedRegion:'kr'});
});

test('Settings manual language replaces stale shared cookie and storage on the next unqualified visit',()=>{
 const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 assert.match(source,/import \{rememberLanguage\} from '\.\/language-preference.js'/);
 const handler=source.match(/if\(b.dataset.lang\)\{([^}]+)\}/)[1];
 const values={'seoulbeauty-language':'en','alimi-lang':'en','beauty-language':'en'},document={cookie:'seoulbeauty-language=en'};
 const location={};new Function('b','rememberLanguage','location','languageURL',handler)({dataset:{lang:'ko'}},language=>rememberLanguage(language,{document,storage:storage(values)}),location,language=>({href:'/?lang='+language}));
 assert.equal(initialLanguage({search:'',cookie:document.cookie,storage:storage(values)}),'ko');
 assert.equal(values['beauty-language'],'ko');assert.equal(location.href,'/?lang=ko');
});
test('app import rejection clears pending visibility and offers localized reload without exposing the skeleton',async()=>{
 for(const [country,text] of [['KR','다시 시도'],['US','Try again']]){
  const document=documentFixture();let reloaded=false;
  const result=await startVisitorEntry({document,location:{pathname:'/kr',search:'',href:'https://seoulbeauty.me/kr',reload(){reloaded=true;}},storage:storage({}),fetchImpl:server(country),loadApp:async()=>{throw Error('load failure');}});
  assert.equal(result.loadFailed,true);assert.equal(document.documentElement.attributes['data-visitor-gate'],'');
  const button=document.body.children[0].children[1];assert.equal(button.textContent,text);button.listeners.click();assert.equal(reloaded,true);
 }
});

test('trusted KR bypasses legacy-US chooser without manufacturing a manual preference',async()=>{
 const document=documentFixture(),values={'seoulbeauty-region':'us'};let loaded=0;
 await startVisitorEntry({document,location:{pathname:'/',search:'',href:'https://seoulbeauty.me/'},storage:storage(values),fetchImpl:server('KR'),loadApp:async()=>{loaded++;}});
 assert.equal(loaded,1);assert.equal(document.documentElement.lang,'ko');assert.equal(document.body.children.length,0);assert.deepEqual(values,{'seoulbeauty-region':'us'});
});
