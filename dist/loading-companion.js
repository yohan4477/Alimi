// Decorative pixel character during *real* asynchronous requests only.
// The first outfit alternates between requests; long requests cycle all 10 looks.
// No fake progress, skin-based inference, timers, or additional network calls.
import {esc} from './util.js';

let nextLook = 0;
export const loadingMarkup = label => {
  const look = nextLook++ % 10;
  const phase = (-2.2 * look).toFixed(1) + 's';
  const x = -48 * (look % 5), y = -72 * Math.floor(look / 5);
  return `<div class="sb-loading-status" role="status" aria-live="polite">
    <span class="sb-loading-sprite" aria-hidden="true" style="--sb-look-offset:${phase};--sb-static-x:${x}px;--sb-static-y:${y}px"></span>
    <span class="sb-loading-label">${esc(label)}</span>
  </div>`;
};
