import {deeplink, searchPageUrl} from '../server/oliveyoung.js';

// GET /api/oliveyoung?q=<brand + product name>&ref=<post-12> → 302 to a Rakuten-tracked OLIVE YOUNG US search.
// IDs live in Vercel env so they can change without a client release. Without them the plain search page is
// used so the click still works (no commission); that fallback is never cached.
export function createOliveYoungHandler({env = process.env} = {}) {
  return (req, res) => {
    const params = new URL(req.url, 'http://local').searchParams;
    const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const ref = (params.get('ref') ?? '').replace(/[^\w-]/g, '').slice(0, 20);
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (req.method !== 'GET' || !q) { res.statusCode = 400; res.setHeader('Cache-Control', 'no-store'); return res.end(); }
    const url = searchPageUrl(q);
    const publisherId = env.RAKUTEN_PUBLISHER_ID?.trim(), mid = env.OLIVEYOUNG_US_MID?.trim();
    const link = publisherId && /^\d+$/.test(mid ?? '') ? deeplink(url, {publisherId, mid, u1: ref || undefined}) : null;
    res.statusCode = 302;
    res.setHeader('Location', link ?? url);
    res.setHeader('Cache-Control', link ? 'public, max-age=0, s-maxage=86400' : 'no-store');
    res.end();
  };
}

export default createOliveYoungHandler();
