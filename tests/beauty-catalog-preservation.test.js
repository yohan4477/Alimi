import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {shareSnapshot,supportedCharacterIds,validateCommand} from '../server/beauty-game-domain.mjs';
const data=JSON.parse(readFileSync('web/beauty-play/product-data.json'));
const extra=JSON.parse(readFileSync('web/beauty-play/scenario-products.json'));
// Public baseline IDs from main 928a480. Never replace historical identifiers.
const baselineOptions={"64960":["64954","64955","64958","64960","64961","90541","90542"],"100982":["100966","100967","100968","100969","100970","100971","100972","100973","100974","100975","100976","100978","100982","100983"],"111432":["111431","111432","111433","111434","111435"],"109909":["109905","109907","109908","109909","109910","109911"],"14621":["14618","14619","14620","14621"],"66606":["110948","110949","110950","110951","110952","66592","66594","66595","66596","66598","66599","66600","66601","66603","66604","66605","66606","66607","66608","66609","66610","66611","66612","66613","66614","89167","89168","89169","89170","89171"],"65175":["65175"],"106475":["106470","106471","106472","106473","106474","106475"],"100139":["100139","111030","111031","111032","111033","111034","111035","66569","66570"]};
// Existing reviewed image bytes from a61c3b20668ce714acc576cf31ab8aa70fc80853.
// This is provenance/integrity, not a new verification of merchant or option matches.
const assetHashes={
  "dist/beauty-play/assets/oy-10.jpg": "720c119ec3d7fb532b2a843af1eece3d0090dfde5960cd12d52c0c95f8b93837",
  "dist/beauty-play/assets/oy-13.jpg": "47fb2dbd4e5dde06316898085477c9ac22e2f68027a13ce9baa451e15f9683ac",
  "dist/beauty-play/assets/oy-14.jpg": "89c9f05597ec051ed66e5cc66f40c41f95f61b653eb1083d0789ee16d5d571f6",
  "dist/beauty-play/assets/oy-15.jpg": "80fc3788e1b2a7c3d46153f0700961f31ef776c457f8dfb97b0b5584131e346c",
  "dist/beauty-play/assets/oy-16.jpg": "f5203bbac13210af0dd8cb91c0ed0a3489486334e2cd5574dfddb9fdb3fa3950",
  "dist/beauty-play/assets/oy-17.jpg": "132a90a48860c7a7fed50d9d1896c0d38e67c98895670bc9954aca1f7353bed6",
  "dist/beauty-play/assets/oy-18.jpg": "8f4865e6208598d32ccb5c5841a8dca13af3883bbc93465fc21552482f6a8c77",
  "dist/beauty-play/assets/oy-19.jpg": "2c5d3695ad5d238d0f35cccea9715a538088674de56cf03964ff553c31f529c9",
  "dist/beauty-play/assets/oy-2.jpg": "22ddc12f187761ec6a4bbbba793272ef7e513c4c7d0733b49d38f933c3f734dc",
  "dist/beauty-play/assets/oy-20.jpg": "d18480caa5270c8bc643a6d0348139744cbbabde2deaa9851e9575bf4f3de7a0",
  "dist/beauty-play/assets/oy-22.jpg": "7b4c87d6351c4833e4efd46bbd48e40c88391150666da0dac5417f68fe93bdac",
  "dist/beauty-play/assets/oy-24.jpg": "b5eefb2c722162f814f57d6907bbafc0ccea58387e718ce2d9fd971b6af75281",
  "dist/beauty-play/assets/oy-25.jpg": "2f3ec3269c1dcdecab56a2f922a5a818291eb782710b4df91a2f15107d2e9601",
  "dist/beauty-play/assets/oy-26.jpg": "d0d74427705c9f0cf32b6015fedfba2ddb19d4fb9ac9fe61f2d5cf19f7eda0ec",
  "dist/beauty-play/assets/oy-27.jpg": "51731e84001a027f23ec48371152a2723ee1cbfa4c48bf56221ae32d66197ad3",
  "dist/beauty-play/assets/oy-29.jpg": "f704cf9ec798c8ac7adbec50d5cf83fa5812e2343537e923ad557ef6764d85b0",
  "dist/beauty-play/assets/oy-30.jpg": "226908e06f0d8db0599f5162015f32b12f2f615db31f76eb09fe3d77c7a21491",
  "dist/beauty-play/assets/oy-4.jpg": "4413b2aa5558e7154f42a5069a1a223c033c5edde54b2aa3b52375df27487680",
  "dist/beauty-play/assets/oy-5.jpg": "0e365b57584ff141d0cfc465f0a053f6e1a9574a66fcb5e8c5fb844d7540f370",
  "dist/beauty-play/assets/oy-6.jpg": "dd6898e0e80e1dd9c9f82bbcf2c55186b4e2e42825ee2fb86a4ed6a86d25b09a",
  "dist/beauty-play/assets/oy-7.jpg": "64a95508da436b9e5b5c58a25ae2b539b48174c5e44e77530f687fb80f0fe658",
  "dist/beauty-play/assets/shade-14598.jpg": "4ad45465179b6303c948a40b164e312b907488db0d508eb705fb82cbdcbf711e",
  "dist/beauty-play/assets/shade-14599.jpg": "67b0fb5751d0a195cade05dce97358c7bb58b3a975b207dc5c55d974bde6fbef",
  "dist/beauty-play/assets/shade-14600.jpg": "269e4724c8c7000a0d205af320faef59d91f108aa8a15b837602e011280440c8",
  "dist/beauty-play/assets/shade-14601.jpg": "76eedb742952c05ed936568d46145c316119b0859b87d484da835b67628b7e96"
};
test('expanded catalog keeps every pre-existing product and option ID without upgrading unconfirmed matches',()=>{
 assert.equal(data.products.length,30);assert.equal(extra.length,10);
 const pool=[...data.products,...extra];assert.equal(new Set(pool.map(p=>p.id)).size,40);
 for(const [id,ids] of Object.entries(baselineOptions)){
  const product=data.products.find(p=>p.id===id);assert.ok(product,id);
  for(const option of ids)assert.ok(product.options.some(o=>o.id===option),id+'/'+option);
 }
 const additions=data.products.filter(p=>!Object.hasOwn(baselineOptions,p.id));assert.equal(additions.length,21);
 for(const p of additions){assert.equal(p.matchStatus,'unconfirmed');assert.equal(p.optionKind,'none');assert.equal(p.options.length,1);assert.equal(p.options[0].id,p.id+'-unspecified');}
});
test('new catalog images match the existing reviewed source exactly',()=>{
 assert.equal(Object.keys(assetHashes).length,25);
 for(const [path,digest] of Object.entries(assetHashes))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),digest,path);
});
test('all ten characters retain complete sanitized snapshots and every catalog choice validates',()=>{
 assert.deepEqual(new Set(supportedCharacterIds),new Set(['mona','pearl','venus','madame','camille','ophelia','school_photo_friend','school_last_minute_friend','gogh','david']));
 for(const character of supportedCharacterIds){
  const snapshot=shareSnapshot(character);assert.equal(snapshot.catalogPolicy,'all-products-v1');assert.equal(snapshot.products.length,40);
  for(const p of snapshot.products){
   assert.deepEqual(Object.keys(p).sort(),['id','brand','name','image','url','category','optionKind','position','options',...(p.matchStatus==='unconfirmed'?['matchStatus']:[])].sort());
   if(data.products.find(x=>x.id===p.id)?.matchStatus==='unconfirmed')assert.equal(p.matchStatus,'unconfirmed');
   for(const o of p.options)assert.deepEqual(Object.keys(o).sort(),['id','label','image'].sort());
   for(const a of snapshot.advice)assert.equal(validateCommand('record',{kind:'answer',play:'11111111-1111-4111-8111-111111111111',character,product:p.id,advice:a.id,shade:p.options[0].id,reasons:[],test:true}).product,p.id);
  }
 }
});

