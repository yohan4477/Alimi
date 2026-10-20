import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRegion,inRegion,inMarket,regionURL,languageURL,money,amount} from '../dist/region.js';
import {shareUrl} from '../dist/share.js';
test('explicit service path wins over storage, and interface language never implies country',()=>{
 const storage={getItem:()=> 'us'};
 assert.equal(resolveRegion({pathname:'/kr',search:'?lang=en&region=us',storage}),'kr');
 assert.equal(resolveRegion({pathname:'/us/',search:'?lang=ko'}),'us');
 assert.equal(resolveRegion({search:'?lang=ko'}),'us');
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
 assert.equal(shareUrl({room:'u-a'},href),'https://seoulbeauty.me/kr?room=u-a');
 assert.equal(shareUrl({product:'a'},'https://seoulbeauty.me/us?lang=ko#x'),'https://seoulbeauty.me/us?product=a');
});
