import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the actual UI actions, isolated from unrelated module boot handlers.
const source=readFileSync(new URL('../dist/chat.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('let accountDrafts,'),source.indexOf('\nlet roomFindMode')).replaceAll('export function ','function ');
const draft={id:'340c78fa-03ca-42f2-857e-f8b70a1a4654',region:'kr',language:'ko',title:'Private title',body:'Private body'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function harness(){
 const elements=new Map(),values=new Map(),writes=[],toasts=[],urls=[];
 const auth={user:{id:'A'},epoch:0,session:{access_token:'access-A',refresh_token:'refresh-A'},async restore(){}};
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 class Client{constructor(auth){this.auth=auth;this.owner=auth.user.id;}async list(){return [draft]}async save(){return draft}async remove(){}}
 const document={body:{append:d=>elements.set('#'+d.id,d)},createElement:()=>{
  const handlers={};return {open:false,innerHTML:'',drafts:[],addEventListener:(event,fn)=>handlers[event]=fn,showModal(){this.open=true},close(){if(!this.open)return;this.open=false;queueMicrotask(()=>handlers.close?.());}};
 }};
 const deps={BeautyAccountDrafts:Client,$:id=>elements.get(id),handoffStorage:()=>storage,clearHandoff:()=>writes.push('clear'),renderBeautyDraft:()=>{},locale:()=> 'en',readHandoff:()=>draft,writeHandoff:(_s,d)=>writes.push(d),updateHandoff:()=>writes.push('update'),toast:t=>toasts.push(t),esc:String,region:'kr',document,location:{href:'https://example.test/kr'},history:{replaceState:(_a,_b,url)=>urls.push(String(url))},URL};
 const build=new Function(...Object.keys(deps),`let incomingBeautyId='${draft.id}',beautyDraft=null,beautyDraftDismissed=false;\n${block}\nreturn {configure:configureBeautyDraftAccount,refresh:refreshBeautyDraftAccount,action:accountDraftAction,get client(){return accountDrafts}};`);
 const ui=build(...Object.values(deps));ui.configure(auth);
 return {ui,auth,storage,writes,toasts,urls,dialog:()=>elements.get('#beauty-account-drafts')};
}
const transitions={
 'account switch':h=>{h.auth.user={id:'B'};h.auth.session={access_token:'access-B',refresh_token:'refresh-B'};},
 'logout epoch before credentials clear':h=>{h.auth.epoch++;},
 'same-owner re-login epoch':h=>{h.auth.epoch+=2;h.auth.session={access_token:'new-access-A',refresh_token:'new-refresh-A'};},
 'refresh invalidation':h=>h.ui.refresh(),
 'client replacement':h=>h.ui.configure(h.auth),
};
for(const [name,transition] of Object.entries(transitions))test(`list UI drops a queued-resolution ${name}`,async()=>{
 const h=harness();h.ui.client.list=async()=>{queueMicrotask(()=>transition(h));return [draft]};
 await h.ui.action('list');
 assert.equal(h.dialog(),undefined,'stale rows must not create or reopen a private dialog');
 assert.equal(h.writes.length,0);assert.equal(h.toasts.length,0);
});
test('queued account refresh cannot repopulate a cleared existing dialog',async()=>{
 const h=harness();await h.ui.action('list');assert.match(h.dialog().innerHTML,/Private title/);
 h.ui.client.list=async()=>{queueMicrotask(()=>{h.auth.epoch++;h.ui.refresh()});return [draft]};
 await h.ui.action('list');assert.equal(h.dialog().open,false);assert.equal(h.dialog().innerHTML,'');assert.deepEqual(h.dialog().drafts,[]);assert.equal(h.dialog().draftContext,null);
});
for(const [name,transition] of Object.entries(transitions))test(`restore UI drops a queued-resolution ${name}`,async()=>{
 const h=harness();await h.ui.action('list');
 h.auth.restore=async()=>{queueMicrotask(()=>transition(h));};
 await h.ui.action('restore',draft.id);
 assert.equal(h.writes.length,0,'stale private text must not reach the handoff store');assert.equal(h.urls.length,0);
 assert.equal(h.storage.getItem('seoulbeauty-cloud-draft-owner'),null);
});
test('closing the draft dialog cancels an already pending restore',async()=>{
 const h=harness();await h.ui.action('list');const restore=deferred();h.auth.restore=()=>restore.promise;
 const pending=h.ui.action('restore',draft.id);h.dialog().close();await Promise.resolve();restore.resolve();await pending;
 assert.equal(h.writes.length,0);assert.equal(h.dialog().innerHTML,'');
});
test('closing while a new list is pending does not reopen it',async()=>{
 const h=harness();await h.ui.action('list');const list=deferred();h.ui.client.list=()=>list.promise;
 const pending=h.ui.action('list');h.dialog().close();await Promise.resolve();list.resolve([draft]);await pending;
 assert.equal(h.dialog().open,false);assert.deepEqual(h.dialog().drafts,[]);
});
test('later list wins, preventing an older list from replacing the dialog',async()=>{
 const h=harness(),first=deferred();let calls=0;h.ui.client.list=()=>++calls===1?first.promise:Promise.resolve([{...draft,title:'Newer title'}]);
 const pending=h.ui.action('list');await h.ui.action('list');first.resolve([draft]);await pending;
 assert.match(h.dialog().innerHTML,/Newer title/);assert.doesNotMatch(h.dialog().innerHTML,/Private title/);
});
test('restore refuses rows rendered for another owner before calling auth restore',async()=>{
 const h=harness();await h.ui.action('list');h.auth.user={id:'B'};let calls=0;h.auth.restore=async()=>calls++;
 await h.ui.action('restore',draft.id);assert.equal(calls,0);assert.equal(h.writes.length,0);
});
test('stale save acknowledgement cannot set account ownership or show success',async()=>{
 const h=harness();h.ui.client.save=async()=>{queueMicrotask(()=>{h.auth.epoch++;h.ui.refresh()});return draft};
 await h.ui.action('save');assert.equal(h.storage.getItem('seoulbeauty-cloud-draft-owner'),null);assert.equal(h.toasts.length,0);
});
test('stale deletion acknowledgement never lists the new account automatically',async()=>{
 const h=harness();await h.ui.action('list');let lists=0;h.ui.client.list=async()=>{lists++;return [draft]};
 h.ui.client.remove=async()=>{queueMicrotask(()=>{h.auth.user={id:'B'};h.ui.refresh()});};
 await h.ui.action('delete',draft.id);assert.equal(lists,0);assert.equal(h.dialog().open,false);assert.equal(h.dialog().innerHTML,'');
});
test('unchanged owner can list, restore and save normally',async()=>{
 const h=harness();await h.ui.action('list');assert.equal(h.dialog().open,true);
 await h.ui.action('restore',draft.id);assert.deepEqual(h.writes,[draft,'update']);assert.equal(h.storage.getItem('seoulbeauty-cloud-draft-owner'),'A');assert.equal(h.urls.length,1);
 await h.ui.action('save');assert.match(h.toasts.at(-1),/Saved privately/);
});
test('successful deletion refreshes the open dialog without a delayed close race',async()=>{
 const h=harness();await h.ui.action('list');h.ui.client.list=async()=>[];
 await h.ui.action('delete',draft.id);assert.equal(h.dialog().open,true);assert.deepEqual(h.dialog().drafts,[]);assert.match(h.dialog().innerHTML,/No saved drafts/);
});

test('legitimate same-owner token refresh still lists and restores private drafts',async()=>{
 const h=harness();h.ui.client.list=async()=>{h.auth.session={access_token:'fresh-A',refresh_token:'fresh-refresh-A'};return [draft]};
 await h.ui.action('list');assert.equal(h.dialog().open,true);
 h.auth.restore=async()=>{h.auth.session={access_token:'fresh-again-A',refresh_token:'fresh-again-refresh-A'};};
 await h.ui.action('restore',draft.id);assert.deepEqual(h.writes,[draft,'update']);
 assert.equal(h.storage.getItem('seoulbeauty-cloud-draft-owner'),'A');
});
