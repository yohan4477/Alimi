// Checks the Awin feed list (same data-feed key as AWIN_FEED_URL) and decides whether the Stylevana feed
// changed since the last fully completed import. Writes `changed=true|false` to GITHUB_OUTPUT. Never prints the key.
import {appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {feedCheckStore} from './feed-check-store.mjs';
import {parseCsv} from './stylevana-feed.mjs';

const FEED_ID = '111294';
const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');

// Column names are matched loosely ("Feed ID", "Last Imported", "Last Checked") so header wording changes
// do not silently break the check.
export function parseFeedList(text, feedId = FEED_ID) {
  const rows = parseCsv(text);
  const keys = Object.keys(rows[0] ?? {});
  const col = want => keys.find(k => norm(k) === want) ?? keys.find(k => norm(k).includes(want));
  const idCol = col('feedid'), importedCol = col('lastimported'), checkedCol = col('lastchecked');
  if (!idCol || !importedCol) throw Error('Feed list columns not found: ' + keys.join(', '));
  const row = rows.find(r => String(r[idCol]).trim() === feedId);
  if (!row) throw Error('Feed ' + feedId + ' not in feed list');
  return {lastImported: row[importedCol] || null, lastChecked: checkedCol ? row[checkedCol] || null : null, columns: keys};
}

export function feedListUrl(feedUrl) {
  const u = new URL(feedUrl);
  const key = u.pathname.match(/\/apikey\/([^/]+)\//)?.[1];
  if (u.origin !== 'https://productdata.awin.com' || !key) throw Error('Unexpected feed endpoint');
  return `https://productdata.awin.com/datafeed/list/apikey/${key}`;
}

export function decide(current, previous, force = false) {
  if (force) return true;
  if (!current.lastImported || !previous) return true; // unknown → download (fail open)
  return current.lastImported !== previous;
}

// Record a check before downloading, but never claim a completed download/import here.
// Old rows have null outcomes and are intentionally not trusted as successful imports.
export async function checkFeed({feedUrl, db, fetchImpl = fetch, force = false} = {}) {
  let changed = true, checkSucceeded = false, status = {lastImported: null, lastChecked: null};
  try {
    const res = await fetchImpl(feedListUrl(feedUrl), {redirect: 'error', signal: AbortSignal.timeout(60000)});
    if (!res.ok) throw Error('Awin feed list unavailable');
    status = parseFeedList(await res.text());
    checkSucceeded = true;
  } catch { /* A failed check still attempts collection; no credential-bearing errors are logged. */ }
  if (checkSucceeded) {
    // An unavailable ledger must not suppress a retry. The following insert still verifies persistence.
    const previous = await db(`/rest/v1/feed_checks?select=last_imported&feed_id=eq.${FEED_ID}&import_status=eq.succeeded&last_imported=not.is.null&order=completed_at.desc&limit=1`).catch(() => null);
    changed = decide(status, previous?.[0]?.last_imported, force);
  }
  const rows = await db('/rest/v1/feed_checks', {method: 'POST', headers: {Prefer: 'return=representation'}, body: JSON.stringify({
    feed_id: FEED_ID, last_imported: status.lastImported, last_checked: status.lastChecked,
    check_succeeded: checkSucceeded, changed, downloaded: false, import_status: changed ? 'pending' : 'skipped'
  })});
  const id = String(rows?.[0]?.id ?? '');
  if (!/^\d+$/.test(id)) throw Error('Feed-check ledger did not return a check ID');
  return {...status, changed, checkSucceeded, checkId: id};
}

export async function completeImport({checkId, succeeded, db, now = new Date().toISOString()} = {}) {
  if (!/^\d+$/.test(String(checkId)) || typeof succeeded !== 'boolean') throw Error('Invalid import completion');
  const rows = await db(`/rest/v1/feed_checks?id=eq.${checkId}&feed_id=eq.${FEED_ID}&import_status=eq.pending`, {
    method: 'PATCH', headers: {Prefer: 'return=representation'}, body: JSON.stringify({
      downloaded: succeeded, import_status: succeeded ? 'succeeded' : 'failed', completed_at: now
    })
  });
  if (rows?.length !== 1) throw Error('Feed import completion was not recorded exactly once');
  return {checkId: String(checkId), importStatus: succeeded ? 'succeeded' : 'failed'};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const db = feedCheckStore();
    if (process.argv[2] === '--complete') {
      if (!['true', 'false'].includes(process.env.FEED_IMPORT_SUCCEEDED)) throw Error('Import outcome required');
      console.log(JSON.stringify(await completeImport({db, checkId: process.env.FEED_CHECK_ID, succeeded: process.env.FEED_IMPORT_SUCCEEDED === 'true'})));
    } else {
      const status = await checkFeed({db, feedUrl: process.env.AWIN_FEED_URL, force: process.env.FORCE_DOWNLOAD === 'true'});
      console.log(JSON.stringify(status));
      if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${status.changed}\ncheck_id=${status.checkId}\n`);
    }
  } catch { console.error('Feed-check bookkeeping failed; inspect credentials, migration and ledger availability. Details suppressed.'); process.exitCode = 1; }
}
