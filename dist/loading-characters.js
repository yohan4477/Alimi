// Shared delayed loader for meaningful page/network waits only.
// Character changes are decorative: retain the existing localized loading status.
// The 5×2, 36×54 source sprite is rendered as 48×72 CSS pixels.
// A separate helper instance lives only until its own async request settles.
export const PIXEL_CHARACTER_COUNT = 10;
export const PIXEL_LOADING_DELAY_MS = 400;
export const PIXEL_ROTATION_MS = 1700;
let cursor = 0;

export const pixelFramePosition = index => ({
  x: -(index % 5) * 48,
  y: -Math.floor(index / 5) * 72,
});

export function beginPixelLoading(container, {
  delayMs = PIXEL_LOADING_DELAY_MS,
  rotateMs = PIXEL_ROTATION_MS,
  clock = globalThis,
  doc = globalThis.document,
  reducedMotion = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
} = {}) {
  if (!container || !doc?.createElement || !clock?.setTimeout || !clock?.clearTimeout) return () => {};
  let cancelled = false, timer, interval, holder, sprite;
  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    clock.clearTimeout(timer);
    if (interval != null) clock.clearInterval(interval);
    holder?.remove();
  };
  const paint = () => {
    if (!container.isConnected || (doc.visibilityState === 'hidden')) {
      if (!container.isConnected) stop();
      return;
    }
    const index = cursor++ % PIXEL_CHARACTER_COUNT;
    const pos = pixelFramePosition(index);
    sprite.style.backgroundPosition = `${pos.x}px ${pos.y}px`;
  };
  timer = clock.setTimeout(() => {
    if (cancelled || !container.isConnected) { stop(); return; }
    holder = doc.createElement('div');
    holder.className = 'pixel-loading-charm';
    holder.setAttribute('aria-hidden', 'true');
    sprite = doc.createElement('span');
    sprite.className = 'pixel-loading-sprite';
    holder.append(sprite);
    container.append(holder);
    paint();
    if (!reducedMotion) interval = clock.setInterval(paint, rotateMs);
  }, delayMs);
  return stop;
}
