import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateCommand} from '../server/beauty-game-domain.mjs';
import {gameKind,buildFullCatalog} from '../scripts/beauty-game-full-catalog.mjs';
const read=f=>JSON.parse(readFileSync('web/beauty-play/'+f));
const full=read('catalog-full.json'),core=[...read('product-data.json').products,...read('scenario-products.json')];
const play='11111111-1111-4111-8111-111111111111';
test('the full catalog only holds the six game kinds and never repeats a hand-matched product',()=>{
 const coreIds=new Set(core.flatMap(p=>[p.id,...p.options.map(o=>o.id)])),ids=new Set();
 for(const p of full){
  assert.ok(['lip','base','powder','hair','sun','cream'].includes(p.category),p.id);
  assert.ok(p.options.length>0&&p.image.startsWith('https://')&&p.url.startsWith('https://'),p.id);
  assert.ok(!coreIds.has(p.id)&&!ids.has(p.id),p.id);ids.add(p.id);
 }
});
test('answers with a full-catalog product and option validate on the server',()=>{
 const p=full.find(p=>p.options.length>1);
 const v=validateCommand('record',{kind:'answer',play,character:'david',product:p.id,shade:p.options[1].id,reasons:[],test:true});
 assert.equal(v.product,p.id);
 assert.throws(()=>validateCommand('record',{kind:'answer',play,character:'david',product:'not-a-product',reasons:[],test:true}));
});
test('kinds come from the catalog category and drop tools',()=>{
 assert.equal(gameKind({category:'베이스메이크업',name:'Kill Cover Cushion'}),'base');
 assert.equal(gameKind({category:'베이스메이크업',name:'Kill Cover Cushion Puff'}),null);
 assert.equal(gameKind({category:'베이스메이크업',name:'Blur Powder Pact'}),'powder');
 assert.equal(gameKind({category:'베이스메이크업',name:'Glow Highlighter Powder'}),null);
 assert.equal(gameKind({category:'헤어·바디',name:'Body Lotion'}),null);
 const rows=[{sku:'2',brand:'A',brand_ko:'에이',name:'Tint 01',base_name:'Tint',family_key:'a|tint',option_label:'01',image_url:'https://x/1.jpg',url:'https://x',category:'립',availability:'in_stock'},
  {sku:'1',brand:'A',name:'Tint 02',base_name:'Tint',family_key:'a|tint',option_label:'02',image_url:'https://x/2.jpg',url:'https://x',category:'립',availability:'in_stock'},
  {sku:'3',brand:'B',name:'Tint',family_key:'b|tint',image_url:'https://x/3.jpg',url:'https://x',category:'립',availability:'out_of_stock'}];
 assert.deepEqual(buildFullCatalog(rows).map(p=>[p.id,p.options.map(o=>o.id)]),[['1',['1','2']]]);
 assert.deepEqual(buildFullCatalog(rows,new Set(['2'])),[]);
 assert.deepEqual(buildFullCatalog(rows,new Set(),()=>({origin:'other'})),[]);
});
test('display names drop leading retailer tags and brand-only base names',async()=>{
 const {displayName}=await import('../scripts/beauty-game-full-catalog.mjs');
 assert.equal(displayName({brand:'CENTELLIAN 24',base_name:'[[Deal] CENTELLIAN 24',name:'[Deal] CENTELLIAN 24 Madeca Cream - 50ml'}),'CENTELLIAN 24 Madeca Cream - 50ml');
 assert.equal(displayName({brand:'Unleashia',base_name:'[a by Unleashia] Hey Dew Blue Cushion',name:'x'}),'Hey Dew Blue Cushion');
});
test('catalog photos carry a measured zoom so small products fill their card',async()=>{
 const {readFileSync}=await import('node:fs');const list=JSON.parse(readFileSync('web/beauty-play/catalog-full.json','utf8'));
 const fits=list.filter(p=>p.fit);assert.ok(fits.length>list.length/2);
 for(const [x,y,s] of fits.map(p=>p.fit)){assert.ok(x>=0&&x<=100&&y>=0&&y<=100);assert.ok(s>1&&s<=3.6);}
 assert.match(readFileSync('web/beauty-play/page.tsx','utf8'),/clipPath:`inset\(/);
});
