import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setLang} from '../dist/i18n.js';
import {chatSecret, readBlocked, block, hasAgreed, agree, roomTitle, visible, errorKey, messagesUrl, postMessage} from '../dist/chat-api.js';
import {EVENT_NAMES} from '../dist/events.js';

const memory = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v))}; };

test('device secret is created once and reused', () => {
  const s = memory();
  const a = chatSecret(s);
  assert.match(a, /^[0-9a-f-]{36}$/);
  assert.equal(chatSecret(s), a);
});

test('blocked authors disappear locally; agreement is remembered', () => {
  const s = memory();
  assert.deepEqual(readBlocked(s), []);
  block(s, 'abc'); block(s, 'abc');
  assert.deepEqual(readBlocked(s), ['abc']);
  assert.deepEqual(visible([{author_tag: 'abc'}, {author_tag: 'xyz'}], readBlocked(s)), [{author_tag: 'xyz'}]);
  assert.equal(hasAgreed(s), false); agree(s); assert.equal(hasAgreed(s), true);
});

test('server error codes map to friendly text keys', () => {
  assert.equal(errorKey('chat:slow'), 'chat.err.slow');
  assert.equal(errorKey('chat:link'), 'chat.err.link');
  assert.equal(errorKey('chat:secret'), 'chat.err.other');
  assert.equal(errorKey('HTTP 500'), 'chat.err.other');
});

test('room title follows the UI language', () => {
  const r = {title_en: 'Sunscreen talk', title_ko: '선크림 이야기'};
  setLang('ko'); assert.equal(roomTitle(r), '선크림 이야기');
  setLang('en'); assert.equal(roomTitle(r), 'Sunscreen talk');
});

test('message urls: latest page first, then only newer ids', () => {
  const first = new URL(messagesUrl('acne'));
  assert.equal(first.searchParams.get('room_id'), 'eq.acne');
  assert.equal(first.searchParams.get('order'), 'id.desc');
  assert.equal(first.searchParams.get('select').includes('hidden'), false);
  const poll = new URL(messagesUrl('acne', 42));
  assert.equal(poll.searchParams.get('id'), 'gt.42');
  assert.equal(poll.searchParams.get('order'), 'id.asc');
});

test('posting sends the item reference only; the server fills in name and price', async () => {
  let sent;
  const fetchImpl = async (url, opts) => { sent = {url, body: JSON.parse(opts.body)}; return {ok: true, status: 200, json: async () => ({id: 1})}; };
  await postMessage('s', 'deals', 'look', {retailer: 'Stylevana', market: 'US', sku: '10759', name: 'forged', price: 0.01}, 7, fetchImpl);
  assert.match(sent.url, /\/rpc\/post_chat$/);
  assert.deepEqual(sent.body, {p_secret: 's', p_room: 'deals', p_body: 'look', p_retailer: 'Stylevana', p_market: 'US', p_sku: '10759', p_reply_to: 7});
  const failing = async () => ({ok: false, status: 400, json: async () => ({message: 'chat:link'})});
  await assert.rejects(postMessage('s', 'deals', 'x.com', null, null, failing), /chat:link/);
});

test('chat events are allowed by the database whitelist', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261018090000_chat.sql', import.meta.url), 'utf8');
  for (const name of EVENT_NAMES) assert.ok(sql.includes(`'${name}'`), name);
});
