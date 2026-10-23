import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessFreshness, zonedTime, readFeedHealth} from '../scripts/feed-freshness.mjs';
const now = '2026-10-23T08:00:00Z';
const imported = {checked_at: '2026-10-18T08:00:00Z', completed_at: '2026-10-18T08:02:00Z', last_imported: '2026-10-18T07:00:00Z', import_status: 'succeeded'};
const check = {checked_at: '2026-10-23T07:30:00Z', check_succeeded: true, import_status: 'skipped', last_imported: imported.last_imported};
const state = {latestCheck: check, successfulCheck: check, successfulImport: imported, latestAttempt: imported};
test('unchanged old upstream with recent checks is not a stopped-collector alarm', () => {
  const result = assessFreshness(state, now);
  assert.equal(result.healthy, true); assert.equal(result.imported.status, 'healthy');
  assert.equal(result.upstream.status, 'old'); assert.equal(result.imported.ageHours > 36, true);
});
test('unqualified upstream time zone stays unknown rather than becoming fabricated UTC freshness', () => {
  assert.equal(zonedTime('2026-10-23 07:00:00'), null);
  const c = {...check, last_imported: '2026-10-18 07:00:00'};
  const result = assessFreshness({...state, successfulCheck: c, successfulImport: {...imported, last_imported: c.last_imported}}, now);
  assert.equal(result.healthy, true); assert.equal(result.upstream.status, 'unknown');
});
test('failed, stalled and newer not-imported versions report real import problems', () => {
  for (const [attempt, expected] of [
    [{...check, import_status: 'failed'}, 'failed'],
    [{...check, checked_at: '2026-10-23T05:00:00Z', import_status: 'pending'}, 'stalled'],
    [{...check, import_status: 'pending'}, 'pending']
  ]) assert.equal(assessFreshness({...state, latestAttempt: attempt}, now).imported.status, expected);
  const result = assessFreshness({...state, successfulCheck: {...check, last_imported: 'new-version'}}, now);
  assert.equal(result.imported.status, 'version_not_imported'); assert.equal(result.healthy, false);
});
test('missing, stale, future and failed checks do not look healthy', () => {
  assert.equal(assessFreshness({}, now).healthy, false);
  for (const [checked_at, expected] of [['2026-10-22T01:00:00Z', 'stale'], ['2026-10-24T01:00:00Z', 'future']])
    assert.equal(assessFreshness({...state, successfulCheck: {...check, checked_at}}, now).check.status, expected);
  assert.equal(assessFreshness({...state, latestCheck: {...check, check_succeeded: false}}, now).check.status, 'failed');
});
test('health queries use separate latest outcomes, never a capped recent-history sample or old downloaded flags', async () => {
  const paths = [];
  await readFeedHealth(async path => {paths.push(path); return [];});
  assert.equal(paths.length, 4);
  assert.ok(paths.some(p => p.includes('import_status=eq.succeeded&order=completed_at.desc')));
  assert.ok(paths.every(p => p.endsWith('&limit=1') && !p.includes('downloaded=')));
});
test('existing workflow finalizes every attempted import only after all required steps', async () => {
  const workflow = await readFile(new URL('../.github/workflows/stylevana-feed.yml', import.meta.url), 'utf8');
  assert.match(workflow, /if: always\(\) && steps.status.outputs.changed == 'true'/);
  for (const name of ['import', 'tests', 'snapshot', 'observation', 'catalog']) assert.ok(workflow.includes(`steps.${name}.outcome == 'success'`));
  assert.ok(workflow.indexOf('node scripts/awin-feed-status.mjs --complete') > workflow.indexOf('node scripts/stylevana-catalog.mjs'));
  assert.ok(!workflow.includes('issues: write'));
});
