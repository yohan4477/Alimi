import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePostProduct} from '../dist/community-api.js';

test('post without a product remains a valid discussion', () => {
  assert.equal(validatePostProduct(null),null);
});
test('complete product is trimmed and preserved', () => {
  assert.deepEqual(validatePostProduct({retailer:' Stylevana ',market:' US ',sku:' 123 ',name:'Test'}),{retailer:'Stylevana',market:'US',sku:'123'});
});
test('incomplete or malicious product reference is rejected', () => {
  for(const product of [{sku:'abc'}, {retailer:'a',market:'US'}, {retailer:'a',market:'US',sku:''}, [], 'x',{retailer:'a',market:'US',sku:'a'.repeat(161)}]){
    assert.throws(()=>validatePostProduct(product),/Invalid product/);
  }
});
