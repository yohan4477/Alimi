// Called hourly by pg_cron. Dispatches the GitHub feed workflow, whose first step checks the Awin feed list
// and downloads only when Awin imported a new version. GitHub's own cron is best-effort (runs were skipped
// or ran 1h40m late), so the reliable clock lives here.
// Public endpoint on purpose (no secrets in the cron job): it refuses to dispatch more than once per 45 min
// after a successful dispatch, so extra calls are harmless. Every attempt is logged with GitHub's status.
const REPO = 'yohan4477/Alimi';
const WORKFLOW = 'stylevana-feed.yml';
const MIN_GAP_MS = 45 * 60 * 1000;

Deno.serve(async () => {
  const token = Deno.env.get('GITHUB_DISPATCH_TOKEN');
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!token) return Response.json({dispatched: false, reason: 'GITHUB_DISPATCH_TOKEN not set'}, {status: 500});

  const db = (path: string, init: RequestInit = {}) =>
    fetch(`${url}/rest/v1/${path}`, {...init, headers: {apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers}});

  // Rate-limit on successful dispatches only, so a failed call (bad token, GitHub outage) retries next hour.
  const last = await (await db('feed_ticks?select=dispatched_at&github_status=eq.204&order=dispatched_at.desc&limit=1')).json();
  if (last[0] && Date.now() - Date.parse(last[0].dispatched_at) < MIN_GAP_MS) {
    return Response.json({dispatched: false, reason: 'recently dispatched', last: last[0].dispatched_at});
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'alimi-feed-tick'},
    body: JSON.stringify({ref: 'main', inputs: {force: 'false'}})
  });
  // GitHub's error message (never contains the token) makes permission problems diagnosable.
  const detail = res.status === 204 ? null : ((await res.json().catch(() => null))?.message ?? null);
  await db('feed_ticks', {method: 'POST', headers: {Prefer: 'return=minimal'}, body: JSON.stringify({github_status: res.status})});
  return Response.json({dispatched: res.status === 204, github_status: res.status, detail}, {status: res.status === 204 ? 200 : 502});
});
