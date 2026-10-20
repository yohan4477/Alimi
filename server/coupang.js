import {createHmac} from 'node:crypto';

// Coupang Partners Open API: turns a Coupang page URL into a tracked affiliate link.
const HOST = 'https://api-gateway.coupang.com';
export const DEEPLINK_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

export const searchPageUrl = q => 'https://www.coupang.com/np/search?' + new URLSearchParams({component: '', q, channel: 'user'});

// CEA HMAC as documented by Coupang: sign "yyMMddTHHmmssZ" + method + path + query (no "?").
export function authorization({accessKey, secretKey, method, path, query = '', now = new Date()}) {
  const d = now.toISOString();
  const signedDate = d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10) + 'T' + d.slice(11, 13) + d.slice(14, 16) + d.slice(17, 19) + 'Z';
  const signature = createHmac('sha256', secretKey).update(signedDate + method + path + query).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

// Returns the short affiliate URL, or null when the API refuses or is unreachable.
export async function deeplink(url, {accessKey, secretKey, subId, fetchImpl = fetch, now}) {
  const body = {coupangUrls: [url]};
  if (subId) body.subId = subId;
  const res = await fetchImpl(HOST + DEEPLINK_PATH, {
    method: 'POST',
    headers: {'Content-Type': 'application/json;charset=UTF-8', Authorization: authorization({accessKey, secretKey, method: 'POST', path: DEEPLINK_PATH, now})},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const link = json?.rCode === '0' ? json.data?.[0]?.shortenUrl : null;
  return typeof link === 'string' && /^https:\/\/link\.coupang\.com\//.test(link) ? link : null;
}
