import test from 'node:test';
import assert from 'node:assert/strict';
import {CONCERNS, canCreateRooms, normalize, readInterests, saveInterests, visibleConcerns, recommendRooms} from '../dist/onboarding.js';

const room = (id, tag, extra = {}) => ({id, kind: 'topic', tag, sort: 1, members: 0, messages_24h: 0, title_en: id, title_ko: id, ...extra});
const rooms = [
  room('everyone', 'talk', {sort: 1}), room('acne', 'skin', {sort: 4}), room('dry-sensitive', 'skin', {sort: 5}),
  room('makeup', 'makeup', {sort: 7}), room('routine', 'skin', {sort: 8}), room('deals', 'deals', {sort: 2}),
  room('olive', 'talk', {kind: 'brand'}),
];
const memory = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v)}; };

test('concern ids keep the planned skincare/makeup split', () => {
  assert.deepEqual(CONCERNS.filter(c => c.group === 'skincare').map(c => c.id), ['acne', 'dry', 'sensitive', 'pores', 'spots', 'firmness', 'sebum', 'toneup', 'trouble']);
  assert.deepEqual(CONCERNS.filter(c => c.group === 'makeup').map(c => c.id), ['lip', 'base', 'cushion', 'longwear', 'shade']);
});

test('normalize drops unknown ids and concerns of an unselected field', () => {
  assert.equal(normalize(null), null);
  assert.equal(normalize({version: 2}), null);
  assert.deepEqual(normalize({version: 1, skincare: true, makeup: false, concerns: ['acne', 'lip', 'nope', 'acne'], done: true}),
    {version: 1, skincare: true, makeup: false, concerns: ['acne'], done: true});
});

test('choices survive a round trip through storage and tolerate broken storage', () => {
  const s = memory();
  assert.equal(readInterests(s), null);
  assert.equal(saveInterests({version: 1, skincare: true, makeup: true, concerns: ['dry', 'cushion'], done: true}, s), true);
  assert.deepEqual(readInterests(s).concerns, ['dry', 'cushion']);
  assert.equal(saveInterests({version: 1, skincare: true, makeup: false, concerns: [], done: true}, {setItem() { throw Error('full'); }}), false);
  assert.equal(readInterests({getItem() { throw Error('blocked'); }}), null);
});

test('only concerns of selected fields are offered', () => {
  assert.deepEqual(visibleConcerns({skincare: false, makeup: true}).map(c => c.id), ['lip', 'base', 'cushion', 'longwear', 'shade']);
  assert.equal(visibleConcerns({skincare: false, makeup: false}).length, 0);
});

test('skincare-only concerns recommend matching skin rooms, never brand rooms', () => {
  const recs = recommendRooms(rooms, {skincare: true, makeup: false, concerns: ['dry', 'sensitive']});
  assert.equal(recs[0].room.id, 'dry-sensitive');
  assert.deepEqual(recs[0].matched, ['dry', 'sensitive']);
  assert.ok(recs.every(r => r.room.kind !== 'brand'));
  assert.ok(recs.every(r => r.room.tag !== 'makeup'), 'makeup rooms do not leak into a skincare-only result');
});

test('both fields combine skin and makeup rooms instead of picking one', () => {
  const ids = recommendRooms(rooms, {skincare: true, makeup: true, concerns: ['acne', 'cushion']}).map(r => r.room.id);
  assert.ok(ids.includes('acne') && ids.includes('makeup'));
});

test('a room-provided concerns list wins over the built-in mapping', () => {
  const custom = [...rooms, room('tinted-acne', 'talk', {concerns: ['acne', 'cushion'], messages_24h: 3})];
  assert.equal(recommendRooms(custom, {skincare: true, makeup: true, concerns: ['acne', 'cushion']})[0].room.id, 'tinted-acne');
});

test('recent activity breaks ties and skipped choices fall back to popular rooms', () => {
  const busy = rooms.map(r => r.id === 'routine' ? {...r, messages_24h: 9} : r);
  const recs = recommendRooms(busy, {skincare: true, makeup: false, concerns: []});
  assert.equal(recs[0].room.id, 'routine');
  const popular = recommendRooms(busy, null);
  assert.ok(popular.length > 0 && popular.every(r => r.matched.length === 0 && r.popular));
  assert.equal(popular[0].room.id, 'routine');
});

test('room creation is offered only once the server lists room concerns', () => {
  assert.equal(canCreateRooms(rooms), false);
  assert.equal(canCreateRooms([...rooms, room('u-1', 'talk', {concerns: []})]), true);
});


test('optional profile preserves old choices and age does not rank rooms', () => {
  const old = {version:1, skincare:true, makeup:false, concerns:[], done:true};
  assert.deepEqual(normalize(old),old);
  const typed = normalize({...old, ageRange:'18–24', skinType:'dry'});
  assert.equal(typed.skinType,'dry');
  const list = [room('oily','skin',{concerns:['sebum']}), room('dry','skin',{concerns:['dry']})];
  assert.equal(recommendRooms(list,typed)[0].room.id,'dry');
  assert.deepEqual(recommendRooms(list,typed),recommendRooms(list,{...typed,ageRange:'45+'}));
  const explicit = {...typed,concerns:['sebum']};
  assert.equal(recommendRooms(list,explicit)[0].room.id,'oily');
});
