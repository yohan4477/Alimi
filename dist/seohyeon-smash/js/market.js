// 서현역 부수기 — 게임 속 가상 주가 · 회장님 · 보복 미사일
// 실제 회사 시세(market.json)를 출발점으로 쓰지만, 게임 안의 주가 변동은 전부 가상이다.
// 회장님·사장님은 지어낸 만화 인물 (실존 인물 아님).
import * as THREE from 'three';
import { emit } from './bus.js';

const CFG = {
  dropPerShare: 60, maxDrop: 30, floor: -90, recover: 0.2,      // %, %/s
  crashDrop: 10, crashTotal: -25,
  chairCool: 6, chairDur: 1.8,
  maxWaves: 3, countdown: 3, travel: 3.0,
  icBase: 2.5e11, icStep: 5e10,                                 // 날아오는 미사일 직접 탭 요격 (급하니 비쌈)
};
// 방어 상점 (점수 = 부순 집값으로 삼). 한 판 점수는 대략 1~15조.
const SHOP = [
  { id: 'ic', ic: '🎯', nm: '요격 미사일', ds: '다음 미사일 자동 요격 · 1발', cost: 1.5e11 },
  { id: 'sh', ic: '🛡', nm: '방패', ds: '집이 1번 맞아도 버팀', cost: 3e11 },
  { id: 'dome', ic: '🔰', nm: '철벽 돔', ds: '보복 한 번을 통째로 막음', cost: 1.5e12 },
  { id: 'fix', ic: '🔧', nm: '수리', ds: '부서진 우리 집 복구', cost: 5e11 },
];
const REACT = ['아니 우리 건물이…!', '주주님들 죄송합니다…', '보험 들어놨나?!', '비서실장 불러!', '내 주식…', '오늘 주총 어떡해…', '이게 무슨 일이야!'];
const ORDER = ['미사일 사 와!', '당장 반격해!', '보복이다! 미사일 주문해!', '저 집 가만 안 둬!'];

let A = null;            // main.js 가 넘긴 것들
let M = null;            // market.json
const S = { cos: [], byB: new Map(), capLost: 0, chairT: 0, chairCool: 0, crashT: 0, waves: [], wavesN: 0, missiles: [], shots: 0, blocked: 0,
  spent: 0, bought: 0, inv: { ic: 0, sh: 0, dome: 0 }, buys: { ic: 0, sh: 0, dome: 0, fix: 0 }, queue: [], lastB: null, zone: null, histT: 0, quiet: false, lossTotal: 0 };
const $ = (id) => document.getElementById(id);
const pct = (c) => c.pct;
const fmtPct = (p) => (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1) + '%';

// ---------- 시작
export async function init(api) {
  A = api;
  try { M = await (await fetch('market.json', { cache: 'no-store' })).json(); } catch (e) { M = { companies: [] }; }
  for (const c of M.companies || []) {
    const blds = c.buildings.map((i) => A.city.B[i]).filter(Boolean);
    if (!blds.length) continue;
    const tot = blds.reduce((s, b) => s + (b.price || b.vol * 4e6), 0) || 1;
    const co = { ...c, blds, tot, pct: 0, hist: [], hits: 0, lost: 0, pend: 0, pendT: -1, crashed: false, retal: false, flashT: 0, worst: 0 };
    S.cos.push(co);
    for (const b of blds) { if (!S.byB.has(b.i)) S.byB.set(b.i, []); S.byB.get(b.i).push(co); }
  }
  buildDom();
  return S.cos.length;
}

