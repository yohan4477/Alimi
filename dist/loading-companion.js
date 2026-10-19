// Lightweight, decorative pixel guide for *real* asynchronous loading only.
// No timers, fake progress, user profiling or network requests. 10 costumes share one 4.8 KB sprite.
import {esc} from './util.js';

export const loadingMarkup = label => `<div class="sb-loading-status" role="status" aria-live="polite">
  <span class="sb-loading-sprite" aria-hidden="true"></span>
  <span class="sb-loading-label">${esc(label)}</span>
</div>`;
