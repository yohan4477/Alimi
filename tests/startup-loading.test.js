import test from 'node:test';
import assert from 'node:assert/strict';
import {beginStartupLoading} from '../dist/startup-loading.js';

function setup() {
  let now = 0, id = 0;
  const timers = new Map(), children = [], events = new Map();
  const doc = {hidden: false, body: {append: el => children.push(el)},
    createElement: () => ({setAttribute() {}, remove() { children.splice(children.indexOf(this), 1); }}),
    addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key)};
  const finish = beginStartupLoading({label: '불러오는 중…', line1: '함께', line2: '뷰티',
    doc, schedule: (fn, ms) => { timers.set(++id, {fn, at: now + ms}); return id; }, cancel: id => timers.delete(id)});
  const tick = ms => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } };
  return {doc, children, timers, events, finish, tick};
}

test('fast first request never displays artwork or leaves timers/listeners behind', () => {
  const s = setup(); s.tick(399); s.finish(); s.tick(9000);
  assert.equal(s.children.length, 0); assert.equal(s.timers.size, 0); assert.equal(s.events.size, 0);
});
test('slow first request shows the original launch assets and leaves immediately on completion', () => {
  const s = setup(); s.tick(400);
  assert.equal(s.children.length, 1);
  assert.match(s.children[0].innerHTML, /splash-photo.webp/);
  assert.match(s.children[0].innerHTML, /seoul-beauty-logo.webp/);
  assert.doesNotMatch(s.children[0].innerHTML, /loading-characters/);
  s.finish(); assert.equal(s.children.length, 0);
});
test('backgrounding dismisses the launch cover and cannot show it again', () => {
  const s = setup(); s.tick(400); s.doc.hidden = true; s.events.get('visibilitychange')();
  s.doc.hidden = false; s.tick(9000);
  assert.equal(s.children.length, 0); assert.equal(s.events.size, 0);
});
test('stalled requests release navigation after the cover limit', () => {
  const s = setup(); s.tick(400); s.tick(8000);
  assert.equal(s.children.length, 0); assert.equal(s.timers.size, 0);
});
