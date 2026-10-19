import test from 'node:test';
import assert from 'node:assert/strict';
import {roomCategory, topicPictures, roomImages, roomStats} from '../dist/room-card.js';

const room = (id, extra = {}) => ({id, kind: 'topic', tag: 'talk', members: 0, messages_24h: 0, ...extra});

test('rooms map to a catalog category by id, then concern, then field', () => {
  assert.equal(roomCategory(room('makeup')), '립');
  assert.equal(roomCategory(room('u-1', {concerns: ['cushion']})), '베이스메이크업');
  assert.equal(roomCategory(room('u-2', {tag: 'skin'})), '에센스·세럼');
  assert.equal(roomCategory(room('everyone')), null);
});

test('a product really mentioned in the room wins; catalog pictures are never reused', () => {
  const byCategory = new Map([['립', ['lip1', 'lip2']], ['전체', ['top1', 'lip1', 'top2']]]);
  const pics = topicPictures([room('makeup'), room('u-1', {concerns: ['lip']}), room('everyone'), room('deals')], byCategory, new Map([['makeup', 'mentioned']]));
  assert.deepEqual([...pics], [['makeup', 'mentioned'], ['u-1', 'lip1'], ['everyone', 'top1'], ['deals', 'top2']]);
});

test('mentioned pictures come from the newest entry per room', () => {
  const map = roomImages([{room_id: 'a', item: {image_url: 'old'}, created_at: '2026-10-18'}, {room_id: 'a', item: {image_url: 'new'}, created_at: '2026-10-19'}, {room_id: 'b', item: null}]);
  assert.deepEqual([...map], [['a', 'new']]);
});

test('"active now" appears only with messages in the last 24 hours', () => {
  assert.doesNotMatch(roomStats(room('x', {members: 3})), /·/);
  assert.match(roomStats(room('x', {members: 3, messages_24h: 1})), /·/);
});

test('"new messages" only when the room changed after this device last looked', async () => {
  const {hasNewSince} = await import('../dist/chat.js').catch(() => ({}));
  if (!hasNewSince) return; // chat.js needs a browser; covered by e2e/journey.e2e.mjs
  assert.equal(hasNewSince({created_at: '2026-10-19T10:00'}, '2026-10-19T09:00'), true);
  assert.equal(hasNewSince({created_at: '2026-10-19T08:00'}, '2026-10-19T09:00'), false);
  assert.equal(hasNewSince({created_at: '2026-10-19T10:00'}, undefined), false, 'never seen: no claim');
});
