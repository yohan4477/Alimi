import {setLang} from '../dist/i18n.js';
setLang('ko'); // assertions below use the Korean copy; English is covered in i18n.test.js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toProducts,search,dailySeries,stats,trackedDays,alertState,parseTarget,readState,toggleFavorite,loadProducts,catalogPageUrl,brandLabel,CATEGORIES} from '../dist/live.js';

const snapshot=JSON.parse(readFileSync(new URL('../dist/live-snapshot.json',import.meta.url)));
const products=toProducts(snapshot.rows);
const p=(history)=>({history:history.map(([at,price])=>({at,price}))});

test('snapshot has the ten real catalog products with USD prices and official links',()=>{
  assert.equal(products.length,10);
  for(const x of products){assert.equal(x.currency,'USD');assert.ok(x.price>0);assert.match(x.affiliateUrl,/^https:\/\/www\.awin1\.com\/pclick\.php/);assert.match(x.imageUrl,/^https:\/\/[^/]+\.stylevana\.com\//);assert.ok(x.history.length>=1)}
});
test('search by brand / name / category, case and whitespace insensitive',()=>{
  assert.equal(search(products,'  cosrx ').length,1);
  assert.equal(search(products,'medicube').length,2);
  assert.equal(search(products,'없는상품').length,0);
  assert.equal(search(products,'').length,10);
  for(const c of CATEGORIES)assert.ok(search(products,'',c).every(x=>x.category===c));
  assert.equal(search([{brand:'BEAUTY OF JOSEON',brandKo:'조선미녀',name:'Relief Sun',category:'선케어'}],'조선미녀').length,1);
  assert.equal(brandLabel({brand:'Romand',brandKo:'롬앤'}),'롬앤');assert.equal(brandLabel({brand:'X',brandKo:null}),'X');
});
test('daily series carries change-only history forward and leaves pre-tracking days empty (KST days)',()=>{
  const now=new Date('2026-10-20T03:00:00Z'); // 10/20 12:00 KST
  const s=dailySeries(p([['2026-10-17T22:30:00Z',20],['2026-10-19T22:30:00Z',18]]),5,now);
  assert.deepEqual(s.map(d=>d.day),['2026-10-16','2026-10-17','2026-10-18','2026-10-19','2026-10-20']);
  assert.deepEqual(s.map(d=>d.price),[null,null,20,20,18]);
  assert.deepEqual(stats(s),{min:18,max:20,avg:58/3,days:3});
  assert.equal(stats(dailySeries(p([]),7,now)),null);
  assert.equal(trackedDays(p([['2026-10-17T22:30:00Z',20]]),now),3);
});
test('USD target validation, alert state and boundary',()=>{
  for(const bad of ['','0','-1','1.234','abc','10000.01','<script>'])assert.equal(parseTarget(bad),null);
  assert.equal(parseTarget('12.5'),12.5);
  assert.equal(alertState(null,10),'미설정');assert.equal(alertState(12,13),'기다리는 중');assert.equal(alertState(12,12),'목표가 도달');
});
test('favorites persist; corrupted or invalid storage is ignored',()=>{
  const s={favorites:[],targets:{a:12.5,b:'bad'}};toggleFavorite(s,'a');
  assert.deepEqual(readState({getItem:()=>JSON.stringify(s)}),{favorites:['a'],targets:{a:12.5}});
  toggleFavorite(s,'a');assert.deepEqual(s.favorites,[]);
  assert.deepEqual(readState({getItem:()=>'{broken'}),{favorites:[],targets:{}});
});
test('falls back to the bundled snapshot when the live API fails',async()=>{
  const fetchImpl=async u=>{if(String(u).includes('supabase'))throw Error('offline');return {ok:true,json:async()=>snapshot}};
  const r=await loadProducts(fetchImpl);
  assert.equal(r.source,'snapshot');assert.equal(r.products.length,10);
  const live=await loadProducts(async()=>({ok:true,json:async()=>snapshot.rows}));
  assert.equal(live.source,'live');
});
test('catalog search query is sanitized before reaching the PostgREST filter',async()=>{
  const {catalogSearchUrl,catalogQuery,searchCatalog,requestTracking}=await import('../dist/live.js');
  assert.equal(catalogSearchUrl('a'),null);
  assert.equal(catalogQuery('rom&nd),name.eq.x'),'rom&nd name eq x');
  const u=new URL(catalogSearchUrl('  Juicy   tint '));
  assert.equal(u.searchParams.get('or'),'(brand.ilike."*Juicy tint*",brand_ko.ilike."*Juicy tint*",name.ilike."*Juicy tint*")');
  assert.equal(u.searchParams.get('active'),'eq.true');
  assert.equal(catalogQuery('조선미녀 선크림'),'조선미녀 선크림');
  const rows=await searchCatalog('cosrx',async()=>({ok:true,json:async()=>[{sku:'1',price_minor:1750}]}));
  assert.equal(rows[0].price,17.5);
  let sent;const slug=await requestTracking({retailer:'Stylevana US',market:'US',sku:'66606'},async(url,init)=>{sent=[url,init];return {ok:true,json:async()=>'sv-us-66606'}});
  assert.equal(slug,'sv-us-66606');assert.match(sent[0],/rpc\/request_tracking$/);
  assert.deepEqual(JSON.parse(sent[1].body),{p_retailer:'Stylevana US',p_market:'US',p_sku:'66606'});
});
test('catalog browse pages are filtered by category and ordered stably',()=>{
  const all=new URL(catalogPageUrl('전체',48));
  assert.equal(all.searchParams.get('category'),null);assert.equal(all.searchParams.get('offset'),'48');assert.equal(all.searchParams.get('order'),'sku.desc');
  assert.equal(new URL(catalogPageUrl('선케어',0)).searchParams.get('category'),'eq.선케어');
});
test('watch summary replaces the empty chart with a plain sentence',async()=>{
  const {watchSummary}=await import('../dist/live.js');
  const now=new Date('2026-10-20T03:00:00Z');
  const h=(...ps)=>ps.map(([at,price])=>({at,price}));
  assert.equal(watchSummary({price:20,history:h(['2026-10-17T22:30:00Z',20])},now).text,'지켜본 지 3일 · 아직 가격 변동 없음');
  assert.equal(watchSummary({price:18,history:h(['2026-10-17T22:30:00Z',20],['2026-10-19T22:30:00Z',18])},now).text,'지켜본 3일 중 지금이 최저가');
  assert.equal(watchSummary({price:21,history:h(['2026-10-17T22:30:00Z',20],['2026-10-18T22:30:00Z',18],['2026-10-19T22:30:00Z',21])},now).text,'지켜본 3일 동안 가격 2번 변동');
});
