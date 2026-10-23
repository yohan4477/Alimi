import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCommand,aggregateAnswers,shareSnapshot,readSelection,eventNames,experiences} from '../server/beauty-game-domain.mjs';
const id='1b2c3d4e-1234-4567-8910-123456789abc';
const answer={kind:'answer',play:id,character:'mona',product:'64960',advice:'moist',shade:'64960',reasons:['지금 상황에 맞아서'],note:'private note',test:false};
const invalid=fn=>assert.throws(fn,e=>e.status===400 && /^Invalid /.test(e.message));
const row=(character='mona',extra={})=>({character,product:'64960',reason:JSON.stringify({reasons:['지금 상황에 맞아서'],advice:'moist',shade:'64960',note:'NEVER PUBLIC'}),test:false,...extra});
test('answer normalizes only allowed data, no client identity',()=>{
  const v=validateCommand('/api/record',answer);
  assert.equal(v.invite,null); assert.equal(v.test,false);
  assert.deepEqual(JSON.parse(v.reason),{reasons:answer.reasons,shade:'64960',advice:'moist',note:'private note'});
  for(const key of ['user_id','session_id','device','snapshot','email','reason']) invalid(()=>validateCommand('record',{...answer,[key]:'injected'}));
  invalid(()=>validateCommand('record',{...answer,play:'not-a-uuid'}));
  invalid(()=>validateCommand('record',{...answer,test:'false'}));
  invalid(()=>validateCommand('record',{...answer,invite:'attacker'}));
});
test('answer validates character, advice-product pairing, product option and reasons',()=>{
  for(const patch of [{character:'nope'},{product:'missing-product'},{advice:'unknown'},{shade:'69092'},{reasons:['user@example.org']},{reasons:'not array'},{note:'x'.repeat(161)}]) invalid(()=>validateCommand('record',{...answer,...patch}));
  assert.equal(JSON.parse(validateCommand('record',{...answer,reasons:[]}).reason).reasons.length,0);
  assert.deepEqual(JSON.parse(validateCommand('record',{...answer,reasons:[...answer.reasons,...answer.reasons]}).reason).reasons,answer.reasons);
  assert.equal(validateCommand('record',{...answer,product:'unsure',shade:null}).product,'unsure');
});
test('trusted historical invitation snapshot validates retired catalog choices, never body-provided snapshot',()=>{
  const snapshot=shareSnapshot('mona'); snapshot.products=[{id:'old-product',brand:'Old Brand',options:[{id:'old-option'}]}]; snapshot.advice=[{id:'old-advice',productIds:['old-product'],reasonOptions:['old-reason']}];
  const old={...answer,invite:id,product:'old-product',shade:'old-option',advice:'old-advice',reasons:['old-reason']};
  invalid(()=>validateCommand('record',old));
  assert.equal(validateCommand('record',old,{snapshot}).product,'old-product');
  invalid(()=>validateCommand('record',{...old,snapshot}));
  invalid(()=>validateCommand('record',{...old,character:'venus'},{snapshot}));
});
test('analytics contain only declared event, source and bounded steps',()=>{
  const event={kind:'event',play:id,character:'mona',id,name:'step_view',step:'2',source:'direct'};
  assert.equal(validateCommand('record',event).step,'2');
  for(const patch of [{name:'email'},{step:'user@example.org'},{source:'https://private.example'},{note:'secret'},{step:'10000'}]) invalid(()=>validateCommand('record',{...event,...patch}));
  assert.equal(validateCommand('record',{...event,name:'advice_select',step:'moist'}).step,'moist');
  assert.equal(validateCommand('record',{...event,name:'brand_select',step:'fwee'}).step,'fwee');
  invalid(()=>validateCommand('record',{...event,name:'advice_select',step:'result'}));
});
test('experiences/share/reflection and authentication consent payloads are constrained',()=>{
  for(const experience of experiences) assert.equal(validateCommand('record',{kind:'experience',play:id,character:'mona',experience}).experience,experience);
  assert.equal(validateCommand('record',{kind:'share',play:id,character:'mona',channel:'copy'}).channel,'copy');
  invalid(()=>validateCommand('record',{kind:'share',play:id,character:'mona',channel:'attacker'}));
  const reflection={character:'mona',play:id,test:true,mode:'used',text:'  My product  ',criteria:['사용감'],language:'en'};
  assert.equal(validateCommand('reflection',reflection).body,'My product');
  for(const patch of [{text:''},{text:'x'.repeat(501)},{criteria:[]},{criteria:['email']},{language:'xx'},{mode:'xx'},{body:'injected'}]) invalid(()=>validateCommand('reflection',{...reflection,...patch}));
  assert.deepEqual(validateCommand('link-account',{consent:true}),{consent:true});
  invalid(()=>validateCommand('link-account',{consent:false}));
  invalid(()=>validateCommand('link-account',{consent:true,user_id:id}));
});
test('query scopes derive group members from shared taxonomy, query duplicates rejected',()=>{
  assert.deepEqual(validateCommand('stats',new URLSearchParams('character=mona&scope=group&test=0')),{character:'mona',scope:'group',characters:['mona','madame'],test:false});
  assert.deepEqual(validateCommand('invite',{id,play:id,reveal:'1'}),{id,play:id,reveal:true});
  invalid(()=>validateCommand('stats',new URLSearchParams('character=mona&character=venus')));
  invalid(()=>validateCommand('stats',{character:'mona',characters:['venus']}));
  invalid(()=>validateCommand('stats',{character:'mona',scope:'all'}));
});
test('legacy reason parser matches frontend and tolerates corrupted legacy records',()=>{
  assert.deepEqual(readSelection('직접 써봐서'),{reasons:['직접 써봐서'],shade:null,advice:null,note:''});
  assert.deepEqual(readSelection('skip').reasons,[]);
  assert.deepEqual(readSelection('{bad').reasons,[]);
  assert.deepEqual(readSelection(JSON.stringify({reasons:['직접 써봐서','PII',3],shade:3,advice:1,note:'private'})),{reasons:['직접 써봐서'],shade:null,advice:null,note:'private'});
});
test('aggregation includes current and former users, excludes never-used and test/non-scope records',()=>{
  const stats=aggregateAnswers([row('mona',{experience:experiences[0]}),row('mona',{experience:experiences[1]}),row('mona',{experience:experiences[2]}),row('mona',{test:true}),row('venus'),row('madame')],{character:'mona',scope:'character',test:false});
  assert.deepEqual(stats.votes,[{product:'64960',n:3}]); assert.deepEqual(stats.experienced,[{product:'64960',n:2}]);
  assert.deepEqual(stats.reasons,[{product:'64960',reason:'지금 상황에 맞아서',n:3}]);
  assert.deepEqual(stats.shades,[{product:'64960',shade:'64960',n:3}]);
  assert.equal(stats.choices[0].usedN,2); assert.equal(stats.choices[0].scenarioId,'first_date');
  assert.equal(stats.taxonomyVersion,'scenario-v1');
  assert.equal(JSON.stringify(stats).includes('NEVER PUBLIC'),false);
  assert.equal(JSON.stringify(stats).includes('note'),false);
});
test('group keeps character-specific paths separate and counts categories, legacy reasons and empty data',()=>{
  const stats=aggregateAnswers([row(),row('madame',{experience:experiences[1]}),row('mona',{product:'unsure',reason:'skip'}),row('mona',{product:'69092',reason:'직접 써봐서'}),row('venus')],{character:'mona',scope:'group'});
  assert.equal(stats.votes.reduce((sum,r)=>sum+r.n,0),4);
  assert.equal(stats.choices.length,4);
  assert.deepEqual(stats.categoryChoices.find(c=>c.category==='lip'),{category:'lip',n:2,usedN:1});
  assert.equal(stats.categoryChoices.find(c=>c.category==='base').n,1);
  assert.equal(stats.categoryChoices.find(c=>c.category==='unselected').n,1);
  assert.deepEqual(aggregateAnswers([],{character:'mona'}).votes,[]);
});
test('snapshot is isolated, complete for every advice path, and contains no player data',()=>{
  for(const id of ['mona','pearl','venus','madame','camille','ophelia']) {
    const s=shareSnapshot(id); assert.equal(s.character.id,id); assert.ok(s.character.name && s.character.bg && s.character.quote && s.character.reasonOptions);
    for(const a of s.advice) for(const p of a.productIds) assert.ok(s.products.some(x=>x.id===p),`${id}/${a.id}/${p}`);
    assert.deepEqual(Object.keys(s).sort(),['advice','character','products']);
    s.character.name='mutated'; assert.notEqual(shareSnapshot(id).character.name,'mutated');
  }
});
test('event and experience lists remain in sync with static frontend source without executing TypeScript',()=>{
  const source=readFileSync(new URL('../web/beauty-play/game.ts',import.meta.url),'utf8');
  for(const [name,expected] of [['eventNames',eventNames],['experiences',experiences]]) {
    const literal=source.match(new RegExp(`export const ${name}=(\\[[^;]+?\\])`))[1];
    assert.deepEqual([...literal.matchAll(/'([^']*)'/g)].map(m=>m[1]),expected);
  }
});
test('malformed and oversized bodies fail with public 400 status',()=>{
  for(const input of [null,[],42,'text']) invalid(()=>validateCommand('record',input));
  invalid(()=>validateCommand('record',{...answer,note:'x'.repeat(17000)}));
  const circular={...answer}; circular.note=circular; invalid(()=>validateCommand('record',circular));
});

test('aggregation accepts normalized stats options but independently re-derives permitted characters',()=>{
  const options=validateCommand('stats',{character:'mona',scope:'group'});
  assert.equal(aggregateAnswers([row(),row('madame'),row('venus')],options).votes[0].n,2);
  assert.equal(aggregateAnswers([row('venus')],{...options,characters:['venus']}).votes.length,0);
});

test('cross-scenario owned product can be saved and is preserved in invitation snapshot',()=>{
 const snapshot=shareSnapshot('mona');const p=snapshot.products.find(p=>p.id==='69092');assert(p);
 const command={...answer,product:p.id,shade:p.options[0].id};
 assert.equal(validateCommand('record',command).product,p.id);
 assert.equal(validateCommand('record',command,{snapshot}).product,p.id);
 invalid(()=>validateCommand('record',{...command,shade:'64960'}));
});
