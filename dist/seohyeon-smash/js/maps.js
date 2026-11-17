// 지도 고르기(서현역 + 삼성전자 사업장) · 캠페인 단계 · 서현역 삼성 거점 보스전
// 지점장·사장님·총수는 지어낸 만화 인물 (실존 인물 아님, 실명·얼굴·사진 안 씀).
import * as THREE from 'three';
import { dailyMap, kstDate } from './meta.js';
import { emit } from './bus.js';

const $ = (id) => document.getElementById(id);
const QS = new URLSearchParams(location.search);
const DEBUG = QS.get('debug') === '1';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'smash-camp-v1';
const LOCK_TXT = '🔒 서현역에서 총수를 쓰러뜨리면 열림';

export let MAP = (QS.get('map') || 'seohyeon').replace(/[^a-z0-9_]/gi, '').slice(0, 20) || 'seohyeon';
let IDX = { maps: [{ id: 'seohyeon', label: '서현역 (분당)', short: '서현역', place: '서현동', kind: 'city' }], stages: [] };
let A = null;          // main.js 가 넘긴 것들
let INFO = IDX.maps[0];

// ---------- 진행 저장
function load() { try { return Object.assign({ cleared: 0, boss: false }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { cleared: 0, boss: false }; } }
function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 무시 */ } }
let PROG = load();
const factoriesOpen = () => DEBUG || PROG.boss || PROG.cleared >= 3;
const stageOpen = (k) => DEBUG || k <= PROG.cleared;
const mapOpen = (id) => id === 'seohyeon' || factoriesOpen();
let DAILY = 'seohyeon';             // 오늘의 동네 지도 (잠겨 있어도 오늘은 열림)
const DDATE = kstDate();            // 페이지를 연 날 (자정을 넘겨도 같은 순위표)

// ---------- 고른 것 (모드·단계)
const SEL = { mode: ['free', 'camp', 'daily'].includes(QS.get('mode')) ? QS.get('mode') : null, stage: null, map: MAP };
let CUR = null;        // 지금 판의 단계 (자유 모드면 null)

export async function boot() {
  try { IDX = await (await fetch('maps/index.json', { cache: 'no-store' })).json(); } catch (e) { /* 서현역만 */ }
  DAILY = dailyMap(IDX.maps.map((m) => m.id));
  if (SEL.mode === 'daily') MAP = DAILY;
  else if (!IDX.maps.some((m) => m.id === MAP) || !mapOpen(MAP)) MAP = 'seohyeon';
  INFO = IDX.maps.find((m) => m.id === MAP) || IDX.maps[0];
  SEL.map = MAP;
  const qs = Number(QS.get('stage'));
  if (qs >= 1 && qs <= IDX.stages.length && stageOpen(qs - 1)) SEL.stage = qs - 1;
  if (SEL.mode === null) SEL.mode = (QS.get('map') && !QS.get('stage')) || QS.get('score') || QS.get('home') ? 'free' : 'camp';
  if (SEL.stage === null) SEL.stage = Math.max(0, Math.min(PROG.cleared, IDX.stages.length - 1));   // 아직 못 깬 첫 단계
  if (!IDX.stages.length) SEL.mode = 'free';
  if (MAP !== 'seohyeon') {
    // 가상 주가(market.js)는 market.json 을 고정 경로로 읽으므로, 이 지도의 회사 표로 돌려 준다
    const f0 = window.fetch.bind(window);
    window.fetch = (u, o) => f0(typeof u === 'string' && /^(\.\/)?market\.json/.test(u) ? `maps/${MAP}/market.json` : u, o);
  }
}
export const cityUrl = () => (MAP === 'seohyeon' ? 'city.json' : `maps/${MAP}/city.json`);
export const isDaily = () => SEL.mode === 'daily' && MAP === DAILY;
export const gameId = () => (isDaily() ? 'daily-' + DDATE : MAP === 'seohyeon' ? 'seohyeon' : MAP);
export const mapsList = () => IDX.maps.slice();
export function dailyInfo() { const m = IDX.maps.find((x) => x.id === DAILY) || IDX.maps[0]; return { id: DAILY, short: m.short || DAILY, date: DDATE, here: DAILY === MAP }; }
export function goDaily() { SEL.mode = 'daily'; renderPanel(); const go = $('go'); if (go && !go.disabled) go.click(); }
export function reload() { PROG = load(); if (!QS.get('stage') && IDX.stages.length) SEL.stage = Math.max(0, Math.min(PROG.cleared, IDX.stages.length - 1)); renderPanel(); }
export const isHome = () => MAP === 'seohyeon';
export const title = () => (MAP === 'seohyeon' ? '서현역 부수기' : `${INFO.short} 부수기`);
export const place = () => INFO.place || INFO.short;
export function decorateUrl(u) { if (MAP !== 'seohyeon') u.searchParams.set('map', MAP); return u; }

