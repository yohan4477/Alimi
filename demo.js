// Demo data for the GitHub Pages preview only: community reads and every write stay in this tab's memory,
// so nothing reaches the production database. Catalog, brands and rooms still come from the real API.
(() => {
  const BASE = 'https://mqsnshnlfwsgabrsmqsz.supabase.co';
  const KEY = 'sb_publishable_CJjQ-l5ev-D4OH0Na0gFoQ_szunygff';
  const realFetch = window.fetch.bind(window);
  const ago = m => new Date(Date.now() - m * 60000).toISOString();
  const json = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

  const FAMILIES = {
    toner: 'anua|heartleaf 77 soothing toner', oil: 'anua|heartleaf pore control cleansing oil', cosrx: 'cosrx|ac collection calming foam cleanser renewal',
    skin1004: 'skin1004|madagascar centella tone brightening capsule ampoule', balm: 'beauty of joseon|radiance cleansing balm',
    soybean: 'round lab|soybean panthenol ampoule', sun: 'anua|heartleaf silky moisture sun cream spf50 pa', cream: 'anua|3 ceramide panthenol moisture barrier cream'};
  const itemsReady = realFetch(BASE + '/rest/v1/catalog_items?' + new URLSearchParams({
    select: 'retailer,market,sku,brand,brand_ko,name,price_minor,image_url,family_key',
    family_key: 'in.(' + Object.values(FAMILIES).map(f => '"' + f + '"').join(',') + ')', order: 'price_minor.desc'}), {headers: {apikey: KEY}})
    .then(r => r.ok ? r.json() : []).catch(() => []).then(rows => {
      const by = {};
      for (const [k, f] of Object.entries(FAMILIES)) by[k] = rows.find(r => r.family_key === f) ?? null;
      return by;
    });

  const people = ['Calm Otter', 'Dewy Panda', 'Soft Seal', 'Glow Fox', 'Mellow Koala', 'Bright Finch', 'Quiet Lynx', 'Sunny Heron'];
  const who = i => ({author_tag: 'demo' + i, nickname: people[i]});
  const db = {posts: [], comments: [], messages: [], members: [], nextId: 1000};

  const seed = itemsReady.then(I => {
    const post = (id, room, i, kind, title, body, item, mins, extra = {}) =>
      ({id, room_id: room, ...who(i), kind, title, body, item: item ?? null, reasons: [], comments: 0, likes: 0, created_at: ago(mins), last_activity_at: ago(mins),
        used_for: null, skin_type: null, skin_tone: null, undertone: null, climate: null, goal: null, photos: [], bought_where: null, bought_price_minor: null,
        bought_currency: null, ship_country: null, ship_days: null, sponsored: false, ...extra});
    db.posts = [
      post(1, 'acne', 0, 'question', 'Gentle cleanser for oily, acne-prone skin?', 'My skin gets tight after foaming cleansers but I still break out on my chin. Anything gentle that still feels clean?', null, 35, {likes: 4, reasons: ['skin_type']}),
      post(2, 'acne', 3, 'review', 'Three weeks with the COSRX AC calming foam', 'Low foam, no tight feeling. Breakouts calmed a bit but I also changed my pillowcase routine, so hard to say it was only this.', I.cosrx, 180,
        {likes: 9, reasons: ['texture', 'skin_type'], used_for: 'weeks', skin_type: 'oily', skin_tone: 'medium', undertone: 'warm', climate: 'humid', goal: 'calm breakouts', bought_where: 'Stylevana', bought_price_minor: 1050, bought_currency: 'USD', ship_country: 'US', ship_days: 8}),
      post(3, 'dry-sensitive', 1, 'recommend', 'Barrier cream that actually helped my winter flakes', 'Thick but sinks in after a few minutes. I use a small amount at night only.', I.cream, 300, {likes: 6, reasons: ['texture', 'ingredients']}),
      post(4, 'dry-sensitive', 4, 'question', '건조한데 붉어지는 피부, 토너 추천해 주세요', '알코올 들어간 토너는 따가워서 못 써요. 순한 토너 뭐 쓰세요?', null, 90, {likes: 2}),
      post(5, 'sunscreen', 5, 'review', 'No white cast on deep skin', 'Finally a sunscreen that does not leave a gray cast on me. Slightly dewy finish, fine under makeup.', I.sun, 600,
        {likes: 14, reasons: ['texture', 'color'], used_for: 'months', skin_type: 'combination', skin_tone: 'deep', undertone: 'neutral', climate: 'humid', bought_where: 'Stylevana', bought_price_minor: 1530, bought_currency: 'USD', ship_country: 'GB', ship_days: 11}),
      post(6, 'sunscreen', 2, 'question', 'Reapplying over makeup — what do you use?', 'Office job, near a window all day. Stick, cushion or mist?', null, 1440, {likes: 3}),
      post(7, 'new-to-kbeauty', 6, 'question', 'First K-beauty routine under $50?', 'Total beginner. Normal skin, a bit dull. Where do I start?', null, 60, {likes: 5, reasons: ['price']}),
      post(8, 'routine', 7, 'recommend', 'Double cleanse combo that works for me', 'Cleansing balm first, then a low-pH gel. Takes off sunscreen without stripping.', I.balm, 2000, {likes: 7, reasons: ['texture']}),
      post(9, 'korea-shopping', 0, 'question', 'Going to Seoul next month — Olive Young or duty free?', 'Mostly skincare, some makeup. Is the tax refund worth the hassle?', null, 240, {likes: 8}),
      post(10, 'brand-anua', 3, 'review', 'Heartleaf toner after two months', 'Very watery, almost like nothing. Redness around my nose is less obvious. Smell is mild and herbal.', I.toner, 4000,
        {likes: 11, reasons: ['skin_type', 'scent'], used_for: 'months', skin_type: 'sensitive', skin_tone: 'fair', undertone: 'cool', climate: 'dry', bought_where: 'Stylevana', bought_price_minor: 1785, bought_currency: 'USD', ship_country: 'CA', ship_days: 12}),
      post(11, 'everyone', 4, 'recommend', 'Underrated ampoule for dark spots', 'Takes patience. I saw a difference after about six weeks, used with sunscreen every day.', I.skin1004, 800, {likes: 5, reasons: ['ingredients']}),
    ];
    const comment = (post_id, i, body, item, mins, likes = 0) => ({id: db.nextId++, post_id, ...who(i), body, item: item ?? null, likes, created_at: ago(mins)});
    db.comments = [
      comment(1, 2, 'Try the COSRX AC calming foam. Low pH and not drying for me.', I.cosrx, 30, 3),
      comment(1, 5, 'Cleansing oil at night helped my chin congestion more than switching foam.', I.oil, 25, 1),
      comment(1, 0, 'Thanks! Is the oil okay for acne-prone skin?', null, 20),
      comment(1, 5, 'For me yes, as long as I emulsify well and rinse for a while.', null, 15, 2),
      comment(4, 1, '아누아 어성초 토너 순해요. 화장솜 말고 손으로 두드려 쓰세요.', I.toner, 70, 2),
      comment(4, 6, '라운드랩 콩 앰플도 진정에 괜찮았어요.', I.soybean, 50),
      comment(6, 7, 'Cushion with SPF on top, then a mist at lunch.', null, 1300),
      comment(7, 3, 'Cleanser + toner + moisturizer + sunscreen. Add an ampoule later.', null, 50, 4),
      comment(7, 1, 'This sunscreen is a good first pick, very light.', I.sun, 40, 2),
      comment(9, 2, 'Olive Young for variety. Tax refund is done at the counter if you spend enough.', null, 200, 3),
      comment(3, 4, 'Does it pill under sunscreen?', null, 250),
      comment(3, 1, 'A little if I use too much. Thin layer is fine.', null, 240),
    ];
    for (const p of db.posts) {
      const cs = db.comments.filter(c => c.post_id === p.id);
      p.comments = cs.length;
      if (cs.length) p.last_activity_at = cs.at(-1).created_at;
    }
    const msg = (room, i, body, item, mins, likes = 0) => ({id: db.nextId++, room_id: room, ...who(i), body, item: item ?? null, reply_to: null, likes, created_at: ago(mins)});
    db.messages = [
      msg('everyone', 0, 'Hi all! Anyone else waiting for the autumn sales?', null, 120),
      msg('everyone', 2, 'Yes, stocking up on sunscreen before winter.', null, 110, 1),
      msg('everyone', 5, 'This one is on my list', I.sun, 100, 2),
      msg('everyone', 6, 'First time here — what does everyone use for dry lips?', null, 12),
      msg('acne', 3, 'Anyone tried the AC calming foam?', null, 45),
      msg('acne', 1, 'Yes! Pretty gentle', I.cosrx, 40, 1),
      msg('acne', 7, 'Patches overnight are my lifesaver', null, 8),
      msg('sunscreen', 5, 'Deep skin tone friends: no cast with this one', I.sun, 300, 3),
      msg('sunscreen', 2, 'Saving this, thanks', null, 290),
      msg('korea-shopping', 4, 'Myeongdong or Hongdae Olive Young — which is less crowded?', null, 25),
      msg('korea-shopping', 0, 'Hongdae on weekday mornings was okay for me', null, 20, 1),
      msg('brand-anua', 6, 'Heartleaf oil vs Beauty of Joseon balm?', I.oil, 70),
      msg('brand-anua', 3, 'Oil rinses cleaner, balm feels richer', I.balm, 65, 2),
    ];
  });

  const tagOf = async secret => {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  };
  const itemBySku = async (sku, retailer, market) => {
    if (!sku) return null;
    const rows = await realFetch(BASE + '/rest/v1/catalog_items?' + new URLSearchParams({select: 'retailer,market,sku,brand,brand_ko,name,price_minor,image_url,family_key',
      sku: 'eq.' + sku, retailer: 'eq.' + retailer, market: 'eq.' + market}), {headers: {apikey: KEY}}).then(r => r.json()).catch(() => []);
    return rows[0] ?? null;
  };
  // Minimal PostgREST filtering: eq / gt / in, order, limit, offset.
  function query(rows, q) {
    for (const [k, v] of q) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      const [op, ...rest] = v.split('.'), val = rest.join('.');
      if (op === 'eq') rows = rows.filter(r => String(r[k]) === val);
      else if (op === 'gt') rows = rows.filter(r => r[k] > Number(val));
      else if (op === 'in') { const set = val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')); rows = rows.filter(r => set.includes(String(r[k]))); }
    }
    const order = q.get('order');
    if (order) { const [f, dir] = order.split('.'); rows = [...rows].sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
    const off = Number(q.get('offset') ?? 0), lim = q.get('limit');
    return rows.slice(off, lim ? off + Number(lim) : undefined);
  }
  function mentions() {
    const out = [];
    for (const p of db.posts) if (p.item) out.push({source: p.kind === 'review' ? 'review' : 'post', source_id: p.id, post_id: p.id, room_id: p.room_id, created_at: p.created_at, family_key: p.item.family_key});
    for (const c of db.comments) if (c.item) out.push({source: 'comment', source_id: c.id, post_id: c.post_id, room_id: null, created_at: c.created_at, family_key: c.item.family_key});
    for (const m of db.messages) if (m.item) out.push({source: 'chat', source_id: m.id, post_id: null, room_id: m.room_id, created_at: m.created_at, family_key: m.item.family_key});
    return out;
  }

  async function rpcCall(name, b) {
    await seed;
    const me = b.p_secret ? {author_tag: await tagOf(b.p_secret), nickname: 'You (demo)'} : {};
    switch (name) {
      case 'join_chat': if (!db.members.some(m => m.room_id === b.p_room)) db.members.unshift({room_id: b.p_room, author_tag: me.author_tag, joined_at: ago(0)}); return json(me.nickname);
      case 'post_chat': { const m = {id: db.nextId++, room_id: b.p_room, ...me, body: b.p_body ?? '', item: await itemBySku(b.p_sku, b.p_retailer, b.p_market), reply_to: b.p_reply_to ?? null, likes: 0, created_at: ago(0)}; db.messages.push(m); return json(m); }
      case 'create_post': { const p = {id: db.nextId++, room_id: b.p_room, ...me, kind: b.p_kind, title: b.p_title, body: b.p_body, item: await itemBySku(b.p_sku, b.p_retailer, b.p_market), reasons: b.p_reasons ?? [],
        comments: 0, likes: 0, created_at: ago(0), last_activity_at: ago(0), photos: [], sponsored: false, ...(b.p_review ?? {}), photos: []}; db.posts.unshift(p); return json(p); }
      case 'add_comment': { const c = {id: db.nextId++, post_id: b.p_post, ...me, body: b.p_body, item: await itemBySku(b.p_sku, b.p_retailer, b.p_market), likes: 0, created_at: ago(0)}; db.comments.push(c);
        const p = db.posts.find(x => x.id === b.p_post); if (p) { p.comments++; p.last_activity_at = c.created_at; } return json(c); }
      case 'like_chat': { const m = db.messages.find(x => x.id === b.p_message); if (m) m.likes++; return json(m?.likes ?? 0); }
      case 'like_community': { const list = b.p_target === 'comment' ? db.comments : db.posts, r = list.find(x => x.id === b.p_id); if (r) r.likes++; return json(r?.likes ?? 0); }
      default: return json(null, 204);
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith(BASE)) return realFetch(input, init);
    const u = new URL(url), path = u.pathname;
    if (path.startsWith('/storage/v1/object/') && (init.method ?? 'GET') === 'POST') return json({Key: path});
    if (path.startsWith('/rest/v1/rpc/')) return rpcCall(path.slice(13), init.body ? JSON.parse(init.body) : {});
    const table = path.slice('/rest/v1/'.length), q = u.searchParams;
    if (table === 'app_events') return json(null, 204);
    if (['community_posts', 'community_comments', 'chat_messages', 'product_mentions', 'chat_members'].includes(table)) {
      await seed;
      const rows = {community_posts: db.posts, community_comments: db.comments, chat_messages: db.messages, product_mentions: mentions(), chat_members: db.members}[table];
      return json(query(rows, q));
    }
    if (table === 'chat_room_list') {
      await seed;
      const rooms = await realFetch(input, init).then(r => r.json());
      return json(rooms.map(r => {
        const ms = db.messages.filter(m => m.room_id === r.id);
        return {...r, members: r.members + new Set(ms.map(m => m.author_tag)).size, messages_24h: ms.length, last_message_at: ms.at(-1)?.created_at ?? r.last_message_at};
      }));
    }
    return realFetch(input, init);
  };

  addEventListener('DOMContentLoaded', () => {
    const tag = document.createElement('div');
    tag.textContent = 'DEMO · sample posts, not real reviews';
    tag.style.cssText = 'position:fixed;bottom:62px;white-space:nowrap;left:50%;transform:translateX(-50%);z-index:9999;background:#222;color:#fff;font:600 11px/1 system-ui;padding:5px 10px;border-radius:99px;opacity:.85;pointer-events:none';
    document.body.append(tag);
  });
})();
