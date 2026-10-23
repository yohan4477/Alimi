import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/admin.js',import.meta.url),'utf8');
const navigation=source.slice(source.indexOf('  function select(tab,'),source.indexOf('  for (const [i, tab]'))+source.slice(source.indexOf('  // The URL is the only navigation state.'),source.indexOf("  document.getElementById('admin-logout')"));
function fixture(hash=''){
 const panels={},listeners={},history=[];
 const tabs=['sb-dashboard-tab','sb-dev-tab','sb-plan-tab'].map(id=>({id,classList:{toggle(){}},setAttribute(key,value){this[key]=value;},getAttribute(){return id.slice(0,-4);},focus(){}}));
 for(const tab of tabs)panels[tab.id.slice(0,-4)]={hidden:true};
 const context={tabs,location:{hash},document:{getElementById:id=>tabs.find(t=>t.id===id)||panels[id]},loadReview(){},loadLibrary(){},refreshMetrics(){},sessionStorage:{getItem(){throw Error('must not restore old saved tab');}},addEventListener:(name,fn)=>listeners[name]=fn};
 context.history=Object.fromEntries(['pushState','replaceState'].map(name=>[name,(_state,_title,hash)=>{history.push([name,hash]);context.location.hash=hash;}]));
 vm.createContext(context);vm.runInContext(navigation,context);return {context,tabs,panels,listeners,history};
}
test('bare or stale admin hash opens operations home; valid explicit tab is preserved',()=>{
 for(const [hash,expected] of [['','sb-dashboard-tab'],['#sb-deleted','sb-dashboard-tab'],['#sb-dev','sb-dev-tab'],['#sb-plan','sb-plan-tab']]){
  const f=fixture(hash);assert.equal(f.tabs.find(t=>t['aria-selected']==='true').id,expected);assert.equal(Object.values(f.panels).filter(p=>!p.hidden).length,1);
 }
});
test('admin clicks add history and browser hash/back/forward events select the matching panel',()=>{
 const f=fixture();f.context.select(f.tabs[1]);assert.deepEqual(f.history.at(-1),['pushState','#sb-dev']);
 for(const hash of ['#sb-dashboard','#sb-dev','#sb-plan','#stale']){
  f.context.location.hash=hash;f.listeners.popstate();f.listeners.hashchange();
  assert.equal(f.tabs.find(t=>t['aria-selected']==='true').id,hash==='#stale'?'sb-dashboard-tab':hash.slice(1)+'-tab');
 }
});
test('login client forwards only known fragments and does not touch credentials or storage',()=>{
 const script=readFileSync(new URL('../dist/admin-login.js',import.meta.url),'utf8');
 for(const hash of ['','#sb-dev','#sb-plan','#sb-dashboard','#obsolete','#https://evil.example']){
  const form={};const context={document:{querySelector:()=>form},location:{hash},addEventListener(){},encodeURIComponent};vm.runInNewContext(script,context);
  assert.equal(form.action,'/api/admin?action=login'+(['#sb-dev','#sb-plan','#sb-dashboard'].includes(hash)?'&tab='+hash.slice(1)+hash:''));
 }
 const html=readFileSync(new URL('../server/admin-page.html',import.meta.url),'utf8');
 for(const [,id] of html.matchAll(/id="(sb-[^"]+)-tab"/g))assert.ok(script.includes("'"+id+"'"),'known tab '+id);
});
