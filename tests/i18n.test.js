import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {t, setLang, categoryLabel} from '../dist/i18n.js';
import {watchSummary, alertState, brandLabel, CATEGORIES} from '../dist/live.js';

const web = readFileSync(new URL('../dist/strings.json', import.meta.url), 'utf8');
const strings = JSON.parse(web);

test('every string has Korean and English with the same placeholders', () => {
  for (const [key, v] of Object.entries(strings)) {
    if (key.startsWith('_')) continue;
    assert.ok(v.ko && v.en, key);
    const ph = s => (s.match(/\{\w+\}/g) ?? []).sort().join();
    assert.equal(ph(v.ko), ph(v.en), key + ' placeholders differ');
  }
  for (const c of ['전체', ...CATEGORIES]) assert.ok(strings['category.' + c], 'missing category ' + c);
});

test('iOS bundle copy is identical to the web strings', () => {
  assert.equal(readFileSync(new URL('../ios/Alimi/strings.json', import.meta.url), 'utf8'), web, 'run: cp dist/strings.json ios/Alimi/strings.json');
});

test('English for US users, Korean for the Korean operator', () => {
  const p = {price: 20, history: [{at: '2026-10-17T22:30:00Z', price: 20}], brand: 'BEAUTY OF JOSEON', brandKo: '조선미녀'};
  const now = new Date('2026-10-20T03:00:00Z');
  setLang('en');
  assert.equal(watchSummary(p, now).text, 'Watched 3d · no price change yet');
  assert.equal(alertState(25, 20), 'Target reached');
  assert.equal(brandLabel(p), 'BEAUTY OF JOSEON');
  assert.equal(categoryLabel('선케어'), 'Sun care');
  assert.equal(t('count', {n: 4}), '4 items');
  setLang('ko');
  assert.equal(watchSummary(p, now).text, '지켜본 지 3일 · 아직 가격 변동 없음');
  assert.equal(brandLabel(p), '조선미녀');
  assert.equal(categoryLabel('선케어'), '선케어');
  assert.equal(t('no.such.key'), 'no.such.key');
});