function buildDom() {
  const d = document.createElement('div');
  d.innerHTML = `
  <div id="mkTicker" class="hidden"><div class="mkHead"><span>📉 가상 주가</span><b id="mkCap">날린 시총 0</b></div><ul id="mkList"></ul>
    <div class="mkNote">게임 속 가상 주가 — 실제 주가와 무관</div></div>
  <div id="mkCrash" class="hidden"><div class="t"><b>폭락!</b> <span id="mkCrName"></span> <em id="mkCrPct"></em></div>
    <svg viewBox="0 0 300 70" preserveAspectRatio="none"><polyline id="mkCrLine" fill="none" stroke="#ff3b30" stroke-width="4" stroke-linejoin="round"/></svg>
    <div class="cap" id="mkCrCap"></div></div>
  <div id="mkChair" class="hidden" role="button" aria-label="닫기"><div class="bub" id="mkSay"></div><div class="who" id="mkWho"></div><div id="mkFig"></div></div>
  <div id="mkCount" class="hidden"></div>
  <div id="mkLayer"></div>
  <div id="mkDef" class="hidden"><button id="mkIc"></button><button id="mkSh"></button></div>
  <div id="mkShop" class="hidden"><div class="hd"><b>🛡 방어 상점</b><span>부순 집값으로 삽니다 · 시간은 계속 가요</span><button id="mkShopX" aria-label="닫기">✕</button></div>
    <ul id="mkShopList"></ul><div id="mkShopMsg"></div></div>`;
  while (d.firstElementChild) document.body.appendChild(d.firstElementChild);
  $('mkChair').addEventListener('pointerdown', (e) => { e.stopPropagation(); hideChair(); });
  $('mkIc').addEventListener('pointerdown', (e) => { e.stopPropagation(); interceptNearest(); });
  $('mkSh').addEventListener('pointerdown', (e) => { e.stopPropagation(); openShop(); });
  $('mkShopX').addEventListener('pointerdown', (e) => { e.stopPropagation(); closeShop(); });
  $('mkShop').addEventListener('pointerdown', (e) => e.stopPropagation());
  // 방어 상점 버튼: HUD 메뉴(☰) 안 (없으면 HUD)
  const row = document.getElementById('hudMenu') || document.getElementById('hud');
  if (row && S.cos.length) { const b = document.createElement('button'); b.id = 'mkShopBtn'; b.className = 'mkShopBtn'; b.textContent = '🛡 방어 상점';
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); openShop(); row.classList && row.id === 'hudMenu' && row.classList.add('hidden'); }); row.prepend(b); }
  // 시작 화면 안내 한 줄
  const note = document.querySelector('#start .note');
  if (note && S.cos.length) { const p = document.createElement('p'); p.className = 'note mkStartNote'; p.textContent = '📉 부순 건물 속 회사 주가가 떨어져요 · 게임 속 가상 주가 — 실제 주가와 무관'; note.after(p); }
  // 끝 화면 줄
  const st = document.querySelector('#end .stats');
  if (st) { const ul = document.createElement('ul'); ul.id = 'mkEnd'; ul.className = 'mkEnd'; st.after(ul); }
}

