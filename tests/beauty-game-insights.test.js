import test from 'node:test';import assert from 'node:assert/strict';
import {readGameInsights} from '../server/admin-game-metrics.js';
import {validateCommand} from '../server/beauty-game-domain.mjs';
import {entrySource} from '../web/beauty-play/entry-source.js';
const play='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
test('game events accept a visit source slug and language, nothing else',()=>{
 const base={kind:'event',play,character:'mona',test:false,id,name:'landing_view',step:'selection',source:'direct'};
 assert.deepEqual([validateCommand('record',{...base,entry:'reddit',lang:'en'}).entry,validateCommand('record',{...base,entry:'reddit',lang:'en'}).lang],['reddit','en']);
 assert.equal(validateCommand('record',base).entry,undefined);
 assert.throws(()=>validateCommand('record',{...base,entry:'https://x.com/a?b'}));
 assert.throws(()=>validateCommand('record',{...base,lang:'fr'}));
 assert.throws(()=>validateCommand('record',{...base,country:'US'}));
 assert.equal(validateCommand('record',{...base,name:'heard_from',step:'instagram'}).step,'instagram');
 assert.throws(()=>validateCommand('record',{...base,name:'heard_from',step:'myspace'}));
});
test('the visit source comes from utm_source, ref or another site, and stays for the tab',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 assert.equal(entrySource({search:'?utm_source=Reddit Ads',storage}),'reddit-ads');
 assert.equal(entrySource({search:'',referrer:'https://seoulbeauty.me/',host:'seoulbeauty.me',storage}),'reddit-ads');
 assert.equal(entrySource({referrer:'https://www.instagram.com/p/1',host:'seoulbeauty.me'}),'instagram.com');
 assert.equal(entrySource({}),'direct');
});
test('admin insights label counts and never pass through unexpected values',async()=>{
 const data={people:3,funnel:[{step:'landing_view',plays:3,people:3},{step:'answer',plays:1,people:1}],segments:[{dimension:'country',value:'US',people:2,started:1,completed:1,shared:0}],
  choices:[{character:'mona',advice:'moist',product:'64960',n:2},{character:'mona',advice:'moist',product:'unsure',n:1}],reasons:[{reason:'색이 어울려서',n:2}],brands:[{brand:'CLIO',people:1}]};
 const fetchImpl=async(url,init)=>{assert.match(url,/rpc\/beauty_game_insights$/);assert.deepEqual(JSON.parse(init.body),{p_test:false,p_days:7});return {ok:true,json:async()=>data};};
 const r=await readGameInsights({env:{SUPABASE_SECRET_KEY:'sb_secret_x'},fetchImpl});
 assert.equal(r.state,'received');assert.equal(r.situations[0].n,3);assert.match(r.situations[0].label,/^모나리자 · /);
 assert.deepEqual(r.categories,[{label:'립',n:2}]);assert.equal(r.products.find(p=>p.label==='아직 모르겠어').n,1);
 const bad=await readGameInsights({env:{SUPABASE_SECRET_KEY:'sb_secret_x'},fetchImpl:async()=>({ok:true,json:async()=>({...data,people:-1})})});
 assert.equal(bad.state,'unavailable');
 assert.equal((await readGameInsights({env:{}})).state,'unconnected');
 assert.equal((await readGameInsights({env:{SUPABASE_SECRET_KEY:'sb_secret_x'},fetchImpl:async()=>({ok:false,status:404})})).state,'migration_required');
});
