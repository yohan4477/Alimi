import './fixtures/us-market.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {shareUrl, share, sharedTarget} from '../dist/share.js';

test('share links use actual route and preserve market/language without hash or unrelated params', () => {
  assert.equal(shareUrl({room: 'acne'}, 'https://x.app/?lang=ko&utm=1#top'), 'https://x.app/live?room=acne&region=us&lang=ko');
});

test('system share sheet first; cancelling is not an error; otherwise copy the link', async () => {
  const toasts = [];
  assert.equal(await share({title: 'T', url: 'u'}, m => toasts.push(m), {share: async () => {}}), 'shared');
  assert.equal(await share({title: 'T', url: 'u'}, m => toasts.push(m), {share: async () => { throw Object.assign(Error(), {name: 'AbortError'}); }}), 'cancelled');
  let copied; assert.equal(await share({title: 'T', url: 'u'}, m => toasts.push(m), {clipboard: {writeText: async v => { copied = v; }}}), 'copied');
  assert.equal(copied, 'u');
  assert.equal(await share({title: 'T', url: 'u'}, m => toasts.push(m), {}), 'failed');
  assert.equal(toasts.length, 2);
  assert.match(toasts[1], /u/);
  assert.equal(await share({title: 'T', url: 'https://example.com/room'}, m => toasts.push(m), {}), 'failed');
  assert.match(toasts[2], /https:\/\/example.com\/room/);
});

test('arrival links only accept a valid room id or a product key', () => {
  assert.deepEqual(sharedTarget('?room=dry-sensitive'), {room: 'dry-sensitive'});
  assert.equal(sharedTarget('?room=<script>'), null);
  assert.deepEqual(sharedTarget('?product=anua|oil'), {product: 'anua|oil'});
  assert.equal(sharedTarget('?lang=ko'), null);
});