test('new unspecified option labels have English coverage without changing the locale engine',()=>{
 const translations=JSON.parse(readFileSync('web/beauty-play/translations.json'));
 assert.equal(translations.en['색상·용량 미확인'],'Shade and size unconfirmed');
 const page=readFileSync('web/beauty-play/page.tsx','utf8');
 for(const label of ['Previous products','Next products','Product pages',' products'])assert.ok(page.includes(label),label);
 // Unconfirmed matches stay for old answers but are never offered or labelled in the picker.
 assert.ok(!page.includes('Product/option match unverified'));assert.match(page,/filter\(p=>p\.matchStatus!=='unconfirmed'\)/);
 assert.match(page,/snapshot\.catalogPolicy!=='all-products-v1'&&advice\?pool\.filter/);
});

test('mobile catalog keeps a non-collapsing product strip when pagination is present',()=>{
 const css=readFileSync('web/beauty-play/game.css','utf8');
 assert.ok(css.includes('.staged-workbench>*{flex-shrink:0}'));
 assert.ok(css.includes('.brand-track{min-height:36px}'));
 assert.match(css,/\[data-stage="product"\] \.staged-products\{flex:0 0 180px;min-height:180px\}/);
 assert.match(css,/\[data-stage="product"\] \.staged-products \.product-image\{flex:0 0 90px;min-height:90px;height:90px!important\}/);
});