// ---------- 그림 (market.js 회장님과 같은 틀의 지어낸 만화 인물)
const FIG = {
  manager: { hair: '#5a3d28', suit: '#8a94a6', tie: '#2f7de1', bald: false, mus: false, glasses: false, nm: '지점장' },
  ceo: { hair: '#4a3626', suit: '#5b6270', tie: '#2f7de1', bald: true, mus: true, glasses: true, nm: '사장님' },
  boss: { hair: '#f2f2ee', suit: '#15161c', tie: '#e0b020', bald: false, mus: true, glasses: false, brow: true, nm: '총수' },
};
function figSvg(v, mood = 'shock') {
  const f = FIG[v];
  const hair = f.bald ? `<path d="M40 70 Q38 92 46 98 L46 72Z M120 70 Q122 92 114 98 L114 72Z" fill="${f.hair}"/>`
    : v === 'boss' ? `<path d="M38 80 Q30 22 80 20 Q132 22 122 80 Q118 44 80 40 Q44 44 38 80Z" fill="${f.hair}"/><path d="M50 40 Q80 18 112 40 Q80 30 50 40Z" fill="#ffffff"/>`
      : `<path d="M40 76 Q34 30 80 28 Q128 28 120 78 Q116 52 100 46 Q80 40 60 46 Q44 52 40 76Z" fill="${f.hair}"/>`;
  const eyes = f.glasses
    ? '<circle cx="64" cy="74" r="11" fill="none" stroke="#222" stroke-width="3"/><circle cx="96" cy="74" r="11" fill="none" stroke="#222" stroke-width="3"/><path d="M75 74 L85 74" stroke="#222" stroke-width="3"/>' : '';
  const angry = mood === 'angry';
  const brow = f.brow ? `<path d="M50 ${angry ? 54 : 58} L74 ${angry ? 64 : 60} M110 ${angry ? 54 : 58} L86 ${angry ? 64 : 60}" stroke="#222" stroke-width="7" stroke-linecap="round"/>`
    : `<path d="M54 58 L72 62 M106 58 L88 62" stroke="#333" stroke-width="3" stroke-linecap="round"/>`;
  const mouth = angry ? '<path d="M66 106 Q80 96 94 106" stroke="#7a2a20" stroke-width="5" fill="none" stroke-linecap="round"/>' : '<ellipse cx="80" cy="104" rx="9" ry="6" fill="#7a2a20"/>';
  const sweat = angry ? '<path d="M8 40 L20 48 M4 60 L18 62 M150 30 L140 40 M156 52 L144 56" stroke="#ff3b30" stroke-width="3" stroke-linecap="round"/>'
    : '<path d="M126 50 Q132 62 126 66 Q120 62 126 50Z" fill="#7cc8ff"/><path d="M34 60 Q39 70 34 74 Q29 70 34 60Z" fill="#7cc8ff"/>';
  const pin = v === 'boss' ? '<circle cx="52" cy="146" r="5" fill="#e0b020"/>' : '';
  return `<svg viewBox="0 0 160 190" width="140" height="166">
  <path d="M22 190 Q26 128 80 122 Q134 128 138 190Z" fill="${f.suit}"/>
  <path d="M66 124 L80 150 L94 124Z" fill="#fff"/><path d="M76 128 L84 128 L86 160 L80 168 L74 160Z" fill="${f.tie}"/>${pin}
  <rect x="70" y="106" width="20" height="20" rx="6" fill="#f1c7a5"/>
  <ellipse cx="80" cy="74" rx="40" ry="44" fill="#f6d2b3"/>${hair}${eyes}
  <circle cx="64" cy="75" r="3" fill="#222"/><circle cx="96" cy="75" r="3" fill="#222"/>${brow}
  ${f.mus ? `<path d="M64 96 Q80 86 96 96 Q80 101 64 96Z" fill="${v === 'boss' ? '#d8d8d2' : '#4a3626'}"/>` : ''}${mouth}${sweat}
  </svg>`;
}
let charT = 0;
function say(v, line, mood) {
  const el = $('mpChar'); if (!el) return;
  $('mpFig').innerHTML = figSvg(v, mood);
  $('mpWho').textContent = FIG[v].nm + (v === 'boss' ? ' (지어낸 인물)' : '');
  $('mpSay').textContent = line;
  el.className = 'R'; void el.offsetWidth; el.classList.add('in');
  charT = 2.4;
  emit('collect', 'p:' + v);
  try { A.sfx.ding(); } catch (e) { /* 무시 */ }
}

