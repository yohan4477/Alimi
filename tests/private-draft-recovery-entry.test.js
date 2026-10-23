import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const chat=readFileSync(new URL('../dist/chat.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const renderHome=chat.slice(chat.indexOf('function renderBeautyDraft() {'),chat.indexOf('\nasync function chooseBeautyRoom()'));
const renderSettings=app.slice(app.indexOf('function renderSettings(){'),app.indexOf('\nasync function settingsAction'));
test('absent or dismissed handoffs hide and clear the main recovery CTA without fetching private data',()=>{
 for(const state of [{incomingBeautyId:null,beautyDraftDismissed:false},{incomingBeautyId:'old-draft',beautyDraftDismissed:true}]){
  const box={hidden:false,innerHTML:'stale private draft'};
  vm.runInNewContext(renderHome+';renderBeautyDraft();',{...state,$:()=>box});
  assert.equal(box.hidden,true);assert.equal(box.innerHTML,'');
 }
});
test('recovery remains in signed-in account settings only, in both existing languages',()=>{
 for(const lang of ['ko','en'])for(const user of [null,{id:'owner',email:'fixture@example.invalid'}]){
  const box={innerHTML:''};
  vm.runInNewContext(renderSettings+';renderSettings();',{$:()=>box,auth:{user},authBusy:false,syncStatus:'ready',lang,region:'us',icon:{},t:k=>k,esc:x=>String(x),providerLabel:()=>'',regionButton:()=>'',row:()=>'',linkRow:()=>''});
  assert.equal(box.innerHTML.includes('data-auth="drafts"'),Boolean(user));
  if(user)assert.ok(box.innerHTML.includes(lang==='ko'?'계정 초안 복구':'Recover account drafts'));
 }
});
test('account recovery uses the existing private dialog and active handoff recovery remains available',()=>{
 assert.match(chat,/export function openBeautyAccountDrafts\(\)\{return accountDraftAction\('list'\);\}/);
 assert.ok(app.includes("if(a==='drafts'){if(auth.user){show('chat');await openBeautyAccountDrafts();}return;}"));
 assert.match(renderHome,/data-chat-action="beauty-account-list"/);
 assert.match(chat,/const rows=await accountDrafts\.list\(region\)/);
});
