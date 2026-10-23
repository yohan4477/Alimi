import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFeedList, feedListUrl, decide} from '../scripts/awin-feed-status.mjs';

const csv = 'Advertiser ID,Advertiser Name,Feed ID,Feed Name,Last Imported,Last Checked,URL\n' +
  '90791,Stylevana,104951,old,2026-05-15 01:00:00,2026-10-18 03:00:00,https://x\n' +
  '90791,Stylevana,111294,AWIN US Product Feed,2026-10-17 21:10:00,2026-10-18 04:00:00,https://y\n';

test('finds the Stylevana feed row and its import/check times', () => {
  const s = parseFeedList(csv);
  assert.equal(s.lastImported, '2026-10-17 21:10:00');
  assert.equal(s.lastChecked, '2026-10-18 04:00:00');
  assert.throws(() => parseFeedList(csv, '999'), /not in feed list/);
  assert.throws(() => parseFeedList('a,b\n1,2\n'), /columns not found/);
});

test('feed list URL is derived from the download URL key without other hosts', () => {
  assert.equal(feedListUrl('https://productdata.awin.com/datafeed/download/apikey/abc123/language/en/fid/111294/columns/x/format/csv/'),
    'https://productdata.awin.com/datafeed/list/apikey/abc123');
  assert.throws(() => feedListUrl('https://evil.example/datafeed/download/apikey/abc/'), /Unexpected/);
});

test('downloads only when Awin imported a new version, unless forced or unknown', () => {
  assert.equal(decide({lastImported: 'A'}, 'A'), false);
  assert.equal(decide({lastImported: 'B'}, 'A'), true);
  assert.equal(decide({lastImported: 'A'}, 'A', true), true);
  assert.equal(decide({lastImported: null}, 'A'), true);
  assert.equal(decide({lastImported: 'A'}, undefined), true);
});

const {checkFeed, completeImport} = await import('../scripts/awin-feed-status.mjs');
const feedUrl = 'https://productdata.awin.com/datafeed/download/apikey/test/fid/111294/';
function ledger(previous = null) {
  const calls = [];
  return {calls, db: async (path, init) => {
    calls.push({path, init});
    if (!init) return previous ? [{last_imported: previous}] : [];
    return [{id: 42, ...JSON.parse(init.body)}];
  }};
}
test('a successful status check records pending, never successful collection', async () => {
  const {db, calls} = ledger('older');
  const result = await checkFeed({db, feedUrl, fetchImpl: async () => new Response(csv)});
  assert.equal(result.changed, true); assert.equal(result.checkId, '42');
  assert.match(calls[0].path, /import_status=eq.succeeded/);
  const recorded = JSON.parse(calls[1].init.body);
  assert.equal(recorded.downloaded, false); assert.equal(recorded.check_succeeded, true);
  assert.equal(recorded.import_status, 'pending');
});
test('unchanged upstream skips import but records a successful check independently', async () => {
  const {db, calls} = ledger('2026-10-17 21:10:00');
  assert.equal((await checkFeed({db, feedUrl, fetchImpl: async () => new Response(csv)})).changed, false);
  const row = JSON.parse(calls[1].init.body);
  assert.equal(row.import_status, 'skipped'); assert.equal(row.downloaded, false);
});
test('failed feed check still requests import without claiming a successful check', async () => {
  const {db, calls} = ledger();
  const result = await checkFeed({db, feedUrl, fetchImpl: async () => {throw Error('secret URL');}});
  assert.equal(result.changed, true); assert.equal(result.checkSucceeded, false);
  assert.equal(calls.length, 1); assert.equal(JSON.parse(calls[0].init.body).downloaded, false);
});
test('only final workflow success marks imported; failure remains eligible for the next retry', async () => {
  for (const succeeded of [true, false]) {
    const {db, calls} = ledger();
    const result = await completeImport({db, checkId: '42', succeeded, now: '2026-10-23T08:00:00Z'});
    assert.equal(result.importStatus, succeeded ? 'succeeded' : 'failed');
    assert.match(calls[0].path, /import_status=eq.pending/);
    assert.equal(JSON.parse(calls[0].init.body).downloaded, succeeded);
  }
  await assert.rejects(completeImport({db: async () => [], checkId: '42', succeeded: true}), /exactly once/);
  await assert.rejects(completeImport({db: () => assert.fail(), checkId: '42&x=1', succeeded: true}), /Invalid/);
});
test('missing migration or ledger write failure is visible, not a fake successful check', async () => {
  await assert.rejects(checkFeed({feedUrl, fetchImpl: async () => new Response(csv), db: async () => {throw Error('ledger unavailable');}}), /ledger unavailable/);
});
