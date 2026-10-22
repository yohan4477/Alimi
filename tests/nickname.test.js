import test from 'node:test';
import assert from 'node:assert/strict';
import {setLang} from '../dist/i18n.js';
import {nick} from '../dist/nickname.js';

test('server nicknames read in Korean on Korean screens, unchanged otherwise', () => {
  setLang('ko');
  assert.equal(nick('Honey Hamster'), '꿀빛 햄스터');
  assert.equal(nick('Bright Swan'), '밝은 백조');
  assert.equal(nick('루나'), '루나');
  assert.equal(nick('Honey Hamster Jr'), 'Honey Hamster Jr');
  setLang('en');
  assert.equal(nick('Honey Hamster'), 'Honey Hamster');
});
