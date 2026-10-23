import './fixtures/us-market.js';
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

test('room titles follow the interface language, falling back to the other language', () => {
  const r = {title_en: 'Sunscreen talk', title_ko: '선크림 이야기'};
  setLang('ko'); assert.equal(roomTitle(r), '선크림 이야기');
  assert.equal(roomTitle({title_en: 'Sunscreen talk'}), 'Sunscreen talk');
  setLang('en'); assert.equal(roomTitle({...r,service_region:'kr'}), 'Sunscreen talk');
  assert.equal(roomTitle({title_ko: '선크림 이야기'}), '선크림 이야기');
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

test('web events are allowed by the latest database whitelist', () => {
  const sql = ['20261019010000_community.sql', '20261023000000_beauty_community_events.sql'].map(file => readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')).join('\n');
  for (const name of EVENT_NAMES) assert.ok(sql.includes(`'${name}'`), name);
});

test('community urls: topic posts by activity, product talk by family key', async () => {
  const {postsUrl, mentionsUrl, ago, createPost} = await import('../dist/community-api.js');
  const u = new URL(postsUrl('sunscreen'));
  assert.equal(u.searchParams.get('room_id'), 'eq.sunscreen');
  assert.equal(u.searchParams.get('order'), 'last_activity_at.desc');
  assert.equal(u.searchParams.get('select').includes('hidden'), false);
  assert.equal(new URL(postsUrl()).searchParams.get('order'), 'created_at.desc');
  assert.equal(new URL(mentionsUrl('anua|oil')).searchParams.get('family_key'), 'eq.anua|oil');
  assert.equal(ago('2026-10-19T00:00:00Z', Date.parse('2026-10-19T02:30:00Z')), '2h');
  let sent;
  await createPost('s', 'sunscreen', {kind: 'question', title: 'Hi', item: {retailer: 'R', market: 'US', sku: '9', name: 'forged'}, reasons: ['texture'], fromMessage: 5},
    async (url, o) => { sent = JSON.parse(o.body); return {ok: true, status: 200, json: async () => ({id: 1})}; });
  assert.deepEqual(sent, {p_secret: 's', p_room: 'sunscreen', p_kind: 'question', p_title: 'Hi', p_body: '', p_retailer: 'R', p_market: 'US', p_sku: '9', p_reasons: ['texture'], p_from_message: 5, p_review: {}});
});

test('review payload keeps only valid optional facts', async () => {
  const {reviewPayload, photoUrl} = await import('../dist/community-api.js');
  assert.deepEqual(reviewPayload({usedFor: 'weeks', skinType: 'dry', goal: ' hydration ', photos: ['v1/a.jpg'], where: 'Stylevana', price: '16.5', shipCountry: 'us', shipDays: '9', sponsored: true}),
    {used_for: 'weeks', skin_type: 'dry', goal: 'hydration', photos: ['v1/a.jpg'], bought_where: 'Stylevana', bought_price_minor: 1650, bought_currency: 'USD', ship_country: 'US', ship_days: 9, sponsored: true});
  assert.deepEqual(reviewPayload({usedFor: 'forever', skinType: 'alien', price: 'abc', shipCountry: 'USA', shipDays: '-1'}), {});
  assert.match(photoUrl('v1/a.jpg'), /\/storage\/v1\/object\/public\/review-photos\/v1\/a\.jpg$/);
});

test('creating a room sends trimmed text, the field tag and concern ids to create_room', async () => {
  const {createRoom} = await import('../dist/chat-api.js');
  let sent;
  const fetchImpl = async (url, opts) => { sent = {url, body: JSON.parse(opts.body)}; return {ok: true, status: 200, json: async () => 'u-abc123'}; };
  assert.equal(await createRoom('s', {title: '  Cushion for oily skin ', intro: ' lasts? ', tag: 'makeup', concerns: ['cushion']}, fetchImpl), 'u-abc123');
  assert.match(sent.url, /\/rpc\/create_region_room$/);
  assert.deepEqual(sent.body, {p_secret: 's', p_title: 'Cushion for oily skin', p_intro: 'lasts?', p_tag: 'makeup', p_concerns: ['cushion'], p_service_region:'us'});
});

test('room creation errors map to their own messages', () => {
  assert.equal(errorKey('chat:short'), 'chat.err.short');
  assert.equal(errorKey('chat:duplicate'), 'chat.err.duplicate');
  assert.equal(errorKey('chat:slow'), 'chat.err.slow');
  // Server without the migration yet: PostgREST reports a missing function.
  assert.equal(errorKey('Could not find the function public.create_room'), 'chat.err.other');
});

test('the latest concern migration only accepts concern ids the web guide knows', async () => {
  const {CONCERNS} = await import('../dist/onboarding.js');
  const sql = readFileSync(new URL('../supabase/migrations/20261019060000_concern_keywords.sql', import.meta.url), 'utf8');
  const lists = [...sql.matchAll(/array\['acne', 'dry'[^\]]*\]/g)];
  assert.equal(lists.length, 2, 'column check and create_room filter');
  for (const list of lists) assert.deepEqual(JSON.parse(list[0].slice(5).replace(/'/g, '"')), CONCERNS.map(c => c.id));
});
