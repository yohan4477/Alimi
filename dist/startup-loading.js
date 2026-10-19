// Brand artwork covers only the first pending community request.
import {esc} from './util.js';

export function beginStartupLoading({label, doc = document, schedule = setTimeout, cancel = clearTimeout}) {
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
    cover.innerHTML = `<div class="startup-brand-art" aria-hidden="true"><img src="assets/startup-brand.png" alt=""><span class="startup-label">${esc(label)}</span></div>`;
    doc.body.append(cover);
  }, 400);
  // A stalled request must not permanently cover navigation or the retry state.
  const limit = schedule(finish, 8400);
  doc.addEventListener('visibilitychange', visibility);
  return finish;
}
