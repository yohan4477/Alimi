import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canAttachCatalogItem, catalogItemPrice} from '../dist/catalog-attachments.js';
import {manualOffers} from '../dist/manual-offers.js';
import {postMessage} from '../dist/chat-api.js';
import {createPost, addComment, validatePostProduct} from '../dist/community-api.js';
import {createGuardedPost} from '../dist/beauty-post-retry-guard.js';
import {setLang,t} from '../dist/i18n.js';
const local = manualOffers[0];
const reference = {retailer:local.retailer,market:local.market,sku:local.sku};
const registered = {retailer:'Stylevana US',market:'US',sku:'10759',price_minor:1750};
test('owner entries remain local even after draft normalization removes provenance', () => {
  for (const item of [local, reference, {...reference,source:null}, {...reference,sku:' '+reference.sku+' '}, {...registered,source:'owner_supplied'}]) {
    assert.equal(canAttachCatalogItem(item),false);
    assert.throws(()=>validatePostProduct(item),/chat:item/);
  }
  assert.equal(canAttachCatalogItem(null),false);
  assert.equal(canAttachCatalogItem(registered),true);
  assert.deepEqual(validatePostProduct(registered),{retailer:registered.retailer,market:'US',sku:'10759'});
});
test('chat, comments, posts and reviews reject local-only entries before any network write', async () => {
  const fail=()=>assert.fail('local-only offer must not reach the network');
  for(const item of [local,reference]) {
    await assert.rejects(postMessage('secret','room','text',item,null,fail),/chat:item/);
    assert.throws(()=>addComment('secret',1,'text',item,fail),/chat:item/);
    for(const kind of ['question','recommend','review']) assert.throws(()=>createPost('secret','room',{kind,title:'Test',item},fail),/chat:item/);
    await assert.rejects(createGuardedPost('secret','room',{kind:'review',title:'Test',item,beautyHandoffId:'draft'},{storage:{getItem:fail,setItem:fail},fetchImpl:fail}),/chat:item/);
  }
});
test('registered references and text-only chat keep the existing RPC behavior', async () => {
  const calls=[];const fetchImpl=async(url,init)=>{calls.push(JSON.parse(init.body));return {ok:true,status:200,json:async()=>({id:1})}};
  await postMessage('secret','room','text',registered,null,fetchImpl);
  await postMessage('secret','room','text',null,null,fetchImpl);
  assert.equal(calls[0].p_sku,'10759');assert.equal(calls[1].p_sku,null);
});
test('shared item prices preserve KRW units, USD cents and unknown prices', () => {
  setLang('en');
  assert.equal(catalogItemPrice({market:'KR',price_minor:17000}),'₩17,000');
  assert.equal(catalogItemPrice({market:'US',price_minor:1750}),'$17.50');
  assert.equal(catalogItemPrice({currency:'KRW',price_minor:17000}),'₩17,000');
  for(const price_minor of [null,undefined,NaN,0,-1,'17000']) assert.equal(catalogItemPrice({market:'KR',price_minor}),t('price.atRetailer'));
});
test('all shared attachment UI entries use the guard while catalog browsing stays available', async () => {
  const chat=await readFile(new URL('../dist/chat.js',import.meta.url),'utf8');
  const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.match(chat,/\(await searchCatalog\(q\)\)\.filter\(canAttachCatalogItem\)/);
  assert.match(chat,/!canAttachToChat\(\) \|\| !canAttachCatalogItem\(it\)/);
  assert.match(chat,/const it = picked\[i\]; if\(!canAttachCatalogItem\(it\)\)return/);
  assert.match(chat,/v: catalogItemPrice\(it\)/);
  assert.match(app,/\(canAttachToChat\(\)\|\|brandChat\)&&canAttachCatalogItem\(cur\)/);
  assert.match(app,/familyAttach' in b.dataset\)\{if\(!canAttachCatalogItem/);
  const {manualCatalog}=await import('../dist/manual-offers.js');assert.equal(manualCatalog('KR',{query:'센카'}).length,1);
});
