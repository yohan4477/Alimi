// Checks the Awin feed list (same data-feed key as AWIN_FEED_URL) and decides whether the Stylevana feed
// changed since the last download. Writes `changed=true|false` to GITHUB_OUTPUT. Never prints the key.
import {appendFile} from 'node:fs/promises';
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

async function supabase(path, init = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(new URL(path, url), {...init, headers: {apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...init.headers}, signal: AbortSignal.timeout(20000)});
  if (!res.ok) throw Error('Supabase HTTP ' + res.status);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

if (process.argv[1]?.endsWith('awin-feed-status.mjs')) {
  const force = process.env.FORCE_DOWNLOAD === 'true';
  let changed = true, status = {lastImported: null, lastChecked: null};
  try {
    const res = await fetch(feedListUrl(process.env.AWIN_FEED_URL), {redirect: 'error', signal: AbortSignal.timeout(60000)});
    if (!res.ok) throw Error('Awin feed list HTTP ' + res.status);
    status = parseFeedList(await res.text());
    console.log('feed list columns:', status.columns.join(', '));
    const prev = await supabase(`/rest/v1/feed_checks?select=last_imported&feed_id=eq.${FEED_ID}&downloaded=eq.true&order=checked_at.desc&limit=1`).catch(() => null);
    changed = decide(status, prev?.[0]?.last_imported, force);
  } catch (e) {
    console.log('Feed status check failed, downloading anyway: ' + (e.message.includes('apikey') ? 'details suppressed' : e.message));
  }
  await supabase('/rest/v1/feed_checks', {method: 'POST', headers: {Prefer: 'return=minimal'},
    body: JSON.stringify({feed_id: FEED_ID, last_imported: status.lastImported, last_checked: status.lastChecked, changed, downloaded: changed})}).catch(e => console.log('feed_checks insert failed: ' + e.message));
  console.log(JSON.stringify({lastImported: status.lastImported, lastChecked: status.lastChecked, changed, force}));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}
