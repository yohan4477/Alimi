import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOffers} from '../scripts/compare-offers.mjs';
// Entirely synthetic. No fixture is a real retailer quote or verified identity.
const product={productKey:'fixture-essence',formulation:'fixture-v1',variant:'unflavoured',size:100,unit:'ml',quantity:1};
const request={product,market:'US',currency:'USD',postalCode:'10001',now:'2026-10-15T14:00:00.000Z',maxAgeHours:24};
const offer={product,retailer:'Fixture A',offerId:'a',sourceUrl:'https://example.com/a',identityReview:{status:'verified',evidence:'Synthetic test only'},market:'US',currency:'USD',postalCode:'10001',shipsToDestination:true,availability:'in_stock',purchaseType:'one_time',discountType:'none',costScope:'requested_item_only',price:15,shipping:3,tax:1.5,duties:0,costsVerified:true,observedAt:'2026-10-15T13:00:00.000Z',sourceUpdatedAt:'2026-10-15T12:00:00.000Z'};
const other={...offer,retailer:'Fixture B',offerId:'b',price:16,shipping:0};
const result=(patch={})=>compareOffers(request,[{...offer,...patch}]);
test('ranks by complete destination total, not sticker price',()=>{const r=compareOffers(request,[offer,other]);assert.equal(r.status,'comparable');assert.equal(r.ranked[0].retailer,'Fixture B');assert.equal(r.ranked[0].total,17.5);assert.equal(r.ranked[0].lowestAmongEligible,true);});
test('unknown shipping, tax or duties never becomes free',()=>{for(const k of ['shipping','tax','duties']){const r=result({[k]:null});assert.equal(r.ranked.length,0);assert.equal(r.excluded[0].total,null);}});
test('size, unit, quantity, formulation and variant must match',()=>{for(const [k,v] of Object.entries({size:200,unit:'g',quantity:2,formulation:'v2',variant:'berry',productKey:'other'}))assert.equal(result({product:{...product,[k]:v}}).ranked.length,0);});
test('matching names or keys without reviewed evidence are insufficient',()=>{for(const identityReview of [null,{status:'candidate',evidence:'name match'},{status:'verified',evidence:''}])assert.equal(result({identityReview}).ranked.length,0);});
test('market, currency, destination and stock block comparison',()=>{for(const patch of [{market:'JP'},{currency:'NZD'},{postalCode:'90001'},{shipsToDestination:false},{availability:'unknown'},{availability:'out_of_stock'}])assert.equal(result(patch).ranked.length,0);});
test('subscription, coupon and basket conditions excluded',()=>{for(const patch of [{purchaseType:'subscription'},{discountType:'new_customer'},{costScope:'basket'},{costsVerified:false}])assert.equal(result(patch).ranked.length,0);});
test('fresh download cannot revive stale source data',()=>{assert.equal(result({sourceUpdatedAt:'2026-10-13T12:00:00.000Z'}).ranked.length,0);assert.equal(result({observedAt:'2026-10-13T13:00:00.000Z'}).ranked.length,0);});
test('bad, future and inconsistent timestamps excluded',()=>{for(const patch of [{observedAt:'bad'},{sourceUpdatedAt:'2026-02-30T12:00:00.000Z'},{observedAt:'2026-10-16T14:00:00.000Z'},{sourceUpdatedAt:'2026-10-15T13:30:00.000Z'}])assert.equal(result(patch).ranked.length,0);});
test('one retailer cannot receive lowest-price label',()=>{assert.equal(result().status,'insufficient_retailers');assert.equal(result().ranked[0].lowestAmongEligible,false);assert.equal(compareOffers(request,[offer,{...offer,offerId:'a2'}]).status,'insufficient_retailers');});
test('ties preserve both eligible retailer offers',()=>{const r=compareOffers(request,[offer,{...other,price:15,shipping:3}]);assert.equal(r.ranked.filter(x=>x.lowestAmongEligible).length,2);});
test('invalid amounts and missing rows fail closed',()=>{for(const price of [NaN,Infinity,-1,0,'15',15.001])assert.equal(result({price}).ranked.length,0);assert.equal(compareOffers(request,[null]).excluded.length,1);assert.throws(()=>compareOffers({...request,maxAgeHours:NaN},[]));});
test('duplicate offer identifiers rejected; comparison is deterministic and nonmutating',()=>{assert.throws(()=>compareOffers(request,[offer,offer]));const before=JSON.stringify(offer);assert.deepEqual(result(),result());assert.equal(JSON.stringify(offer),before);});

