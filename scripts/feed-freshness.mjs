import {appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {feedCheckStore} from './feed-check-store.mjs';

const HOUR = 3600000;
// Do not silently interpret an upstream timestamp with an unspecified time zone as UTC.
export function zonedTime(value) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
export function assessFreshness({latestCheck, successfulCheck, successfulImport, latestAttempt}, now = new Date().toISOString(), {maxCheckAgeHours = 8, maxPendingHours = 1, maxUpstreamAgeHours = 72} = {}) {
  const current = zonedTime(now);
  if (current == null || ![maxCheckAgeHours, maxPendingHours, maxUpstreamAgeHours].every(n => Number.isFinite(n) && n > 0)) throw Error('Invalid freshness context');
  const age = value => { const time = zonedTime(value); return time == null ? null : (current - time) / HOUR; };
  const checkAge = age(successfulCheck?.checked_at), importAge = age(successfulImport?.completed_at);
  const check = {status: checkAge == null ? 'unknown' : checkAge < -0.1 ? 'future' : checkAge > maxCheckAgeHours ? 'stale' : latestCheck?.check_succeeded === false ? 'failed' : 'healthy', ageHours: checkAge};
  const imported = {status: successfulImport?.import_status === 'succeeded' && importAge != null && importAge >= -0.1 ? 'healthy' : 'unknown', ageHours: importAge};
  const attemptIsNewer = latestAttempt && (!successfulImport || Date.parse(latestAttempt.checked_at) > Date.parse(successfulImport.checked_at));
  if (attemptIsNewer && latestAttempt.import_status === 'failed') imported.status = 'failed';
  else if (attemptIsNewer && latestAttempt.import_status === 'pending') imported.status = age(latestAttempt.checked_at) > maxPendingHours ? 'stalled' : 'pending';
  else if (successfulCheck?.last_imported && successfulCheck.last_imported !== successfulImport?.last_imported) imported.status = 'version_not_imported';
  // A feed can be unchanged for days while hourly checks and imports are healthy. Upstream age is
  // reported separately and is advisory, not evidence the collector stopped running.
  const sourceAge = age(successfulCheck?.last_imported);
  const upstream = {status: sourceAge == null ? 'unknown' : sourceAge < -0.1 ? 'future' : sourceAge > maxUpstreamAgeHours ? 'old' : 'recent', ageHours: sourceAge, timestamp: successfulCheck?.last_imported ?? null};
  if (sourceAge == null) upstream.reason = 'Source timestamp missing or its time zone is unspecified';
  return {healthy: check.status === 'healthy' && imported.status === 'healthy', check, imported, upstream};
}
export async function readFeedHealth(db) {
  const read = async filter => (await db('/rest/v1/feed_checks?select=checked_at,last_imported,check_succeeded,import_status,completed_at&feed_id=eq.111294&' + filter + '&limit=1'))?.[0] ?? null;
  const [latestCheck, successfulCheck, successfulImport, latestAttempt] = await Promise.all([
    read('check_succeeded=not.is.null&order=checked_at.desc'),
    read('check_succeeded=eq.true&order=checked_at.desc'),
    read('import_status=eq.succeeded&order=completed_at.desc'),
    read('import_status=in.(pending,failed,succeeded)&order=checked_at.desc')
  ]);
  return {latestCheck, successfulCheck, successfulImport, latestAttempt};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = assessFreshness(await readFeedHealth(feedCheckStore()));
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `\nFeed health: checks **${result.check.status}**, imports **${result.imported.status}**, upstream age **${result.upstream.status}** (independent, not a collector-failure claim).\n`);
    if (!result.healthy) process.exitCode = 1;
  } catch { console.error('Feed health unavailable; inspect the server-only ledger and migration.'); process.exitCode = 1; }
}
