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
  // Visual-only loader demo; no timers or fabricated request completion.
  const loadingReview = document.getElementById('sb-loading-design-review');
  if (loadingReview) {
    const sprite = loadingReview.querySelector('.sb-design-loader-character');
    const pause = loadingReview.querySelector('[data-loader-pause]');
    const next = loadingReview.querySelector('[data-loader-next]');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let paused = reduceMotion, frame = 0;
    const setFrame = index => {
      frame = ((index % 10) + 10) % 10;
      sprite.style.animation = 'none';
      sprite.style.backgroundPosition = (-64 * (frame % 5)) + 'px ' + (-96 * Math.floor(frame / 5)) + 'px';
    };
    const readCurrentFrame = () => {
      const [x, y] = getComputedStyle(sprite).backgroundPosition.split(' ');
      const column = Math.min(4, Math.max(0, Math.round(-parseFloat(x) / 64) || 0));
      const row = Math.min(1, Math.max(0, Math.round(-parseFloat(y) / 96) || 0));
      return row * 5 + column;
    };
    const refreshLabel = () => {
      pause.setAttribute('aria-pressed', String(paused));
      pause.textContent = reduceMotion ? '모션 감소 활성화' : paused ? '자동 순환 재생' : '일시정지';
    };
    pause.addEventListener('click', () => {
      if (reduceMotion) return;
      if (!paused) { setFrame(readCurrentFrame()); paused = true; }
      else {
        sprite.style.backgroundPosition = '';
        sprite.style.animation = '';
        // Resume the 10-step cycle from the paused frame instead of restarting at frame 0.
        sprite.style.animationDelay = (-parseFloat(getComputedStyle(sprite).animationDuration) * frame / 10) + 's';
        paused = false;
      }
      refreshLabel();
    });
    next.addEventListener('click', () => {
      const current = paused ? frame : readCurrentFrame();
      paused = true;
      setFrame(current + 1);
      refreshLabel();
    });
    if (reduceMotion) { pause.disabled = true; setFrame(0); }
    refreshLabel();
  }
  // Private admin mock only. No preferences, chat messages or skin attributes are stored or sent.
  const guideDemo = document.getElementById('sb-pixel-guide-demo');
  if (guideDemo) {
    let stage = 0, guideLang = 'ko';
    const interests = new Set(), concerns = new Set();
    const optionSections = [...guideDemo.querySelectorAll('[data-guide-stage][data-guide-locale]')];
    const renderGuide = () => {
      const active = guideLang + '-' + stage;
      guideDemo.querySelector('#sb-guide-counter').textContent = (stage + 1) + ' / 3';
      const guideImage = guideDemo.querySelector('[data-guide-alt-ko]');
      if (guideImage) guideImage.alt = guideLang === 'ko' ? guideImage.dataset.guideAltKo : guideImage.dataset.guideAltEn;
      for (const button of guideDemo.querySelectorAll('[data-guide-lang]')) {
        button.setAttribute('aria-pressed', String(button.dataset.guideLang === guideLang));
      }
      for (const span of guideDemo.querySelectorAll('[data-guide-speech],[data-guide-next-label]')) {
        const id = span.dataset.guideSpeech ?? span.dataset.guideNextLabel;
        span.hidden = id !== active;
      }
      for (const span of guideDemo.querySelectorAll('[data-guide-back-label],[data-guide-skip-label]')) {
        span.hidden = (span.dataset.guideBackLabel ?? span.dataset.guideSkipLabel) !== guideLang;
      }
      optionSections.forEach(section => {
        section.hidden = Number(section.dataset.guideStage) !== stage || section.dataset.guideLocale !== guideLang;
      });
      for (const button of guideDemo.querySelectorAll('[data-guide-interest]')) {
        button.setAttribute('aria-pressed', String(interests.has(button.dataset.guideInterest)));
      }
      for (const button of guideDemo.querySelectorAll('[data-guide-concern]')) {
        button.setAttribute('aria-pressed', String(concerns.has(button.dataset.guideConcern)));
      }
      for (const group of guideDemo.querySelectorAll('[data-guide-group]')) {
        group.hidden = !interests.has(group.dataset.guideGroup);
      }
      for (const room of guideDemo.querySelectorAll('[data-guide-room]')) {
        const category = room.dataset.guideRoom;
        room.hidden = category !== 'generic' && !interests.has(category);
      }
      guideDemo.querySelector('#sb-guide-back').hidden = stage === 0;
      guideDemo.querySelector('#sb-guide-skip').hidden = stage === 2;
      [...guideDemo.querySelectorAll('.sb-guide-progress span')].forEach((span, index) => span.classList.toggle('current', index <= stage));
    };
    guideDemo.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !guideDemo.contains(button)) return;
      if (button.dataset.guideLang) guideLang = button.dataset.guideLang;
      else if (button.dataset.guideInterest) {
        const choice = button.dataset.guideInterest;
        if (interests.has(choice)) {
          interests.delete(choice);
          for (const concern of [...concerns]) if (concern.startsWith(choice + '_')) concerns.delete(concern);
        } else interests.add(choice);
      } else if (button.dataset.guideConcern) {
        const choice = button.dataset.guideConcern;
        if (concerns.has(choice)) concerns.delete(choice);
        else concerns.add(choice);
      } else if (button.id === 'sb-guide-next') {
        if (stage === 2) { stage = 0; interests.clear(); concerns.clear(); }
        else if (stage === 0) stage = interests.size ? 1 : 2;
        else stage = 2;
      } else if (button.id === 'sb-guide-back') stage = stage === 2 && !interests.size ? 0 : Math.max(stage - 1, 0);
      else if (button.id === 'sb-guide-skip') { stage = 2; interests.clear(); concerns.clear(); }
      else return;
      renderGuide();
    });
    renderGuide();
  }

  // Development tab reads a manual snapshot: filters never mutate GitHub/issues or telemetry.
  const devPanel = document.getElementById('sb-dev');
  if (devPanel) {
    const cards = [...devPanel.querySelectorAll('[data-dev-item]')];
    const buttons = [...devPanel.querySelectorAll('[data-dev-filter]')];
    const state = {priority:'all',platform:'all'};
    const count = document.getElementById('sb-dev-result-count');
    const empty = document.getElementById('sb-dev-empty');
    const refresh = () => {
      let shown = 0;
      for (const card of cards) {
        const matchPriority = state.priority === 'all' || card.dataset.devPriority === state.priority;
        const matchPlatform = state.platform === 'all' || (card.dataset.devPlatform || '').split(' ').includes(state.platform);
        card.hidden = !(matchPriority && matchPlatform);
        if (!card.hidden) shown++;
      }
      count.textContent = '표시 ' + shown + '개 / 전체 ' + cards.length + '개 · 수동 리뷰';
      empty.hidden = shown !== 0;
    };
    for (const button of buttons) button.addEventListener('click', () => {
      const type = button.dataset.devFilter;
      state[type] = button.dataset.devValue;
      for (const choice of buttons.filter(item => item.dataset.devFilter === type))
        choice.setAttribute('aria-pressed', String(choice === button));
      refresh();
    });
    devPanel.addEventListener('click', event => {
      const jump = event.target.closest('[data-dev-jump]');
      if (!jump || !devPanel.contains(jump)) return;
      const tab = document.getElementById(jump.dataset.devJump);
      if (tab) select(tab, true);
    });
    refresh();
  }

  let saved; try { saved = sessionStorage.getItem('sb-admin-tab'); } catch {}
  const deepLink = {'#sb-plan':'sb-plan-tab','#sb-dev':'sb-dev-tab'}[location.hash];
  select(tabs.find(t => t.id === (deepLink || saved)) || tabs[0]);
  document.getElementById('admin-logout').addEventListener('submit', () => { root.hidden = true; try { sessionStorage.removeItem('sb-admin-tab'); } catch {} });
  // Do not show a protected snapshot from the browser back/forward cache after logout.
  addEventListener('pagehide', () => { root.hidden = true; });
  addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
