// Existing public-domain portraits and current game scenarios; no new generated art.
export const GAME_ENTRANCE_INTERVAL = 5000;
export const GAME_ENTRANCE_SLIDES = Object.freeze([
  {
    "id": "mona",
    "ko": "500년 만의 소개팅. 오늘 립은 네가 골라줘.",
    "en": "A date after 500 years. Pick her lip look."
  },
  {
    "id": "pearl",
    "ko": "귀걸이는 완벽한데. 수업 끝나니 베이스가 들떠.",
    "en": "The earrings are perfect. Her base? Not after class."
  },
  {
    "id": "venus",
    "ko": "바람이 만든 헤어. 30분 뒤 약속인데?",
    "en": "Wind-styled hair. A date in 30 minutes?"
  },
  {
    "id": "madame",
    "ko": "약속까지 5분. 딱 하나만 쓴다면?",
    "en": "Five minutes to go. You can only use one."
  },
  {
    "id": "camille",
    "ko": "양산만 믿고 나가기엔 피크닉이 너무 길어.",
    "en": "A long picnic ahead. More than a parasol."
  },
  {
    "id": "ophelia",
    "ko": "꽃밭 사진은 건졌어. 당기는 볼은 어떡하지?",
    "en": "The garden photos? Done. Now her cheeks feel tight."
  }
].map(Object.freeze));
const mounts = new WeakMap();
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function gameEntranceHref(id, lang='ko') {
  const slide = GAME_ENTRANCE_SLIDES.find(slide => slide.id === id) || GAME_ENTRANCE_SLIDES[0];
  return '/beauty-play/?pilot=1&character=' + slide.id + '&lang=' + (lang === 'en' ? 'en' : 'ko');
}
export function gameEntranceMarkup(lang='ko') {
  const language = lang === 'en' ? 'en' : 'ko', slide = GAME_ENTRANCE_SLIDES[0];
  const resume = language === 'ko' ? '진행 중인 게임이 있으면 이어서 진행해요.' : 'An existing game resumes where you left off.';
  return `<a class="home-game-entry" data-game-entrance data-character="${slide.id}" href="${escape(gameEntranceHref(slide.id, language))}" title="${escape(resume)}"><img src="/beauty-play/assets/art-${slide.id}.webp" alt="" width="78" height="94"><span><small>${language === 'ko' ? '언니가 골라줘' : 'Let Me Pick'}</small><strong data-game-entrance-text>${escape(slide[language])}</strong></span><span class="home-game-arrow" aria-hidden="true">→</span></a>`;
}
export function mountGameEntranceCarousel(anchor, options={}) {
  if (!anchor) return () => {};
  mounts.get(anchor)?.();
  const doc = options.document || globalThis.document, win = options.window || globalThis.window;
  const interval = options.setInterval || win.setInterval.bind(win), clear = options.clearInterval || win.clearInterval.bind(win);
  const lang = options.lang === 'en' ? 'en' : 'ko';
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let timer = null, index = 0, disposed = false;
  let hovered = anchor.matches?.(':hover') === true, focused = anchor.contains(doc.activeElement);
  const image = anchor.querySelector('img'), label = anchor.querySelector('[data-game-entrance-text]');
  const paused = () => doc.hidden || media?.matches || hovered || focused;
  function render() {
    const slide = GAME_ENTRANCE_SLIDES[index];
    anchor.dataset.character = slide.id;
    anchor.href = gameEntranceHref(slide.id, lang);
    if (image) image.src = '/beauty-play/assets/art-' + slide.id + '.webp';
    if (label) label.textContent = slide[lang];
  }
  function stop() { if (timer !== null) clear(timer); timer = null; }
  function tick() {
    if (!anchor.isConnected) { cleanup(); return; }
    if (paused() || anchor.closest?.('[hidden]') || (anchor.getClientRects && !anchor.getClientRects().length)) return;
    index = (index + 1) % GAME_ENTRANCE_SLIDES.length;
    render();
  }
  function update() { stop(); if (!disposed && !paused()) timer = interval(tick, GAME_ENTRANCE_INTERVAL); }
  const enter = () => { hovered = true; update(); }, leave = () => { hovered = false; update(); };
  const focus = () => { focused = true; update(); }, blur = event => { focused = anchor.contains(event.relatedTarget); update(); };
  const listeners = [[anchor,'mouseenter',enter],[anchor,'mouseleave',leave],[anchor,'focusin',focus],[anchor,'focusout',blur],[doc,'visibilitychange',update]];
  for (const [target,event,handler] of listeners) target.addEventListener(event,handler);
  if (media?.addEventListener) media.addEventListener('change',update); else media?.addListener?.(update);
  function cleanup() {
    if (disposed) return;
    disposed = true; stop();
    for (const [target,event,handler] of listeners) target.removeEventListener(event,handler);
    if (media?.removeEventListener) media.removeEventListener('change',update); else media?.removeListener?.(update);
    if (mounts.get(anchor) === cleanup) mounts.delete(anchor);
  }
  mounts.set(anchor,cleanup); render(); update();
  return cleanup;
}
