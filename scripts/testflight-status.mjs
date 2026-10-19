// Read-only App Store Connect status. Credentials stay in the Actions runner.
import { sign } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const env = process.env;
function required(name) {
  if (!env[name]) throw new Error(`Missing configuration: ${name}`);
  return env[name];
}
const keyId = required('APP_STORE_CONNECT_KEY_ID');
const issuer = required('APP_STORE_CONNECT_ISSUER_ID');
const key = required('APP_STORE_CONNECT_API_KEY_P8');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const message = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({ iss: issuer, iat: now - 10, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
  return `${message}.${sign('sha256', Buffer.from(message), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function get(path, params = {}) {
  const url = new URL(`https://api.appstoreconnect.apple.com/v1/${path}`);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error(`Apple API HTTP ${response.status} (${path.split('/')[0]}). Check API key permissions/configuration; browser login is not required.`);
  return response.json();
}
function report(text) {
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
}
try {
  const apps = await get('apps', { 'filter[bundleId]': env.IOS_BUNDLE_ID || 'com.yohan4477.seoulbeauty', 'fields[apps]': 'name,bundleId' });
  if (apps.data.length !== 1) throw new Error('Expected exactly one matching SeoulBeauty app.');
  const app = apps.data[0];
  const version = env.TARGET_BUILD || '';
  const params = { 'filter[app]': app.id, sort: '-uploadedDate', limit: '5' };
  if (version) params['filter[version]'] = version;
  // Poll only the exact build produced by an upload; snapshots never wait.
  const deadline = Date.now() + (version && env.WAIT_FOR_PROCESSING === 'true' ? 12 * 60 * 1000 : 0);
  let builds;
  do {
    builds = (await get('builds', params)).data;
    if (builds.length && builds.every(b => b.attributes.processingState !== 'PROCESSING')) break;
    if (Date.now() >= deadline) break;
    console.log('Waiting for Apple to process the uploaded build...');
    await new Promise(resolve => setTimeout(resolve, 30000));
  } while (true);
  report(`## SeoulBeauty TestFlight status\n\nChecked: ${new Date().toISOString()}\n`);
  if (!builds.length) {
    report(`Build ${version || '(latest)'} is not visible in Apple's API yet. Upload success does not prove testing availability.`);
  } else {
    report('| Build | Apple processing | Internal testing | External testing | Expired |\n|---|---|---|---|---|');
    for (const build of builds) {
      const a = build.attributes;
      const detail = await get(`builds/${encodeURIComponent(build.id)}/buildBetaDetail`);
      const d = detail.data?.attributes || {};
      report(`| ${a.version} | ${a.processingState} | ${d.internalBuildState || 'UNKNOWN'} | ${d.externalBuildState || 'UNKNOWN'} | ${a.expired ? 'Yes' : 'No'} |`);
    }
    report('\nIN_BETA_TESTING = Apple reports testing active. READY_FOR_BETA_TESTING = ready, not confirmation of tester access. Individual invitations and device installation are not verified by this report.');
    if (builds.some(b => ['FAILED', 'INVALID'].includes(b.attributes.processingState))) process.exitCode = 1;
  }
} catch (error) {
  // Never print raw request headers, tokens, private keys, or API responses.
  report(`TestFlight status check failed: ${error.message}`);
  process.exitCode = 1;
}