// ---------- 라운드
export function reset() {
  for (const c of S.cos) Object.assign(c, { pct: 0, hist: [], hits: 0, lost: 0, pend: 0, pendT: -1, crashed: false, retal: false, flashT: 0, worst: 0 });
  clearMissiles();
  if (S.dome) { A.scene.remove(S.dome); S.dome = null; }
  closeShop();
  Object.assign(S, { giftDome: 0, inv: { ic: 0, sh: 0, dome: 0 }, buys: { ic: 0, sh: 0, dome: 0, fix: 0 }, capLost: 0, chairT: 0, chairCool: 0, crashT: 0, waves: [], wavesN: 0, shots: 0, blocked: 0, spent: 0, bought: 0, queue: [], lastB: null, zone: null, lossTotal: 0 });
  hideChair(); $('mkCrash').classList.add('hidden'); $('mkCount').classList.add('hidden'); $('mkDef').classList.add('hidden');
  tickerShow(false); $('mkList').innerHTML = '';
  renderTicker(true);
}
export function end() {
  clearMissiles(); hideChair(); S.queue = []; closeShop();
  $('mkCount').classList.add('hidden'); $('mkDef').classList.add('hidden'); $('mkCrash').classList.add('hidden'); tickerShow(false);
  const ul = $('mkEnd'); if (!ul) return;
  const w = worstCo();
  const li = [];
  if (S.capLost > 0 || (w && w.pct < 0)) li.push(`날린 시가총액 <b>${capTxt(S.capLost)}</b>`);
  if (w && w.worst < 0) li.push(`가장 많이 떨어진 회사 <b>${esc(w.name)} ${fmtPct(w.worst)}</b>`);
  if (S.shots) li.push(`막아낸 보복 <b>${S.blocked}/${S.shots}</b>발 · 요격에 쓴 돈 <b>${A.wonShort(S.spent)}</b>`);
  const bl = SHOP.filter((it) => S.buys[it.id]).map((it) => `${it.nm} ${S.buys[it.id]}`);
  if (bl.length) li.push(`방어 상점 <b>${bl.join(' · ')}</b>`);
  if (S.lossTotal > 0) li.push(`보복 손실 <b>−${A.wonShort(S.lossTotal)}</b>`);
  ul.innerHTML = li.map((x) => `<li>${x}</li>`).join('');
  ul.classList.toggle('hidden', !li.length);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const capTxt = (n) => (n > 0 ? A.wonShort(n) : '0');
function worstCo() { let w = null; for (const c of S.cos) if (c.worst < 0 && (!w || c.worst < w.worst)) w = c; return w; }
export function worstPct() { const w = worstCo(); return w ? w.worst : 0; }
export function summary() { const w = worstCo(); return { capLost: S.capLost, worst: w ? { name: w.name, pct: w.worst } : null, shots: S.shots, blocked: S.blocked, spent: S.spent }; }

// ---------- 미션 (main 의 미션 풀에 넣음)
export function mission() {
  if (!S.cos.length) return null;
  const big = S.cos.slice().sort((a, b) => b.blds.length - a.blds.length)[0];
  const b0 = big.blds[0];
  return { id: 'stock30', t: '주가 −30% 만들기', at: { x: b0.cx, z: -b0.cy }, bonus: 2.5e11,
    test: () => Math.min(1, -worstPct() / 30), prog: () => `${Math.min(30, -worstPct()).toFixed(0)}/30%` };
}

// ---------- 건물 피해 → 주가
export function onCut(b, frac, val) {
  if (S.quiet || A.G.state !== 'play' || !(frac > 0)) return;
  S.lastB = b;
  const list = S.byB.get(b.i); if (!list) return;
  for (const c of list) {
    c.pend += (b.price || b.vol * 4e6) * frac / c.tot;
    if (c.pendT < 0) c.pendT = 0;
  }
}
function flush(c) {
  const drop = Math.min(CFG.maxDrop, c.pend * CFG.dropPerShare);
  c.pend = 0; c.pendT = -1;
  if (drop < 0.05) return;
  const L0 = 1 + c.pct / 100;
  c.pct = Math.max(CFG.floor, c.pct - drop);
  const L1 = 1 + c.pct / 100;
  const lost = c.cap ? c.cap * (L0 - L1) : 0;
  if (!c.hits) c.hist = new Array(10).fill(0);
  c.lost += lost; S.capLost += lost; c.hits++; c.flashT = 1.2;
  c.worst = Math.min(c.worst, c.pct);
  c.hist.push(c.pct);
  tickerShow(true);
  renderTicker(true);
  emit('collect', 'co:' + c.code);
  A.missionPing && A.missionPing();
  const crossed = !c.crashed && c.pct <= CFG.crashTotal;
  if (drop >= CFG.crashDrop || crossed) {
    if (crossed) c.crashed = true;
    crashCard(c, drop, lost);
    const wantRetal = !c.retal && S.wavesN < CFG.maxWaves;
    if (wantRetal) { c.retal = true; S.wavesN++; S.queue.push({ type: 'retal', c, lost: c.lost }); }
    else S.queue.push({ type: 'react', c });
  }
}

// ---------- 시세판 (폰: HUD 작은 칩 「📉 회사 −12%」 → 누르면 펼침)
function tickerShow(on) {
  $('mkTicker').classList.toggle('hidden', !on);
  const ch = $('mkChip'); if (ch) ch.classList.toggle('hidden', !on);
  if (!on) $('mkTicker').classList.remove('open');
}
function spark(c) {
  const h = c.hist.slice(-40); if (h.length < 2) h.unshift(0);
  const lo = Math.min(-5, ...h), W = 64, H = 22;
  return h.map((v, i) => `${(i / (h.length - 1) * W).toFixed(1)},${(v / lo * (H - 2) + 1).toFixed(1)}`).join(' ');
}
let tickT = 0;
function renderTicker(force) {
  const ul = $('mkList'); if (!ul) return;
  const top = S.cos.filter((c) => c.hits).sort((a, b) => a.pct - b.pct).slice(0, 3);
  ul.innerHTML = top.map((c) => `<li class="${c.flashT > 0 ? 'hot' : ''}"><span class="n">${esc(c.name)}</span>
    <svg viewBox="0 0 64 22" preserveAspectRatio="none"><polyline points="${spark(c)}" fill="none" stroke="#ff3b30" stroke-width="2"/></svg>
    <span class="p">${fmtPct(c.pct)}</span></li>`).join('');
  $('mkCap').textContent = S.capLost > 0 ? `날린 시총 ${A.wonShort(S.capLost)}` : '날린 시총 0';
  const ct = $('mkChipT');
  if (ct) { const w = top[0]; const t = w ? `${w.name.length > 6 ? w.name.slice(0, 6) + '…' : w.name} ${fmtPct(w.pct)}` : '가상 주가'; if (ct.textContent !== t) ct.textContent = t; }
}

// ---------- 폭락 카드
function crashCard(c, drop, lost) {
  $('mkCrName').textContent = c.name;
  $('mkCrPct').textContent = fmtPct(c.pct);
  $('mkCrCap').textContent = lost > 0 ? `시총 ${A.wonShort(lost)} 증발` : `이번 한 방 −${drop.toFixed(1)}%`;
  let y = 10; const pts = [];
  for (let i = 0; i <= 30; i++) { y += (i < 8 ? (Math.random() - 0.5) * 8 : Math.random() * 6 - 1); y = Math.max(4, Math.min(66, y)); pts.push(`${i * 10},${y.toFixed(1)}`); }
  const ln = $('mkCrLine'); ln.setAttribute('points', pts.join(' '));
  const el = $('mkCrash'); el.classList.remove('hidden', 'go'); void el.offsetWidth; el.classList.add('go');
  S.crashT = 1.2;
  A.sfx && A.sfx.sad && A.sfx.sad();
}

// ---------- 회장님
const FIG = {
  // 회장님: 은발 + 동그란 안경 + 남색 정장 / 사장님: 대머리 + 콧수염 + 회색 정장 (둘 다 지어낸 만화 인물)
  chair: { hair: '#d9dde3', suit: '#24324a', tie: '#c8281e', bald: false, mus: false },
  boss: { hair: '#4a3626', suit: '#5b6270', tie: '#2f7de1', bald: true, mus: true },
};
function figSvg(v) {
  const f = FIG[v];
  return `<svg viewBox="0 0 160 190" width="150" height="178">
  <path d="M22 190 Q26 128 80 122 Q134 128 138 190Z" fill="${f.suit}"/>
  <path d="M66 124 L80 150 L94 124Z" fill="#fff"/><path d="M76 128 L84 128 L86 160 L80 168 L74 160Z" fill="${f.tie}"/>
  <rect x="70" y="106" width="20" height="20" rx="6" fill="#f1c7a5"/>
  <ellipse cx="80" cy="74" rx="40" ry="44" fill="#f6d2b3"/>
  ${f.bald ? `<path d="M40 70 Q38 92 46 98 L46 72Z M120 70 Q122 92 114 98 L114 72Z" fill="${f.hair}"/>`
    : `<path d="M40 76 Q34 30 80 28 Q128 28 120 78 Q116 52 100 46 Q80 40 60 46 Q44 52 40 76Z" fill="${f.hair}"/>
       <path d="M40 76 Q34 92 44 100 L44 74Z M120 76 Q126 92 116 100 L116 74Z" fill="${f.hair}"/>`}
  <circle cx="64" cy="74" r="11" fill="none" stroke="#222" stroke-width="3"/><circle cx="96" cy="74" r="11" fill="none" stroke="#222" stroke-width="3"/>
  <path d="M75 74 L85 74" stroke="#222" stroke-width="3"/>
  <circle cx="64" cy="75" r="3" fill="#222"/><circle cx="96" cy="75" r="3" fill="#222"/>
  <path d="M54 58 L72 62 M106 58 L88 62" stroke="#333" stroke-width="3" stroke-linecap="round"/>
  ${f.mus ? '<path d="M66 96 Q80 88 94 96 Q80 100 66 96Z" fill="#4a3626"/>' : ''}
  <ellipse cx="80" cy="104" rx="9" ry="6" fill="#7a2a20"/>
  <path d="M126 50 Q132 62 126 66 Q120 62 126 50Z" fill="#7cc8ff"/><path d="M34 60 Q39 70 34 74 Q29 70 34 60Z" fill="#7cc8ff"/>
  <path d="M118 88 Q124 96 118 100 Q112 96 118 88Z" fill="#7cc8ff"/>
  <g transform="rotate(-14 130 120)"><rect x="118" y="86" width="22" height="40" rx="5" fill="#1d2430"/><rect x="121" y="91" width="16" height="28" rx="2" fill="#6fd0ff"/></g>
  <ellipse cx="128" cy="128" rx="11" ry="9" fill="#f1c7a5"/>
  <path d="M8 40 L20 48 M4 60 L18 62 M150 30 L140 40 M156 52 L144 56" stroke="#ff3b30" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}
function showChair(c, line, v) {
  const el = $('mkChair');
  $('mkFig').innerHTML = figSvg(v);
  $('mkWho').textContent = v === 'boss' ? '사장님 (가상 인물)' : '회장님 (가상 인물)';   // 회사 이름을 붙이면 실존 인물을 가리키게 되므로 직함만
  $('mkSay').textContent = line;
  const left = Math.random() < 0.5;
  el.className = left ? 'L' : 'R';
  void el.offsetWidth; el.classList.add('in');
  S.chairT = CFG.chairDur; S.chairCool = CFG.chairCool;
  emit('collect', v === 'boss' ? 'p:ceo' : 'p:chair');
  A.sfx && A.sfx.ding && A.sfx.ding();
}
function hideChair() { const el = $('mkChair'); if (el) el.className = 'hidden'; S.chairT = 0; }

// ---------- 보복
const missileGeo = new THREE.ConeGeometry(2.2, 9, 8).rotateX(Math.PI / 2);
function pickTarget() {
  const B = A.city.B, G = A.G;
  if (G.home >= 0 && !B[G.home].gone) return { b: B[G.home], home: true };
  const o = S.lastB || B[0];
  if (S.zone && !S.zone.gone) return { b: S.zone, home: false };
  const cand = B.filter((b) => !b.gone && b.h > 8 && Math.hypot(b.cx - o.cx, b.cy - o.cy) < 220 && Math.hypot(b.cx - o.cx, b.cy - o.cy) > 50);
  const b = cand.length ? cand[Math.floor(Math.random() * cand.length)] : B.find((x) => !x.gone);
  S.zone = b; return { b, home: false };
}
function startWave(q) {
  const c = q.c;
  const n = Math.max(1, Math.min(5, 1 + Math.floor((q.lost || 0) / 1e12) + (c.pct <= -50 ? 1 : 0)));
  const tg = pickTarget();
  const w = { c, n, tg, t: -CFG.countdown, launched: 0 };
  S.waves.push(w);
  const tk = $('mkTicker'), ch = $('mkChip'); if (tk) tk.classList.remove('open'); if (ch) ch.classList.remove('on');   // 폰: 보복 경고 자리 비움
  countdown(w);
}
function countdown(w) {
  const el = $('mkCount');
  const k = Math.ceil(-w.t);
  el.innerHTML = `🚀 ${esc(w.c.name)} 보복 공격 준비 <b>${k > 0 ? k : '발사!'}</b><small>${w.tg.home ? '🏠 우리 집 조준 중' : '📍 내 구역 조준 중'} · ${w.n}발</small>`;
  el.classList.remove('hidden');
}
function launchMissile(w, i) {
  const b = w.tg.b;
  const to = new THREE.Vector3(b.cx, b.base + Math.max(4, b.cur), -b.cy);
  const a = Math.random() * Math.PI * 2 + i * 0.7;
  const from = to.clone().add(new THREE.Vector3(Math.cos(a) * 300, 200 + Math.random() * 60, Math.sin(a) * 300));
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 110, 0));
  const g = new THREE.Group();
  const body = new THREE.Mesh(missileGeo, new THREE.MeshBasicMaterial({ color: 0xd8261c }));
  body.scale.setScalar(1.6);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowTex, color: 0xff5040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(34);
  g.add(body, glow); g.position.copy(from); A.scene.add(g);
  const el = document.createElement('button');
  el.className = 'mkRet'; el.innerHTML = '<span>요격</span>';
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); intercept(m); });
  $('mkLayer').appendChild(el);
  const m = { w, g, from, mid, to, t: -i * 0.35, dur: CFG.travel, el, b };
  S.missiles.push(m); S.shots++;
  A.sfx && A.sfx.whoosh && A.sfx.whoosh(0.6);
}
function bez(m, t, out) {
  const u = 1 - t;
  return out.set(u * u * m.from.x + 2 * u * t * m.mid.x + t * t * m.to.x, u * u * m.from.y + 2 * u * t * m.mid.y + t * t * m.to.y, u * u * m.from.z + 2 * u * t * m.mid.z + t * t * m.to.z);
}
const icCost = () => CFG.icBase + CFG.icStep * S.bought;
function interceptNearest() {
  let best = null;
  for (const m of S.missiles) if (m.t >= 0 && (!best || m.t > best.t)) best = m;
  if (!best) best = S.missiles[0];
  if (best) intercept(best);
}
function intercept(m) {
  if (!S.missiles.includes(m)) return;
  const cost = icCost();
  if (A.G.price < cost) { flashDef('돈이 모자라요!'); return; }
  A.G.price -= cost; S.spent += cost; S.bought++; S.blocked++;
  A.updateHud();
  boomAt(m.g.position, 0x8fd8ff);
  A.popup(m.g.position.clone(), `요격! <em>−${A.wonShort(cost)}</em>`, 0, false, 0);
  killMissile(m);
}
// ---------- 방어 상점
function homeB() { const G = A.G; return G.home >= 0 ? A.city.B[G.home] : null; }
function canBuy(it) {
  if (A.G.state !== 'play') return '게임 중에만';
  if (it.id === 'fix') { const b = homeB(); if (!b) return '우리 집 없음'; if (!b.gone && b.cur >= b.h - 0.5 && !A.G.homeLost) return '멀쩡함'; }
  if (A.G.price < it.cost) return '돈 모자람';
  return '';
}
function renderShop() {
  $('mkShopList').innerHTML = SHOP.map((it) => {
    const why = canBuy(it), own = it.id === 'fix' ? '' : `<span class="own">보유 ${S.inv[it.id]}</span>`;
    return `<li><span class="ic">${it.ic}</span><span class="tx"><b>${it.nm}</b> ${own}<small>${it.ds}</small></span>
      <button data-id="${it.id}" ${why ? 'disabled' : ''}>${why && why !== '돈 모자람' ? why : A.wonShort(it.cost)}</button></li>`;
  }).join('');
  for (const bt of $('mkShopList').querySelectorAll('button')) bt.addEventListener('pointerdown', (e) => { e.stopPropagation(); buy(bt.dataset.id); });
}
function openShop() { if (A.G.state !== 'play') return; renderShop(); $('mkShop').classList.remove('hidden'); S.shopOpen = true; }
function closeShop() { const el = $('mkShop'); if (el) el.classList.add('hidden'); S.shopOpen = false; }
function buy(id) {
  const it = SHOP.find((x) => x.id === id); if (!it || canBuy(it)) return;
  A.G.price -= it.cost; S.spent += it.cost; S.buys[id]++;
  if (id === 'fix') A.repairHome(); else S.inv[id]++;
  A.updateHud();
  const m = $('mkShopMsg'); m.textContent = `${it.ic} ${it.nm} 구입 −${A.won(it.cost)}`; m.classList.remove('go'); void m.offsetWidth; m.classList.add('go');
  A.sfx && A.sfx.ding && A.sfx.ding();
  renderShop();
}
function domeAt(b, col = 0x6fd0ff) {     // 막을 때 잠깐 보이는 반투명 돔
  if (S.dome) { A.scene.remove(S.dome); S.dome.material.dispose(); }
  const r = Math.max(b.rad * 1.4, 26);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
  mesh.position.set(b.cx, b.base, -b.cy); mesh.scale.y = Math.max(1, (b.cur + 12) / r);
  A.scene.add(mesh); S.dome = mesh; S.domeT = 1.4;
}
let defMsgT = 0;
function flashDef(t) { defMsgT = 1; $('mkIc').dataset.msg = t; $('mkDef').classList.add('poor'); }
function boomAt(p, col = 0xffa040) {
  const f = A.fx(); if (!f.fire) return;
  for (let i = 0; i < 26; i++) f.fire.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, 0.5, 10, 26, 1, 1, col === 0xffa040 ? 0.6 : 0.85, col === 0xffa040 ? 0.25 : 1, 0.9);
  A.rings && A.rings.add(p.x, p.y, p.z, 30, col, 0.6);
}
function killMissile(m) {
  A.scene.remove(m.g); m.g.children[0].material.dispose(); m.g.children[1].material.dispose();
  m.el.remove();
  const i = S.missiles.indexOf(m); if (i >= 0) S.missiles.splice(i, 1);
}
function clearMissiles() { for (const m of S.missiles.slice()) killMissile(m); S.waves = []; const l = $('mkLayer'); if (l) l.innerHTML = ''; }
function missileHit(m) {
  const G = A.G;
  if (m.w.domed || S.inv.sh > 0) {
    const how = m.w.domed ? '🔰 철벽 돔이 막음!' : '🛡 방패가 막음!';
    if (!m.w.domed) S.inv.sh--;
    S.blocked++;
    domeAt(m.b, m.w.domed ? 0xffd24a : 0x6fd0ff);
    boomAt(m.g.position, 0x8fd8ff);
    A.popup(m.g.position.clone(), how, 0, false, 0);
    killMissile(m); if (S.shopOpen) renderShop(); return;
  }
  const loss = Math.min(Math.max(0, G.price), 1e11 + (m.w.c.lost || 0) * 0.01);
  G.price -= loss; S.lossTotal += loss;
  killMissile(m);
  if (!m.b.gone) { S.quiet = true; try { A.enemyStrike(m.b); } finally { S.quiet = false; } }
  else boomAt(m.to);
  A.popup(m.to.clone().add(new THREE.Vector3(0, 30, 0)), `보복 손실 <em>−${A.won(loss)}</em>`, 0.1, true, 1);
  A.updateHud();
}

// ---------- 매 프레임
const _v = new THREE.Vector3(), _p = new THREE.Vector3();
export function step(real, dt) {
  if (!A || A.G.state !== 'play') return;
  for (const c of S.cos) {
    if (c.pendT >= 0) { c.pendT += real; if (c.pendT > 0.15) flush(c); }
    if (c.flashT > 0) c.flashT -= real;
    if (c.pct < 0 && c.pend === 0) c.pct = Math.min(0, c.pct + CFG.recover * dt);
  }
  S.histT += real;
  if (S.histT > 0.25) { S.histT = 0; for (const c of S.cos) if (c.hits) { c.hist.push(c.pct); if (c.hist.length > 60) c.hist.shift(); } renderTicker(); }
  // 회장님
  if (S.chairCool > 0) S.chairCool -= real;
  if (S.chairT > 0) { S.chairT -= real; if (S.chairT <= 0) hideChair(); }
  if (S.queue.length && S.chairCool <= 0 && S.crashT <= 0.6) {
    const q = S.queue.shift();
    if (q.type === 'retal') {
      showChair(q.c, ORDER[Math.floor(Math.random() * ORDER.length)], q.c.cap > 1e13 ? 'chair' : 'boss');
      startWave(q);
    } else {
      showChair(q.c, REACT[Math.floor(Math.random() * REACT.length)], q.c.cap > 1e13 ? 'chair' : 'boss');
      S.queue = S.queue.filter((x) => x.type === 'retal');   // 반응은 하나만
    }
  }
  if (S.crashT > 0) { S.crashT -= real; if (S.crashT <= 0) $('mkCrash').classList.add('hidden'); }
  // 보복 대기열
  for (let i = S.waves.length - 1; i >= 0; i--) {
    const w = S.waves[i];
    const before = Math.ceil(-w.t);
    w.t += real;
    if (w.t < 0) { if (Math.ceil(-w.t) !== before) countdown(w); continue; }
    if (!w.launched) { w.launched = 1; if (S.inv.dome > 0) { S.inv.dome--; w.domed = true; A.banner('🔰 철벽 돔 가동!'); emit('collect', 'a:dome'); if (S.giftDome > 0) { S.giftDome--; emit('gift-used', 'dome'); } } countdown(w); for (let k = 0; k < w.n; k++) launchMissile(w, k); setTimeout(() => $('mkCount').classList.add('hidden'), 700); }
    if (!S.missiles.some((m) => m.w === w)) S.waves.splice(i, 1);
  }
  // 미사일
  for (const m of S.missiles.slice()) {
    m.t += real;
    if (m.t < 0) { m.g.visible = false; m.el.style.display = 'none'; continue; }
    m.g.visible = true; m.el.style.display = '';
    const k = Math.min(1, m.t / m.dur);
    _p.copy(m.g.position);
    bez(m, k, m.g.position);
    m.g.lookAt(_v.copy(m.g.position).add(_p.sub(m.g.position).multiplyScalar(-1)));
    const f = A.fx();
    if (f.smoke) for (let s = 0; s < 2; s++) f.smoke.emit(m.g.position.x, m.g.position.y, m.g.position.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1.4, 5, 16, 0.6, 0.95, 0.92, 0.9, 0.9);
    if (f.fire) f.fire.emit(m.g.position.x, m.g.position.y, m.g.position.z, 0, 0, 0, 0.18, 9, 4, 1, 1, 0.45, 0.2, 0.9);
    const sc = A.screenOf(m.g.position.x, m.g.position.y, m.g.position.z);
    m.el.style.transform = `translate(${sc.x - 28}px, ${sc.y - 28}px)`;
    if (k >= 0.55 && !m.w.domed && S.inv.ic > 0 && !m.auto) { m.auto = 1; S.inv.ic--; S.blocked++; boomAt(m.g.position, 0x8fd8ff);
      A.popup(m.g.position.clone(), '🎯 자동 요격!', 0, false, 0); killMissile(m); if (S.shopOpen) renderShop(); continue; }
    if (k >= 1) missileHit(m);
  }
  // 방어 버튼
  const active = S.missiles.length > 0 || S.waves.length > 0;
  const def = $('mkDef');
  def.classList.toggle('hidden', !active);
  if (active) {
    const cost = icCost(), G = A.G;
    if (defMsgT > 0) { defMsgT -= real; if (defMsgT <= 0) def.classList.remove('poor'); }
    $('mkIc').innerHTML = defMsgT > 0 ? `<b>${$('mkIc').dataset.msg}</b>` : `🎯 요격 <small>${A.wonShort(cost)}</small>`;
    $('mkIc').disabled = G.price < cost || !S.missiles.length;
    const inv = S.inv;
    $('mkSh').innerHTML = `🛡 상점 <small>${inv.dome ? '돔' + inv.dome + ' ' : ''}${inv.ic ? '요격' + inv.ic + ' ' : ''}${inv.sh ? '방패' + inv.sh : ''}</small>`;
  }
  if (S.domeT > 0) { S.domeT -= real; if (S.domeT <= 0 && S.dome) { A.scene.remove(S.dome); S.dome.material.dispose(); S.dome = null; } }
  if (S.shopOpen) { S.shopRT = (S.shopRT || 0) + real; if (S.shopRT > 0.5) { S.shopRT = 0; renderShop(); } }
  // 내 구역 표시
  const z = S.zone && S.waves.some((w) => !w.tg.home) ? S.zone : null;
  let zm = $('mkZone');
  if (z) {
    if (!zm) { zm = document.createElement('div'); zm.id = 'mkZone'; zm.textContent = '📍 내 구역'; $('mkLayer').appendChild(zm); }
    const sc = A.screenOf(z.cx, z.base + z.cur + 10, -z.cy);
    zm.style.transform = `translate(${Math.max(6, Math.min(innerWidth - 86, sc.x - 40))}px, ${Math.max(150, Math.min(innerHeight - 160, sc.y - 30))}px)`;
  } else if (zm) zm.remove();
}

// 출석 선물 돔: 판 시작 때 넣어 줌 (실제로 쓰였을 때만 선물 하나를 씀)
export function addGiftDome(n) { if (!(n > 0)) return; S.inv.dome += n; S.giftDome = n; }
export const hasMarket = () => S.cos.length > 0;
// 검사용
export const _S = S;
export { openShop, buy as _buy };
export function _crash(code, drop = 15) { const c = S.cos.find((x) => x.code === code) || S.cos[0]; c.pend = drop / CFG.dropPerShare; flush(c); }
