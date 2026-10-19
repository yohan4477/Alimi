// The existing launch artwork is only a cover for the first pending community request.
import {esc} from './util.js';

export function beginStartupLoading({label, line1, line2, doc = document, schedule = setTimeout, cancel = clearTimeout}) {
  let cover, stopped = false;
  const finish = () => {
    if (stopped) return;
    stopped = true;
    cancel(delay); cancel(limit);
    cover?.remove();
    doc.removeEventListener('visibilitychange', visibility);
  };
  const visibility = () => { if (doc.hidden) finish(); };
  const delay = schedule(() => {
    if (stopped || doc.hidden) return;
    cover = doc.createElement('div');
    cover.className = 'startup-loading';
    cover.setAttribute('role', 'status');
    cover.setAttribute('aria-label', label);
    cover.innerHTML = `<div class="ob-splash" aria-hidden="true"><p class="ob-line1">${esc(line1)}</p><p class="ob-line2">${esc(line2)}</p><img class="ob-logo" src="assets/seoul-beauty-logo.webp" alt="" width="300" height="90"><img class="ob-photo" src="assets/splash-photo.webp" alt="" width="776" height="1085"><span class="startup-label">${esc(label)}</span></div>`;
    doc.body.append(cover);
  }, 400);
  // A stalled request must not permanently cover navigation or the retry state.
  const limit = schedule(finish, 8400);
  doc.addEventListener('visibilitychange', visibility);
  return finish;
}
