// Presentation state only. Authorization is performed on every server request.
const root = document.getElementById('sb-management');
if (root) {
  const review = document.getElementById('sb-planning-review');
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  function select(tab, focus = false) {
    if (!tabs.includes(tab)) return;
    for (const t of tabs) {
      const active = t === tab;
      t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1;
      t.classList.toggle('active', active);
      document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
    }
    if (tab.id === 'sb-plan-tab' && review && !review.hasAttribute('src')) {
      review.src = review.dataset.src;
    }
    if (focus) tab.focus();
    try { sessionStorage.setItem('sb-admin-tab', tab.id); } catch {}
  }
  for (const [i, tab] of tabs.entries()) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (i + 1) % tabs.length : event.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : null;
      if (next !== null) { event.preventDefault(); select(tabs[next], true); }
    });
  }
  let reviewObserver;
  review?.addEventListener('load', () => {
    reviewObserver?.disconnect();
    const body = review.contentDocument?.body;
    if (!body) return;
    const fit = () => { review.style.height = Math.ceil(body.getBoundingClientRect().height + 16) + 'px'; };
    reviewObserver = new ResizeObserver(fit);
    reviewObserver.observe(body);
    fit();
  });
  // Design-review controls affect presentation only; values are proposals, not telemetry.
  const reviewPanel = document.getElementById('sb-design');
  if (reviewPanel) {
    const filters = [...reviewPanel.querySelectorAll('[data-design-filter]')];
    const issues = [...reviewPanel.querySelectorAll('[data-design-priority]')];
    for (const button of filters) button.addEventListener('click', () => {
      const chosen = button.dataset.designFilter;
      for (const item of filters) {
        const selected = item === button;
        item.setAttribute('aria-pressed', String(selected));
        item.classList.toggle('active', selected);
      }
      for (const issue of issues) issue.hidden = chosen !== 'all' && issue.dataset.designPriority !== chosen;
    });
    const locales = [...reviewPanel.querySelectorAll('[data-design-lang]')];
    const previews = [...reviewPanel.querySelectorAll('[data-design-locale]')];
    for (const button of locales) button.addEventListener('click', () => {
      const chosen = button.dataset.designLang;
      for (const item of locales) {
        const selected = item === button;
        item.setAttribute('aria-pressed', String(selected));
        item.classList.toggle('active', selected);
      }
      for (const preview of previews) preview.hidden = preview.dataset.designLocale !== chosen;
    });
  }
  let saved; try { saved = sessionStorage.getItem('sb-admin-tab'); } catch {}
  select(tabs.find(t => t.id === (location.hash === '#sb-plan' ? 'sb-plan-tab' : saved)) || tabs[0]);
  document.getElementById('admin-logout').addEventListener('submit', () => { root.hidden = true; try { sessionStorage.removeItem('sb-admin-tab'); } catch {} });
  // Do not show a protected snapshot from the browser back/forward cache after logout.
  addEventListener('pagehide', () => { root.hidden = true; });
  addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
