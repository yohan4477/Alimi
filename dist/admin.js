// Presentation state only. Authorization is performed on every server request.
const root = document.getElementById('sb-management');
if (root) {
  // Nested affiliate tabs are independent of the main admin navigation and its saved state.
  const affiliateTabs = [...root.querySelectorAll('.affiliate-tabs [role="tab"]')];
  function selectAffiliate(tab, focus = false) {
    for (const button of affiliateTabs) {
      const active = button === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      document.getElementById(button.getAttribute('aria-controls')).hidden = !active;
    }
    if (focus) tab.focus();
  }
  affiliateTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectAffiliate(tab));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? affiliateTabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % affiliateTabs.length : event.key === 'ArrowLeft' ? (index + affiliateTabs.length - 1) % affiliateTabs.length : null;
      if (next !== null) { event.preventDefault(); selectAffiliate(affiliateTabs[next], true); }
    });
  });
  root.querySelectorAll('[data-brand-logo]').forEach(img => {
    const failed = () => { img.hidden = true; img.nextElementSibling.hidden = false; };
    img.addEventListener('error', failed);
    if (img.complete && img.naturalWidth === 0) failed();
  });
  // Every admin tab has a navigable table of contents, without card containers.
  for (const panel of root.querySelectorAll('.sb-panel')) {
    const headings = [...panel.querySelectorAll('h2,h3')].filter(h => !h.closest('details') && !h.closest('[hidden]'));
    const unique = headings.filter(h => h.textContent.trim().length > 0).slice(0, 25);
    const nav = document.createElement('nav');
    nav.className = 'admin-section-toc';
    nav.setAttribute('aria-label', '이 화면의 목차');
    const label = document.createElement('strong');
    label.textContent = '목차';
    nav.append(label);
    const list = document.createElement('ol');
    if (unique.length === 0) {
      const li = document.createElement('li');
      li.textContent = '개요';
      list.append(li);
    } else {
      unique.forEach((heading,index)=>{
        if (!heading.id) heading.id = panel.id + '-heading-' + (index+1);
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + heading.id;
        a.textContent = heading.textContent.trim();
        a.addEventListener('click', event=>{
          event.preventDefault();
          heading.scrollIntoView({behavior:'smooth',block:'start'});
          heading.focus({preventScroll:true});
        });
        heading.tabIndex = -1;
        li.append(a);
        list.append(li);
      });
    }
    nav.append(list);
    panel.prepend(nav);
  }
  root.querySelectorAll('[data-state-view]').forEach(button=>button.addEventListener('click',()=>{
    const selected=button.dataset.stateView;
    root.querySelectorAll('[data-state-view]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
    root.querySelectorAll('[data-state-panel]').forEach(section=>section.hidden=section.dataset.statePanel!==selected);
  }));
  let gameMetricsVersion=0;
  async function refreshGameMetrics(){
    const status=document.getElementById('game-metrics-status');if(!status)return;
    const version=++gameMetricsVersion,test=document.getElementById('game-metrics-mode').value;
    const cells=[...document.querySelectorAll('[data-game-metric]')];cells.forEach(el=>el.textContent='조회 중');status.textContent='불러오는 중…';
    try{const r=await fetch('/api/admin?view=game-metrics&test='+test,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('access');const data=await r.json();if(version!==gameMetricsVersion)return;
      const labels={unconnected:'미연결',denied:'조회 권한 없음',unavailable:'불러오기 실패',migration_required:'DB 집계 마이그레이션 확인 필요',no_data:'미수신',received:'수신 확인'},label=labels[data.state]||'불러오기 실패';
      document.getElementById('ownership-release-status').textContent=data.flags?.ownership?'활성':'비활성';document.getElementById('account-release-status').textContent=data.flags?.accountLink?'활성':'비활성';
      for(const cell of cells){const [section,key]=cell.dataset.gameMetric.split('.'),value=data[section]?.[key];cell.textContent=data.state==='received'&&Number.isFinite(value)?(section==='rates'?(value*100).toFixed(1)+'%':value.toLocaleString('ko-KR')):(data.state==='received'&&section==='rates'?'분모 없음':label);}
      status.textContent=(data.test?'테스트':'실사용')+' · '+label+' · 최근 7일 · '+new Date(data.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST';
    }catch{if(version!==gameMetricsVersion)return;status.textContent='불러오기 실패 · 로그인과 연결 상태를 확인하세요.';cells.forEach(el=>el.textContent='불러오기 실패');}
  }
  // Funnel, sources and choices. Every value is written with textContent; nothing from the response becomes HTML.
  let gameInsightsVersion=0;
  const insightSteps={landing_view:'첫 화면 방문',character_view:'그림(상황) 보기',advice_select:'답 고르기',product_select:'제품 고르기',answer:'선택 완료',result_view:'결과 화면',share:'초대 링크 만들기',invite_open:'친구 초대 열기',comparison_view:'둘의 선택 비교'};
  const insightDims={heard:'알게 된 곳(본인 답)',entry:'유입 경로',country:'국가',lang:'언어'};
  const pct=(n,d)=>d?Math.round(n/d*100)+'%':'—';
  function insightTable(caption,head,rows){
    const table=document.createElement('table'),cap=document.createElement('caption'),thead=document.createElement('thead'),tr=document.createElement('tr'),tbody=document.createElement('tbody');
    cap.textContent=caption;table.append(cap);for(const h of head){const th=document.createElement('th');th.textContent=h;tr.append(th);}thead.append(tr);table.append(thead);
    for(const row of rows){const r=document.createElement('tr');for(const cell of row){const td=document.createElement('td');td.textContent=String(cell);r.append(td);}tbody.append(r);}
    if(!rows.length){const r=document.createElement('tr'),td=document.createElement('td');td.colSpan=head.length;td.textContent='기록 없음';r.append(td);tbody.append(r);}
    table.append(tbody);return table;
  }
  async function refreshGameInsights(){
    const root=document.getElementById('game-insights'),status=document.getElementById('game-insights-status');if(!root||!status)return;
    const version=++gameInsightsVersion,test=document.getElementById('game-metrics-mode')?.value||'0',days=document.getElementById('game-insights-days')?.value||'7';
    status.textContent='불러오는 중…';
    try{const r=await fetch('/api/admin?view=game-insights&test='+test+'&days='+days,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('access');const d=await r.json();if(version!==gameInsightsVersion)return;
      const labels={unconnected:'미연결',denied:'조회 권한 없음',unavailable:'불러오기 실패',migration_required:'DB 집계 함수 적용 필요',no_data:'기록 없음',received:'수신 확인'};
      status.textContent=(d.test?'테스트':'실사용')+' · '+(labels[d.state]||'불러오기 실패')+' · 최근 '+d.days+'일 · 사람 '+(d.people??0)+'명 · '+new Date(d.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST';
      root.replaceChildren();if(d.state!=='received')return;
      const first=d.funnel[0]?.people||0,side=new Set(['invite_open','comparison_view']);
      root.append(insightTable('단계별 진행 (어디서 그만두나)',['단계','사람','이전 단계 대비','첫 화면 대비','플레이'],d.funnel.map((f,i)=>[insightSteps[f.step]||f.step,f.people,i&&!side.has(f.step)?pct(f.people,d.funnel[i-1].people):'—',side.has(f.step)?'—':pct(f.people,first),f.plays])));
      for(const [dim,label] of Object.entries(insightDims))root.append(insightTable(label+'별',[label,'사람','답 고르기 시작','선택 완료','완료율','초대 링크'],d.segments.filter(s=>s.dimension===dim).map(s=>[s.value,s.people,s.started,s.completed,pct(s.completed,s.people),s.shared])));
      const ranked=(caption,col,list,limit=15)=>{const t=list.reduce((a,x)=>a+x.n,0);root.append(insightTable(caption,[col,'선택 수','비율'],list.slice(0,limit).map(x=>[x.label,x.n,pct(x.n,t)])));};
      ranked('상황별로 고른 답','상황 · 답',d.situations,30);ranked('고른 제품 종류','종류',d.categories);ranked('고른 제품 브랜드','브랜드',d.answerBrands);ranked('고른 이유','이유',d.reasons);
      root.append(insightTable('브랜드 칩을 누른 사람',['브랜드','사람'],d.brandTaps.slice(0,15).map(x=>[x.label,x.n])));
      ranked('고른 제품 (참고용 · 표가 흩어짐)','제품',d.products,30);
    }catch{if(version!==gameInsightsVersion)return;status.textContent='불러오기 실패 · 로그인과 연결 상태를 확인하세요.';root.replaceChildren();}
  }
  document.getElementById('game-insights-days')?.addEventListener('change',refreshGameInsights);
  document.getElementById('game-metrics-mode')?.addEventListener('change',refreshGameInsights);
  document.getElementById('game-metrics-refresh')?.addEventListener('click',refreshGameInsights);
  document.getElementById('game-metrics-mode')?.addEventListener('change',refreshGameMetrics);
  document.getElementById('game-metrics-refresh')?.addEventListener('click',refreshGameMetrics);
  let metricsBusy=false,lastMetricsFetch=0;
  async function refreshMetrics(force=false){
    const status=document.getElementById('metrics-status');if(!status||metricsBusy||(!force&&Date.now()-lastMetricsFetch<60000))return;
    metricsBusy=true;status.textContent='불러오는 중…';
    const cells=[...document.querySelectorAll('[data-metric]')];cells.forEach(e=>e.textContent='조회 중');
    try{
      const response=await fetch('/api/admin?view=metrics&region='+encodeURIComponent(document.getElementById('metrics-region')?.value??'all'),{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error('access');const data=await response.json();
      const labels={unconnected:'미연결',denied:'조회 권한 없음',unavailable:'불러오기 실패',partial:'집계 범위 초과 · 일부 데이터',no_data:'미수신',received:'수신 확인'};
      const label=labels[data.state]??'불러오기 실패';
      cells.forEach(e=>{const value=data.metrics?.[e.dataset.metric];e.textContent=data.state==='received'&&Number.isFinite(value)?value.toLocaleString('ko-KR'):label;});
      status.textContent=label+' · 조회 '+new Date(data.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST'+(data.lastEventAt?' · 최근 수신 '+new Date(data.lastEventAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST':'');
      lastMetricsFetch=Date.now();
    }catch{status.textContent='불러오기 실패 · 로그인과 연결 상태를 확인하세요.';cells.forEach(e=>e.textContent='불러오기 실패');}
    finally{metricsBusy=false;}
  }
  document.getElementById('metrics-region')?.addEventListener('change',()=>refreshMetrics(true));
  document.getElementById('metrics-refresh')?.addEventListener('click',()=>refreshMetrics(true));
  document.querySelectorAll('.period-choice').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('.period-choice').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});
  }));
  const review = document.getElementById('sb-planning-review');
  const tabs = [...root.querySelectorAll('[role="tab"][id^="sb-"]')];
  function select(tab, focus = false, historyMode = 'push') {
    if (!tabs.includes(tab)) return;
    for (const t of tabs) {
      const active = t === tab;
      t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1;
      t.classList.toggle('active', active);
      document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
    }
    if (tab.id === 'sb-plan-tab') loadReview();
    if (tab.id === 'sb-ui-library-tab') loadLibrary();
    if(tab.id==='sb-dashboard-tab')refreshMetrics();
    if(tab.id==='sb-game-tab'){refreshGameMetrics();refreshGameInsights();}
    const hash = '#' + tab.id.slice(0,-4);
    if (location.hash !== hash) { try { history[historyMode === 'push' ? 'pushState' : 'replaceState'](null, '', hash); } catch {} }
    if (focus) tab.focus();
  }
  for (const [i, tab] of tabs.entries()) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (i + 1) % tabs.length : event.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : null;
      if (next !== null) { event.preventDefault(); select(tabs[next], true); }
    });
  }
  let libraryObserver;
  function loadLibrary() {
    const frame = document.getElementById('sb-library-frame');
    if (!frame || frame.hasAttribute('src')) return;
    const status = document.getElementById('sb-library-status');
    status.textContent = 'UI Library를 불러오는 중…';
    frame.onload = () => {
      const body = frame.contentDocument?.body;
      if (!body?.querySelector('.screen-nav')) {
        status.textContent = '로그인이 만료되었거나 화면을 불러오지 못했어요. 새로고침 후 다시 로그인해 주세요.';
        frame.removeAttribute('src'); return;
      }
      status.textContent = '';
      libraryObserver?.disconnect();
      const fit = () => { const height = Math.ceil(body.getBoundingClientRect().height + 24); if (height > 24) frame.style.height = height + 'px'; };
      libraryObserver = new ResizeObserver(fit); libraryObserver.observe(body); fit();
    };
    frame.onerror = () => { status.textContent = 'UI Library를 불러오지 못했어요. 탭을 다시 눌러 주세요.'; frame.removeAttribute('src'); };
    frame.src = frame.dataset.src;
  }
  let reviewObserver, reviewTimer, reviewPending = false;
  let reviewStatus;
  function loadReview() {
    if (!review || review.hasAttribute('src')) return;
    const panel = review.closest('[role="tabpanel"]');
    if (panel?.hidden) return;
    for (let parent = review.parentElement; parent; parent = parent.parentElement)
      if (parent.tagName === 'DETAILS' && !parent.open) return;
    if (!reviewStatus) {
      reviewStatus = document.createElement('p');
      reviewStatus.setAttribute('role', 'status');
      review.before(reviewStatus);
    }
    reviewStatus.replaceChildren(document.createTextNode('시안을 불러오는 중…'));
    reviewPending = true;
    reviewTimer = setTimeout(() => reviewFailed('시안 응답이 지연되고 있습니다.'), 15000);
    review.src = review.dataset.src;
  }
  function reviewFailed(message) {
    clearTimeout(reviewTimer); reviewPending = false;
    reviewObserver?.disconnect();
    review.removeAttribute('src');
    reviewStatus.replaceChildren(document.createTextNode(message + ' '));
    const retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = '다시 불러오기';
    retry.addEventListener('click', loadReview);
    const login = document.createElement('a');
    login.href = '/admin#sb-plan'; login.textContent = '관리자 로그인 확인';
    reviewStatus.append(retry, document.createTextNode(' · '), login);
  }
  for (let parent = review?.parentElement; parent; parent = parent.parentElement)
    if (parent.tagName === 'DETAILS') parent.addEventListener('toggle', loadReview);
  review?.addEventListener('error', () => {
    if (reviewPending) reviewFailed('시안을 불러오지 못했습니다.');
  });
  review?.addEventListener('load', () => {
    if (!reviewPending || !review.hasAttribute('src')) return;
    const body = review.contentDocument?.body;
    if (!body || !body.querySelector('#sb-reference-review')) {
      reviewFailed('시안을 열 수 없습니다. 로그인 상태를 확인하세요.'); return;
    }
    clearTimeout(reviewTimer); reviewPending = false;
    reviewStatus.textContent = '';
    reviewObserver?.disconnect();
    const fit = () => {
      const height = Math.ceil(body.getBoundingClientRect().height + 16);
      if (height > 16 && review.style.height !== height + 'px') review.style.height = height + 'px';
    };
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
  if (devPanel?.querySelector('[data-dev-item]')) {
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

  document.querySelector('#sb-ui-library [data-dev-jump]')?.addEventListener('click', event => { event.preventDefault(); select(document.getElementById('sb-plan-tab')); });
  // Quality sub-tabs are presentation-only; the admin session remains server protected.
  root.querySelectorAll('[data-quality-view]').forEach(button => button.addEventListener('click', () => {
    const selected = button.dataset.qualityView;
    root.querySelectorAll('[data-quality-view]').forEach(b => {
      b.classList.toggle('active', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    });
    root.querySelectorAll('[data-quality-panel]').forEach(panel => { panel.hidden = panel.dataset.qualityPanel !== selected; });
  }));
  // The URL is the only navigation state. A fresh /admin always starts at operations home.
  function selectLocation() {
    const tab = tabs.find(t => '#' + t.id.slice(0,-4) === location.hash) || document.getElementById('sb-dashboard-tab');
    select(tab, false, 'replace');
  }
  selectLocation();
  addEventListener('hashchange', selectLocation);
  addEventListener('popstate', selectLocation);
  document.getElementById('admin-logout').addEventListener('submit', () => { root.hidden = true; try { sessionStorage.removeItem('sb-admin-tab'); } catch {} });
  // Do not show a protected snapshot from the browser back/forward cache after logout.
  addEventListener('pagehide', () => { root.hidden = true; });
  addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
