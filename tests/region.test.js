import './fixtures/us-market.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRegion,inRegion,inMarket,regionURL,languageURL,money,amount} from '../dist/region.js';
import {shareUrl} from '../dist/share.js';
test('explicit service path wins over storage, and interface language never implies country',()=>{
 const storage={getItem:()=> 'us'};
 assert.equal(resolveRegion({pathname:'/kr',search:'?lang=en&region=us',storage}),'kr');
 assert.equal(resolveRegion({pathname:'/us/',search:'?lang=ko'}),'us');
 assert.equal(resolveRegion({search:'?lang=ko'}),null);
 assert.equal(resolveRegion({search:'?region=kr'}),'kr');
});
test('legacy US content cannot appear in Korea; foreign-currency prices are excluded',()=>{
 assert.equal(inRegion({id:'old'},'kr'),false);
 assert.equal(inRegion({service_region:'kr'},'kr'),true);
 assert.equal(inMarket({market:'US',currency:'USD'},'kr'),false);
 assert.equal(inMarket({market:'KR',currency:'KRW'},'kr'),true);
 assert.equal(inMarket({},'kr'),false);
 assert.equal(amount(17000,'KRW'),17000);assert.equal(amount(1750,'USD'),17.5);
 assert.equal(money(17000,'KRW'),'₩17,000');
});
test('language changes preserve deep-link target; region changes open the chosen home',()=>{
 const href='https://seoulbeauty.me/kr?room=u-a&lang=ko';
 assert.equal(languageURL('en',href).pathname,'/kr');
 assert.equal(languageURL('en',href).searchParams.get('room'),'u-a');
 assert.equal(regionURL('us',href).searchParams.has('room'),false);
 assert.equal(regionURL('us',href).searchParams.get('lang'),'ko');
 assert.equal(regionURL('kr','https://seoulbeauty.me/us?lang=en').searchParams.get('lang'),'en');
 assert.equal(shareUrl({room:'u-a'},href),'https://seoulbeauty.me/kr?room=u-a');
 assert.equal(shareUrl({product:'a'},'https://seoulbeauty.me/us?lang=ko#x'),'https://seoulbeauty.me/us?product=a');
});

test('pre-migration catalog fallback uses family identities but only regional offer prices',async()=>{
 const {fetchFamiliesPage}=await import('../dist/live.js');const calls=[];
 const rows=await fetchFamiliesPage('전체',0,24,async url=>{
  const u=new URL(url);calls.push(u);
  if(u.pathname.endsWith('catalog_region_families'))return {ok:false,status:404};
  if(u.pathname.endsWith('catalog_families')){assert.equal(u.searchParams.get('select'),'family_key');assert.equal(u.searchParams.has('currency'),false);return {ok:true,json:async()=>[{family_key:'serum'}]};}
  assert.equal(u.searchParams.get('market'),'eq.US');assert.equal(u.searchParams.get('currency'),'eq.USD');
  return {ok:true,json:async()=>[{family_key:'serum',market:'US',currency:'USD',brand:'Test',name:'Serum',price_minor:1800}]};
 });
 assert.equal(rows[0].minPrice,18);assert.equal(calls.length,3);
});