// ---------- 화면 조각
function css() {
  const s = document.createElement('style');
  s.textContent = `
#mpPanel { margin: 10px 0 6px; text-align: left; }
#mpPanel .tabs { display: flex; gap: 6px; margin-bottom: 8px; }
#mpPanel .tabs button { flex: 1; padding: 8px 4px; border-radius: 12px; border: 2px solid #1d2430; background: #fff; font-weight: 900; font-size: 15px; color: #1d2430; }
#mpPanel .tabs button.on { background: #1d2430; color: #ffd24a; }
#mpPanel ul { list-style: none; margin: 0; padding: 0; max-height: 34vh; overflow-y: auto; }
#mpPanel li { display: flex; align-items: center; gap: 8px; padding: 7px 10px; margin: 4px 0; border-radius: 12px; background: #f3efe6; font-size: 14px; font-weight: 800; color: #1d2430; cursor: pointer; }
#mpPanel li.on { background: #ffd24a; box-shadow: 0 0 0 2px #1d2430 inset; }
#mpPanel li.lock { opacity: .55; cursor: default; font-weight: 700; }
#mpPanel li .n { min-width: 22px; text-align: center; font-weight: 900; }
#mpPanel li small { display: block; font-weight: 700; color: #5a6070; font-size: 12px; }
#mpPanel li .st { margin-left: auto; font-size: 13px; }
#mpStage { margin-top: 6px; background: rgba(20,24,32,.82); color: #fff; border-radius: 12px; padding: 6px 10px; font-size: 13px; font-weight: 800; pointer-events: none; }
#mpStage .row2 { display: flex; justify-content: space-between; gap: 8px; }
#mpStage .bar { height: 9px; background: rgba(255,255,255,.18); border-radius: 9px; margin-top: 4px; overflow: hidden; }
#mpStage .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,#ffb020,#ff5a2e); border-radius: 9px; transition: width .2s; }
#mpStage.ok .bar i { background: linear-gradient(90deg,#36c46a,#8be36b); }
#mpStage .sub { color: #ffd24a; font-size: 12px; }
#mpChar { position: fixed; bottom: calc(env(safe-area-inset-bottom) + 96px); right: 8px; z-index: 16; display: flex; flex-direction: column; align-items: flex-end; pointer-events: none; }
#mpChar.hidden { display: none; }
#mpChar.in { animation: mpIn .35s cubic-bezier(.2,1.4,.4,1) both; }
#mpChar .bub { background: #fff; color: #1d2430; font-size: 16px; font-weight: 900; padding: 8px 12px; border-radius: 14px; border: 3px solid #1d2430; max-width: 220px; position: relative; margin-bottom: 8px; }
#mpChar .who { font-size: 12px; font-weight: 800; color: #fff; background: #1d4fa0; border-radius: 99px; padding: 2px 9px; margin-bottom: -6px; position: relative; z-index: 1; }
#mpFig svg { display: block; filter: drop-shadow(0 6px 8px rgba(0,0,0,.3)); }
@keyframes mpIn { from { transform: translateX(120%); } to { transform: none; } }
.mpBar { position: fixed; z-index: 9; transform: translate(-50%, -100%); pointer-events: none; background: rgba(20,24,32,.88); color: #fff; border-radius: 10px; padding: 3px 8px 5px; font-size: 12px; font-weight: 900; white-space: nowrap; text-align: center; }
.mpBar .hp { display: flex; gap: 3px; justify-content: center; margin-top: 3px; }
.mpBar .hp i { width: 16px; height: 7px; border-radius: 3px; background: #ff4a3a; }
.mpBar .hp i.x { background: rgba(255,255,255,.2); }
.mpBar.boss { background: rgba(120,20,20,.92); font-size: 13px; }
#mpRes { margin: 6px 0 10px; padding: 10px; border-radius: 14px; background: #1d2430; color: #fff; font-weight: 900; text-align: center; }
#mpRes.ok { background: #1f7a44; }
#mpRes b { display: block; font-size: 22px; color: #ffd24a; }
#mpRes .mpSub { font-size: 13px; font-weight: 700; opacity: .9; margin: 4px 0 8px; }
#mpRes button { margin: 4px; padding: 9px 16px; border-radius: 12px; border: 0; font-weight: 900; font-size: 15px; background: #ffd24a; color: #1d2430; }
`;
  document.head.appendChild(s);
}
function buildDom() {
  css();
  const ch = document.createElement('div'); ch.id = 'mpChar'; ch.className = 'hidden';
  ch.innerHTML = '<div class="bub" id="mpSay"></div><div class="who" id="mpWho"></div><div id="mpFig"></div>';
  document.body.appendChild(ch);
  const st = document.createElement('div'); st.id = 'mpStage'; st.className = 'hidden';
  st.innerHTML = '<div class="row2"><span id="mpStT"></span><span id="mpStPct"></span><span id="mpStTime"></span></div><div class="bar"><i id="mpStBar"></i></div><div class="row2 sub"><span id="mpStP"></span><span id="mpStX"></span></div>';
  const hud = $('hud'); const mis = $('hudChips') || $('missions');
  if (hud) hud.insertBefore(st, mis || null);
  // 시작 화면 고르기 판
  const card = document.querySelector('#start .card');
  const p = document.createElement('div'); p.id = 'mpPanel';
  p.innerHTML = '<div class="tabs"><button data-m="camp">🏁 캠페인</button><button data-m="free">🎮 자유 모드</button></div><ul id="mpList"></ul>';
  const how = card && card.querySelector('.how');
  if (card) card.insertBefore(p, how ? how.nextSibling : $('go'));
  p.querySelectorAll('.tabs button').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); SEL.mode = b.dataset.m; if (SEL.mode === 'free') SEL.map = MAP; if (SEL.mode === 'camp' && IDX.stages[SEL.stage] && !stageOpen(SEL.stage)) SEL.stage = 0; renderPanel(); }));
  // 끝 화면 단계 결과
  const end = document.querySelector('#end .card');
  const r = document.createElement('div'); r.id = 'mpRes'; r.className = 'hidden';
  const kick = $('eKick');
  if (end) end.insertBefore(r, kick ? kick.nextSibling : end.firstChild);
  // 시작 버튼: 다른 지도가 필요하면 이동 (main.js 의 시작보다 먼저 잡음)
  document.addEventListener('click', (e) => {
    const go = e.target.closest && e.target.closest('#go');
    if (!go) return;
    const want = wantMap();
    if (want !== MAP) { e.stopImmediatePropagation(); e.preventDefault(); navigate(want, SEL.mode, SEL.stage); }
  }, true);
  // 지도 이름
  if (MAP !== 'seohyeon') {
    document.title = title();
    const h1 = document.querySelector('#start h1'); if (h1) h1.textContent = title();
    const kk = document.querySelector('#start .kicker'); if (kk) kk.textContent = `${INFO.name} 반경 ${(INFO.R / 1000).toFixed(1)}km 미니어처`;
    const lab = $('hScoreLab') || document.querySelector('#hud .score .lab'); if (lab) lab.textContent = '부순 건물값';
    const how2 = document.querySelector('#start .how'); if (how2) how2.innerHTML = '<b>건물을 누르면 운석이 떨어집니다.</b><br>반도체 팹은 튼튼해서 두 번 맞아야 무너져요.<br>60초, 20발로 <b>건물값</b>을 최대한 날리세요. <small>(공장 값은 연면적 기준 추정)</small>';
  }
}
function navigate(map, mode, stage) {
  const u = new URL(location.href.split('?')[0].split('#')[0]);
  if (map !== 'seohyeon') u.searchParams.set('map', map);
  u.searchParams.set('mode', mode);
  if (mode === 'camp') u.searchParams.set('stage', String(stage + 1));
  if (mode === 'daily') u.searchParams.delete('map');
  if (DEBUG) u.searchParams.set('debug', '1');
  location.href = u.toString();
}
const won = (n) => (A ? A.wonShort(n) : String(n));
const wantMap = () => (SEL.mode === 'camp' ? IDX.stages[SEL.stage].map : SEL.mode === 'daily' ? DAILY : SEL.map);
function renderPanel() {
  const ul = $('mpList'); if (!ul) return;
  document.querySelectorAll('#mpPanel .tabs button').forEach((b) => b.classList.toggle('on', b.dataset.m === SEL.mode));
  ul.innerHTML = '';
  if (SEL.mode === 'daily') {
    const m = IDX.maps.find((x) => x.id === DAILY) || {};
    const li = document.createElement('li'); li.className = 'on';
    li.innerHTML = `<span class="n">📅</span><span>오늘의 동네 · ${esc(m.short || DAILY)}<small>모두 같은 지도·미션 3개 · 순위는 오늘 자정까지</small></span><span class="st">▶</span>`;
    ul.appendChild(li);
  } else if (SEL.mode === 'camp') {
    IDX.stages.forEach((s, k) => {
      const m = IDX.maps.find((x) => x.id === s.map) || {};
      const open = stageOpen(k), done = k < PROG.cleared;
      const li = document.createElement('li');
      li.className = (k === SEL.stage ? 'on ' : '') + (open ? '' : 'lock');
      li.innerHTML = `<span class="n">${k + 1}</span><span>${esc(s.t)}<small>${esc(m.short || s.map)}${s.map !== 'seohyeon' ? ' · 삼성전자 사업장' : ''}</small></span><span class="st">${done ? '✔' : open ? '▶' : '🔒'}</span>`;
      if (open) li.onclick = (e) => { e.stopPropagation(); SEL.stage = k; renderPanel(); };
      ul.appendChild(li);
    });
  } else {
    for (const m of IDX.maps) {
      const open = mapOpen(m.id);
      const li = document.createElement('li');
      li.className = (m.id === SEL.map ? 'on ' : '') + (open ? '' : 'lock');
      li.innerHTML = `<span>${esc(m.label)}<small>${open ? (m.id === 'seohyeon' ? '기본 지도 · 실거래 집값' : `삼성전자 · 건물 ${m.n}채 · 반경 ${(m.R / 1000).toFixed(1)}km`) : LOCK_TXT}</small></span><span class="st">${open ? (m.id === MAP ? '지금' : '') : '🔒'}</span>`;
      if (open) li.onclick = (e) => { e.stopPropagation(); SEL.map = m.id; renderPanel(); };
      ul.appendChild(li);
    }
  }
  const go = $('go');
  if (go && !go.disabled) {
    const want = wantMap();
    const wm = IDX.maps.find((x) => x.id === want) || {};
    go.textContent = want !== MAP ? `▶ ${wm.short || want}(으)로 이동` : SEL.mode === 'daily' ? '📅 오늘의 동네 시작' : SEL.mode === 'camp' ? `${SEL.stage + 1}단계 시작` : (go.dataset.mpDef || go.textContent);
  }
}

