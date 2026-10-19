// All pending content uses the existing launch logo and portrait, never avatar costumes.
import {esc} from './util.js';

export const loadingMarkup = label => `<div class="sb-loading-status" role="status" aria-live="polite">
  <span class="sb-loading-portrait" aria-hidden="true">
    <img class="sb-loading-logo" src="assets/seoul-beauty-logo.webp" alt="" width="300" height="90">
    <img class="sb-loading-photo" src="assets/splash-photo.webp" alt="" width="776" height="1085">
  </span>
  <span class="sb-loading-label"><span class="sb-loading-spinner" aria-hidden="true"></span>${esc(label)}</span>
</div>`;
