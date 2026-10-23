import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePostProduct, createPost, addComment} from '../dist/community-api.js';
test('discussion without a product is valid and complete references are normalized', () => {
  assert.equal(validatePostProduct(null), null);
  assert.deepEqual(validatePostProduct({retailer:' Stylevana ',market:' US ',sku:' 123 ',name:'Ignored'}), {retailer:'Stylevana',market:'US',sku:'123'});
});
test('incomplete or invalid product references fail locally before any request', async () => {
  let calls = 0;
  const fetchImpl = async () => {calls++; throw Error('must not fetch');};
  for (const item of [{sku:'abc'}, {retailer:'a',market:'US'}, {retailer:'a',market:'US',sku:''}, [], 'x', {retailer:'a',market:'US',sku:'a'.repeat(161)}]) {
    assert.throws(() => validatePostProduct(item), /chat:item/);
    assert.throws(() => createPost('s','room',{kind:'question',title:'Fixture',item},fetchImpl), /chat:item/);
    assert.throws(() => addComment('s',1,'Fixture',item,fetchImpl), /chat:item/);
  }
  assert.equal(calls, 0);
});