// ---------- 보스 (서현역 삼성 거점 → 총수)
const BS = { posts: [], down: 0, hq: null, beaten: false, bars: [], armor: new Map(), fabDown: 0, campVal: 0, campTot: 0, fabs: [], met: false, pins: [] };
function pinSprite(txt, bg) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 38px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  const w = Math.min(300, g.measureText(txt).width + 40);
  g.fillStyle = bg; g.beginPath(); g.roundRect((320 - w) / 2, 10, w, 70, 22); g.fill();
  g.beginPath(); g.moveTo(140, 78); g.lineTo(160, 116); g.lineTo(180, 78); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 160, 46);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(70, 28, 1); sp.renderOrder = 12; sp.center.set(0.5, 0.05);
  return sp;
}
function setupBoss() {
  const B = A.city.B;
  const groups = new Map();
  for (const b of B) {
    if (!b.d.sam) continue;
    const k = (b.d.n || b.d.a || 'k' + b.i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  BS.posts = [...groups.values()].map((bs) => {
    const main = bs.reduce((a, b) => (b.vol > a.vol ? b : a));
    const big = main.h >= 60 || main.d.k === 'dept';
    return { bs, main, max: 3, hp: 3, hit: false, down: false, who: big ? 'ceo' : 'manager', nm: main.d.sam_n || main.d.n || '삼성 거점' };
  });
  // 총수 본사: 거점·아파트가 아닌 가장 높은 업무 빌딩 (중심 600m 안)
  const samNames = new Set(BS.posts.flatMap((p) => p.bs.map((b) => b.d.n)).filter(Boolean));
  const cand = B.filter((b) => !b.d.sam && !samNames.has(b.d.n) && ['office', 'officetel', 'dept', 'hotel'].includes(b.d.k) && Math.hypot(b.cx, b.cy) < 600 && b.h >= 40);
  const hq = cand.sort((a, b) => (b.d.k === 'office') - (a.d.k === 'office') || b.h - a.h)[0];
  if (hq) BS.hqB = hq;
}
function showPins() {
  for (const p of BS.pins) A.scene.remove(p);
  BS.pins = [];
  if (!isHome()) return;
  for (const p of BS.posts) {
    const sp = pinSprite('🏢 삼성 거점', '#1d4fa0'); sp.position.set(p.main.cx, p.main.base + p.main.h + 6, -p.main.cy); A.scene.add(sp); p.pin = sp; BS.pins.push(sp);
  }
}
function summonBoss() {
  if (BS.hq || !BS.hqB) return;
  const b = BS.hqB;
  BS.hq = { bs: [b], main: b, max: 5, hp: 5, hit: true, down: false, who: 'boss', nm: '총수 본사', boss: true };
  const sp = pinSprite('👑 총수 본사', '#8a1414'); sp.position.set(b.cx, b.base + b.h + 8, -b.cy); A.scene.add(sp); BS.hq.pin = sp; BS.pins.push(sp);
  A.later(0.5, () => {
    say('boss', '감히 내 거점을…! 본사는 절대 못 무너뜨린다!', 'angry');
    A.banner('👑 총수 등장! 본사를 무너뜨려라');
    A.easeCam({ tx: b.cx, tz: -b.cy, dist: A.IS_TOUCH ? 700 : 600 }, 1.2);
  });
}
const REACT_M = ['우리 매장이…! 본사에 보고해!', '지점장 체면이 말이 아니네…', '보험 처리 되나요?!', '사장님께 연락 드려!'];
const REACT_C = ['내 지점을 건드려? 각오해라!', '이건 그룹에 대한 도전이야!', '총수님께 뭐라고 보고하지…'];
const pickL = (a) => a[Math.floor(Math.random() * a.length)];
function postOf(b) {
  if (BS.hq && BS.hq.bs.includes(b)) return BS.hq;
  return BS.posts.find((p) => p.bs.includes(b));
}

// main.js: knock() 앞 — 튼튼한 건물(거점·본사·팹)은 몇 번 맞아야 무너짐. 남길 높이를 돌려줌.
export function armor(b, keep) {
  if (!A || A.G.state !== 'play') return keep;
  const p = isHome() ? postOf(b) : null;
  if (p && p.main === b && !p.down) {
    p.hit = true;
    if (p.hp > 1) {
      p.hp--;
      return Math.max(keep, Math.min(b.cur * 0.92, b.h * (0.35 + 0.6 * p.hp / p.max)));
    }
    p.hp = 0;
    return 0;   // 마지막 한 방: 통째로 무너짐
  }
  if (b.d.fab) {
    const n = BS.armor.get(b) || 0;
    if (n < 1) { BS.armor.set(b, n + 1); A.popup(new THREE.Vector3(b.cx, b.base + b.h + 10, -b.cy), '팹은 튼튼하다! <em>한 번 더!</em>', 0.1, false, 3); return Math.max(keep, Math.min(b.cur * 0.9, b.h * 0.6)); }
    if (n === 1) { BS.armor.set(b, 2); return 0; }
  }
  return keep;
}

// main.js: applyCut() 안 (missionEvent 앞)
export function onCut(b, full, val, live) {
  if (!A || !live) return;
  if (b.d.co === '005930') BS.campVal += val;
  if (full && b.d.fab) { BS.fabDown++; emit('collect', 'fab:' + MAP); }
  if (full && b.d.co === '005930') BS.facDown = (BS.facDown || 0) + 1;
  if (!isHome()) return;
  const p = postOf(b);
  if (!p) return;
  const at = new THREE.Vector3(p.main.cx, p.main.base + p.main.h + 24, -p.main.cy);
  if (!p.saidHi && !p.boss) { p.saidHi = true; say(p.who, pickL(p.who === 'ceo' ? REACT_C : REACT_M)); }
  if (p.main === b && full && !p.down) {
    p.down = true; p.hp = 0;
    if (p.pin) p.pin.visible = false;
    if (p.boss) {
      BS.beaten = true;
      A.later(0.4, () => { say('boss', '이럴 수가… 공장만은 안 된다…!', 'shock'); A.banner('🏭 공장으로 진격!'); try { A.sfx.fanfare(); } catch (e) { /* 무시 */ } });
      A.popup(at, '총수 본사 함락! <em>공장으로 진격!</em>', 0.2, true, -1);
      if (!PROG.boss) { PROG.boss = true; save(PROG); BS.newUnlock = true; }
      emit('collect', 'lm:hq');
    } else {
      BS.down++; emit('collect', 'lm:post');
      A.popup(at, `거점 함락! <em>${Math.min(BS.down, 3)}/3</em>`, 0.2, true, -1);
      if (BS.down >= 3) summonBoss();
    }
  }
}

// main.js: 미션 풀에 넣을 사업장 미션 (서현역에선 빈 목록)
export function missions(B) {
  if (isHome()) return [];
  const P = [];
  const camp = B.filter((b) => b.d.co === '005930');
  const fabs = B.filter((b) => b.d.fab);
  const ctr = (l) => { let best = l[0], bn = -1; for (const a of l) { let n = 0; for (const b of l) if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < 150) n++; if (n > bn) { bn = n; best = a; } } return best ? { x: best.cx, z: -best.cy } : null; };
  const tot = camp.reduce((s, b) => s + b.price, 0) || 1;
  const bonus = Math.max(3e11, Math.round(tot * 0.01 / 1e11) * 1e11);
  if (fabs.length >= 3) P.push({ id: 'fab3', t: '반도체 팹 3동 무너뜨리기', at: ctr(fabs), bonus, test: () => Math.min(1, BS.fabDown / 3), prog: () => `${Math.min(3, BS.fabDown)}/3` });
  else if (camp.length >= 5) P.push({ id: 'fac5', t: '삼성전자 건물 5채 무너뜨리기', at: ctr(camp), bonus, test: () => Math.min(1, (BS.facDown || 0) / 5), prog: () => `${Math.min(5, BS.facDown || 0)}/5` });
  const PCT = camp.length > 150 ? 15 : 30;
  if (camp.length) P.push({ id: 'camp', t: `캠퍼스 ${PCT}% 부수기`, at: ctr(camp), bonus, test: () => Math.min(1, BS.campVal / tot / (PCT / 100)), prog: () => `${Math.min(PCT, BS.campVal / tot * 100).toFixed(0)}/${PCT}%` });
  return P;
}

// ---------- 라운드
export function init(api) {
  A = api;
  buildDom();
  const go = $('go'); if (go) go.dataset.mpDef = go.textContent;
  if (A.data && A.data.R > 1000) {   // 큰 지도: 안개·카메라 거리 늘림
    const k = A.data.R / 1000;
    if (A.scene.fog) { A.scene.fog.near *= k; A.scene.fog.far *= k; }
    A.camera.far = Math.max(A.camera.far, 8000 * k); A.camera.updateProjectionMatrix();
    A.cam.dist *= k;
  }
  if (isHome()) setupBoss();
  renderPanel();
  window.__maps = { SEL, BS, DAILY: () => DAILY, isDaily, PROG: () => PROG, IDX: () => IDX, setProg(p) { PROG = Object.assign(PROG, p); save(PROG); renderPanel(); }, MAP };
}
export function refreshStart() { renderPanel(); }
export function start() {
  CUR = SEL.mode === 'camp' && IDX.stages[SEL.stage] && IDX.stages[SEL.stage].map === MAP ? Object.assign({ k: SEL.stage }, IDX.stages[SEL.stage]) : null;
  Object.assign(BS, { down: 0, beaten: false, fabDown: 0, facDown: 0, campVal: 0, met: false, newUnlock: false });
  BS.armor = new Map();
  if (BS.hq && BS.hq.pin) A.scene.remove(BS.hq.pin);
  BS.hq = null;
  for (const p of BS.posts) Object.assign(p, { hp: p.max, hit: false, down: false, saidHi: false });
  for (const el of BS.bars) el.remove(); BS.bars = [];
  showPins();
  if (CUR && CUR.boss) summonBoss();
  const st = $('mpStage'); if (st) { st.classList.toggle('hidden', !CUR); st.classList.remove('ok'); }
  if (CUR) A.later(0.3, () => A.banner(`${CUR.k + 1}단계 · ${CUR.t}`));
  else if (isDaily()) A.later(0.3, () => A.banner(`📅 오늘의 동네 · ${INFO.short}`));
  emit('collect', 'map:' + MAP);
  const r = $('mpRes'); if (r) r.className = 'hidden';
}
function met() {
  if (!CUR) return false;
  if (A.G.price < CUR.price) return false;
  if (CUR.sam && BS.down < CUR.sam) return false;
  if (CUR.boss && !BS.beaten) return false;
  return true;
}
let barT = 0;
export function step(real) {
  if (!A) return;
  if (charT > 0) { charT -= real; if (charT <= 0) { const el = $('mpChar'); if (el) el.className = 'hidden'; } }
  const G = A.G;
  if (CUR && G.state === 'play') {
    const p = Math.min(1, G.price / CUR.price);
    $('mpStBar').style.width = (p * 100).toFixed(1) + '%';
    $('mpStT').textContent = `${CUR.k + 1}단계 · ${CUR.t}`;
    $('mpStTime').textContent = `남은 ${Math.max(0, Math.ceil(G.time))}초`;
    $('mpStP').textContent = `${won(Math.min(G.price, CUR.price))} / ${won(CUR.price)} (${(p * 100).toFixed(0)}%)`;
    const x = [];
    if (CUR.sam) x.push(`거점 ${Math.min(BS.down, CUR.sam)}/${CUR.sam}`);
    if (CUR.boss) x.push(BS.beaten ? '본사 ✔' : '본사 ✘');
    $('mpStX').textContent = x.join(' · ');
    $('mpStPct').textContent = `${(p * 100).toFixed(0)}%${x.length ? ' · ' + x.join(' · ') : ''}`;
    if (!BS.met && met()) { BS.met = true; $('mpStage').classList.add('ok'); A.banner('🎯 목표 달성! 남은 시간 동안 더 부숴요'); try { A.sfx.fanfare(); } catch (e) { /* 무시 */ } }
  }
  // 체력 막대 (맞은 거점·본사)
  barT -= real;
  if (barT <= 0 && isHome()) {
    barT = 0.05;
    const act = (G.state === 'play' ? [BS.hq, ...BS.posts] : []).filter((p) => p && p.hit && !p.down).slice(0, 3);
    while (BS.bars.length < act.length) { const el = document.createElement('div'); el.className = 'mpBar'; document.body.appendChild(el); BS.bars.push(el); }
    BS.bars.forEach((el, i) => {
      const p = act[i];
      if (!p) { el.style.display = 'none'; return; }
      const s = A.screenOf(p.main.cx, p.main.base + p.main.h + 32, -p.main.cy);
      el.style.display = ''; el.className = 'mpBar' + (p.boss ? ' boss' : '');
      el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
      const html = `${p.boss ? '👑 총수 본사' : '🏢 ' + esc(p.nm)} · ${FIG[p.who].nm}<div class="hp">${Array.from({ length: p.max }, (_, j) => `<i class="${j < p.hp ? '' : 'x'}"></i>`).join('')}</div>`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
    });
  }
}
// main.js: endRound() — 끝 화면에 단계 결과
export function end() {
  for (const el of BS.bars) el.style.display = 'none';
  const r = $('mpRes'); if (!r) return;
  const unlockTxt = BS.newUnlock ? '<div class="mpSub">🏭 삼성전자 공장 지도가 열렸어요! (자유 모드에서도 고를 수 있어요)</div>' : '';
  if (!CUR) { r.className = BS.newUnlock ? 'ok' : 'hidden'; r.innerHTML = BS.newUnlock ? `<b>공장으로 진격!</b>${unlockTxt}` : ''; return; }
  const ok = BS.met || met();   // 판 중에 한 번이라도 달성 (상점에서 쓴 돈은 안 빼고)
  const k = CUR.k;
  if (ok && k + 1 > PROG.cleared) { PROG.cleared = Math.min(IDX.stages.length, k + 1); if (k >= 2) PROG.boss = true; save(PROG); }
  const next = IDX.stages[k + 1];
  r.className = ok ? 'ok' : '';
  r.innerHTML = ok
    ? `<b>${k + 1}단계 클리어!</b><div class="mpSub">${esc(CUR.t)}</div>${unlockTxt}${next ? `<button id="mpNext">다음 단계 ▶ ${esc(next.t)}</button>` : '<div class="mpSub">모든 단계를 깼어요! 🏆</div>'}`
    : `<b>아쉬워요!</b><div class="mpSub">${esc(CUR.t)} — ${won(A.G.price)} / ${won(CUR.price)}${CUR.sam ? ` · 거점 ${BS.down}/${CUR.sam}` : ''}${CUR.boss ? (BS.beaten ? ' · 본사 ✔' : ' · 본사 ✘') : ''}</div>${unlockTxt}<button id="mpRetry">다시 도전</button>`;
  const nb = $('mpNext');
  if (nb) nb.onclick = (e) => { e.stopPropagation(); SEL.stage = k + 1; SEL.mode = 'camp'; if (next.map !== MAP) navigate(next.map, 'camp', k + 1); else { A.again(); } };
  const rb = $('mpRetry');
  if (rb) rb.onclick = (e) => { e.stopPropagation(); A.again(); };
  renderPanel();
}
