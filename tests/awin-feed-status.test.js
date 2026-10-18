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
