import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compareOffers} from '../dist/compare-offers.js';
const snapshot=JSON.parse(await readFile(new URL('../data/validation/cosrx-retailer-review-2026-10-17.json',import.meta.url),'utf8'));
test('actual public-page review cannot be promoted to purchasable lowest total',()=>{
 // Test-only context; neither postal code nor formulation is an observed customer quote.
 const context={product:{productKey:'cosrx-advanced-snail-96-mucin-power-essence',formulation:'TEST-CONTEXT-NOT-VERIFIED',variant:'single-bottle',unit:'ml',size:100,quantity:1},market:'US',currency:'USD',postalCode:'10001',now:'2026-10-17T00:00:00.000Z',maxAgeHours:24};
 const result=compareOffers(context,snapshot.offers);
 assert.equal(result.status,'insufficient_retailers');
 assert.equal(result.ranked.length,0);
 assert.equal(result.excluded.length,5);
 for(const row of result.excluded){assert.equal(row.total,null);assert.ok(row.reasons.includes('identity_unverified'));assert.ok(row.reasons.includes('total_cost_unknown'));assert.ok(row.reasons.includes('delivery_unverified'));assert.ok(row.reasons.includes('invalid_sourceUpdatedAt'));}
 assert.ok(result.excluded.find(r=>r.retailer==='YesStyle').reasons.includes('market_or_currency_mismatch'));
 console.log(JSON.stringify(result,null,2));
});
