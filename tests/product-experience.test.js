import test from 'node:test';
import assert from 'node:assert/strict';
import {experienceMarkup, installExperienceChoices, preferredExperienceReviews} from '../dist/product-experience.js';
import {setLang} from '../dist/i18n.js';

const values = new Map();
globalThis.localStorage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
function box() {
  let click;
  return {addEventListener: (type, fn) => {click = fn;}, removeEventListener: (type, fn) => {if (click === fn) click = null;}, contains: () => true,
    choose: dataset => click({target: {closest: () => ({dataset})}})};
}
test('optional experience markup is localized and does not hide real reviews', () => {
  setLang('en');
  const english = experienceMarkup('localized', 3, null);
  assert.match(english, /Explore 3 published reviews/);
  assert.match(english, /read reviews without choosing/);
  assert.doesNotMatch(english, /[가-힣]/);
  setLang('ko');
  assert.match(experienceMarkup('localized', 0, null), /아직 등록된 후기가 없어요/);
  setLang('en');
});
test('invalid, null and malicious stored selections cannot break or inject the product sheet', () => {
  for (const [id, value] of [['bad-status', {status:'nope',topic:'x'}], ['null', null], ['bad-topic', {status:'before',topic:'<img src=x onerror=alert(1)>'}]]) {
    values.set('sb-experience-v1:' + id, JSON.stringify(value));
    assert.doesNotThrow(() => experienceMarkup(id, 1, null));
    assert.doesNotMatch(experienceMarkup(id, 1, null), /onerror|data-experience-topic="<|experience-result/);
  }
});
test('clicking choices stores allowlisted IDs only and keeps products isolated', () => {
  const element = box(); let redraws = 0;
  installExperienceChoices(element, 'a', () => redraws++);
  element.choose({experienceStatus:'current'});
  element.choose({experienceTopic:'texture'});
  assert.deepEqual(JSON.parse(values.get('sb-experience-v1:a')), {status:'current',topic:'texture'});
  assert.match(experienceMarkup('a', 2, null), /experience-result/);
  assert.doesNotMatch(experienceMarkup('b', 2, null), /experience-result/);
  element.choose({experienceTopic:'malicious'});
  assert.equal(redraws, 2);
  element.choose({experienceStatus:'past'});
  assert.deepEqual(JSON.parse(values.get('sb-experience-v1:a')), {status:'past',topic:''});
  let current = 0;
  installExperienceChoices(element, 'a', () => current++);
  element.choose({experienceTopic:'liked'});
  assert.equal(current, 1);
  assert.equal(redraws, 3, 'the old handler is removed on reopening');
});
test('prototype Korean topics migrate to stable IDs without losing the selection', () => {
  values.set('sb-experience-v1:legacy', JSON.stringify({status:'before',topic:'사용감'}));
  assert.match(experienceMarkup('legacy', 2, null), /data-experience-topic="texture" aria-pressed="true"/);
});
test('blocked or silently ignored storage keeps controls working and discloses session-only state', () => {
  const storage = globalThis.localStorage;
  try {
    for (const [id, broken] of [['throws', {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}}], ['noop', {getItem:()=>null,setItem:()=>{}}], ['absent', null]]) {
      globalThis.localStorage = broken;
      const element = box();
      installExperienceChoices(element, id, () => {});
      element.choose({experienceStatus:'before'});
      assert.match(experienceMarkup(id, 0, null), /Choices last for this session only/);
      assert.match(experienceMarkup(id, 0, null), /data-experience-status="before" aria-pressed="true"/);
    }
  } finally {globalThis.localStorage = storage;}
});
test('profile matching sorts actual self-reports without fabricating or removing reviews', () => {
  const reviews = [{id:1,skin_type:'oily'},{id:2},{id:3,skin_type:'dry'},{id:4,skin_type:'dry'}];
  assert.equal(preferredExperienceReviews(reviews, 'none', null), reviews);
  assert.deepEqual(preferredExperienceReviews(reviews, 'none', {skin_type:'dry'}).map(r=>r.id), [3,4,1,2]);
  assert.deepEqual(reviews.map(r=>r.id), [1,2,3,4]);
});
