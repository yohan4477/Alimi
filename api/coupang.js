import {deeplink, searchPageUrl} from '../server/coupang.js';

// GET /api/coupang?q=<brand + product name>&ref=<post-12> → 302 to a Coupang Partners search link.
// Keys stay on the server. Without keys, or when Coupang refuses, the plain search page is used so the
// click still works (no commission); that fallback is never cached.
export function createCoupangHandler({env = process.env, fetchImpl = fetch} = {}) {
  return async (req, res) => {
    const params = new URL(req.url, 'http://local').searchParams;
    const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const ref = (params.get('ref') ?? '').replace(/[^\w-]/g, '').slice(0, 20);
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (req.method !== 'GET' || !q) { res.statusCode = 400; res.setHeader('Cache-Control', 'no-store'); return res.end(); }
    const url = searchPageUrl(q);
    let link = null;
    if (env.COUPANG_ACCESS_KEY && env.COUPANG_SECRET_KEY) {
      const keys = {accessKey: env.COUPANG_ACCESS_KEY, secretKey: env.COUPANG_SECRET_KEY, fetchImpl};
      try {
        link = await deeplink(url, {...keys, subId: ref || undefined});
        // subId rules are partner-account specific; keep the commission even if the ref is rejected.
        if (!link && ref) link = await deeplink(url, keys);
      } catch { link = null; }
    }
    res.statusCode = 302;
    res.setHeader('Location', link ?? url);
    res.setHeader('Cache-Control', link ? 'public, max-age=0, s-maxage=86400' : 'no-store');
    res.end();
  };
}

export default createCoupangHandler();
