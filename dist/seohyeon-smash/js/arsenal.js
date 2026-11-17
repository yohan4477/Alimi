// 서현역 부수기 — K-무기고 (국산 무기를 만화 도형으로 · 게임 속 가상 효과)
// 실제 부대 표식 없음, 작은 태극 원만. 방산주 오름은 게임 속 가상 주가.
import * as THREE from 'three';
import { Models, shoot, boom, roundelSprite } from './war.js';

let A = null, BASE = null;
const $ = (id) => document.getElementById(id);
const rnd = (s) => (Math.random() - 0.5) * 2 * s;
const JO = 1e12;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 회사 (상장 코드는 가상 주가 연동용)
const MAKERS = [
  { id: 'hanwha', nm: '한화에어로스페이스', code: '012450' },
  { id: 'rotem', nm: '현대로템', code: '064350' },
  { id: 'kai', nm: 'KAI(한국항공우주)', code: '047810' },
  { id: 'lig', nm: 'LIG넥스원', code: '079550' },
  { id: 'ocean', nm: '한화오션 · HD현대중공업', code: '042660', code2: '329180' },
  { id: 'kia', nm: '기아', code: '000270' },
  { id: 'add', nm: '국방과학연구소 개발', code: null },
];
// kind: arty(탭 포격) line(드래그 일제 사격) drive(지상 차량) jet(드래그 폭격) heli(헬기) cruise(정밀) sub(잠수함) big(대형) passive
// 값은 [Lv1, Lv2, Lv3]
const KW = [
  { id: 'k9', mk: 'hanwha', nm: 'K9 자주포', sn: 'K9', ic: 'K9', kind: 'arty', n: [3, 4, 5], R: [16, 19, 22], cd: [4, 3.5, 3], price: 3, ds: '탭 → 포탄 연속 사격' },
  { id: 'chunmoo', mk: 'hanwha', nm: '천무 다연장', sn: '천무', ic: '천무', kind: 'line', n: [8, 10, 12], R: [14, 16, 18], cd: [7, 6, 5], price: 6, ds: '드래그 → 선 따라 로켓 일제 사격' },
  { id: 'redback', mk: 'hanwha', nm: '레드백 장갑차', sn: '레드백', ic: '레드백', kind: 'drive', model: 'redback', speed: 45, fire: 0.35, range: 70, life: 5, R: [7, 8, 9], cd: [8, 7, 6], price: 4, ds: '탭 쪽으로 달리며 기관포 연사' },
  { id: 'k10', mk: 'hanwha', nm: 'K10 탄약운반차', sn: 'K10', ic: 'K10', kind: 'passive', n: [2, 3, 4], cdm: [0.85, 0.75, 0.65], price: 3, ds: '장착하면 시작 때 탄 보급 + 재장전 단축' },
  { id: 'k2', mk: 'rotem', nm: 'K2 전차', sn: 'K2', ic: 'K2', kind: 'drive', model: 'k2', speed: 35, fire: 0.9, range: 90, life: 6, R: [14, 16, 18], cd: [9, 8, 7], price: 5, ds: '탭 쪽으로 전진하며 주포 사격' },
  { id: 'k808', mk: 'rotem', nm: 'K808 차륜형장갑차', sn: 'K808', ic: 'K808', kind: 'drive', model: 'k808', speed: 90, fire: 0.5, range: 60, life: 4, R: [8, 9, 10], cd: [6, 5, 4], price: 2, ds: '빠르게 달려가며 사격' },
  { id: 'kf21', mk: 'kai', nm: 'KF-21 보라매', sn: 'KF-21', ic: 'KF21', kind: 'jet', n: [6, 8, 10], R: [16, 18, 20], cd: [8, 7, 6], price: 8, speed: 300, ds: '드래그 → 선 따라 폭격' },
  { id: 'fa50', mk: 'kai', nm: 'FA-50 경공격기', sn: 'FA-50', ic: 'FA50', kind: 'jet', n: [4, 5, 6], R: [13, 15, 17], cd: [5, 4.5, 4], price: 4, speed: 260, ds: '드래그 → 가벼운 폭격' },
  { id: 'surion', mk: 'kai', nm: '수리온 헬기', sn: '수리온', ic: '수리온', kind: 'heli', n: [6, 8, 10], R: [10, 12, 14], cd: [8, 7, 6], price: 5, ds: '탭 → 떠서 로켓 포드 사격' },
  { id: 'cheongung', mk: 'lig', nm: '천궁 요격', sn: '천궁', ic: '천궁', kind: 'passive', ic2: 0.5, p: [0.5, 0.7, 0.9], cf: [0.6, 0.45, 0.3], icd: [3, 2, 1.5], price: 5, ds: '장착하면 보복·폭격 자동 요격, 방어군 요격률 ↓' },
  { id: 'haesung', mk: 'lig', nm: '해성 순항미사일', sn: '해성', ic: '해성', kind: 'cruise', R: [10, 12, 14], cd: [5, 4, 3.5], price: 6, far: 700, ds: '탭 → 낮게 날아 건물 하나 정밀 타격' },
  { id: 'hyungung', mk: 'lig', nm: '현궁 대전차미사일', sn: '현궁', ic: '현궁', kind: 'cruise', R: [7, 8, 9], cd: [3, 2.5, 2], price: 2, far: 180, top: true, ds: '탭 → 위에서 내리꽂는 정밀 한 발' },
  { id: 'bigung', mk: 'lig', nm: '비궁 유도로켓', sn: '비궁', ic: '비궁', kind: 'arty', salvo: true, n: [6, 8, 10], R: [8, 9, 10], cd: [5, 4.5, 4], price: 3, ds: '탭 → 작은 유도로켓 일제 사격' },
  { id: 'kss3', mk: 'ocean', nm: 'KSS-III 잠수함', sn: 'KSS-III', ic: 'KSS', kind: 'sub', n: [2, 3, 4], R: [16, 18, 20], cd: [10, 9, 8], price: 8, ds: '탭 → 탄천에서 떠올라 미사일 발사 (물 있는 지도)' },
  { id: 'jeongjo', mk: 'ocean', mk2: 'hd', nm: '정조대왕함 이지스', sn: '정조대왕', ic: '이지스', kind: 'passive', p: [0.4, 0.55, 0.7], cf: [0.8, 0.7, 0.6], icd: [4, 3, 2.5], strike: [10, 8, 6], R: [15, 17, 19], price: 12, ds: '장착하면 먼 바다에서 요격 + 주기적 타격' },
  { id: 'kltv', mk: 'kia', nm: '소형전술차량 KLTV', sn: 'KLTV', ic: 'KLTV', kind: 'drive', model: 'kltv', speed: 120, fire: 0.6, range: 55, life: 3.5, R: [6, 7, 8], cd: [4, 3.5, 3], price: 1, ds: '싸고 빠른 기습' },
  { id: 'hyunmoo', mk: 'add', nm: '현무 탄도미사일', sn: '현무', ic: '현무', kind: 'big', R: [60, 72, 85], cd: [25, 20, 16], price: 10, ds: '탭 → 3초 뒤 초대형 한 방 (재장전 김)' },
];
const KIND_IC = { arty: '💥', line: '🎇', drive: '🛞', jet: '✈️', heli: '🚁', cruise: '🎯', sub: '🌊', big: '🔥' };
const PAS_IC = { k10: '📦', cheongung: '🛡️', jeongjo: '⚓' };
const STAGE = { k808: 1, kltv: 1, hyungung: 1, k9: 2, bigung: 2, fa50: 2, k10: 2, k2: 3, redback: 3, surion: 3, haesung: 3, chunmoo: 4, kf21: 4, kss3: 4, cheongung: 4, jeongjo: 5, hyunmoo: 5 };
for (const w of KW) { w.stage = STAGE[w.id]; w.chip = PAS_IC[w.id] || KIND_IC[w.kind] || '★'; w.badge = w.ic; w.ic = w.chip; w.k = true; w.need = undefined; w.best = w.price * JO * 0.8; w.cond = ''; w.hint = w.ds; }
const byId = (id) => KW.find((w) => w.id === id) || (BASE && BASE.find((w) => w.id === id));
const DEF_EQUIP = ['meteor', 'quake', 'laser', 'stomp'];
const KEY = 'seohyeon-smash-ark';

// ---------- 저장
const P = { lv: {}, spent: 0, equip: DEF_EQUIP.slice() };
function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.assign(P, o); if (!Array.isArray(P.equip) || P.equip.length !== 4) P.equip = DEF_EQUIP.slice(); } catch (e) { /* 무시 */ } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* 무시 */ } }
const points = () => (A.DEBUG ? 999 * JO : Math.max(0, A.totalGet() - P.spent));
// 캠페인 진행 (maps.js 가 저장한 깬 단계 수, 읽기만)
function stage() { try { return Number(JSON.parse(localStorage.getItem('smash-camp-v1') || '{}').cleared || 0); } catch (e) { return 0; } }
export function lvl(id) {
  const w = KW.find((x) => x.id === id); if (!w) return 0;
  const l = P.lv[id] || 0;
  if (l) return l;
  if (A.DEBUG) return 1;
  if (A.bestGet() >= w.best) return 1;              // 최고 기록으로 무료
  if (w.stage != null && stage() >= w.stage) return 1;
  return 0;
}
const cost = (w, l) => w.price * JO * (l === 0 ? 1 : l === 1 ? 1.5 : 2.5);   // l = 지금 레벨
const V = (w, key) => w[key][Math.max(0, lvl(w.id) - 1)];

// ---------- 상태 (판마다)
const S = { cd: {}, ops: [], stock: {}, icT: 0, aeT: 0, strikeT: 0, ship: null, cdMul: 1, uses: 0 };
const equipped = (id) => P.equip.includes(id) && lvl(id) > 0;

// ---------- 무기 바 (main.renderWeapons 가 부름)
let sel = null, unlockedFn = null;
export function render(el, WEAPONS, unlocked, select) {
  unlockedFn = unlocked; sel = select;
  el.innerHTML = ''; el.classList.add('ar');
  const G = A.G;
  for (const id of P.equip) {
    const w = byId(id); if (!w) continue;
    const b = document.createElement('button');
    if (w.k) {
      const l = lvl(id), pas = w.kind === 'passive';
      b.className = 'wp kw' + (G.weapon === id ? ' on' : '') + (l ? '' : ' locked') + (pas ? ' pas' : '');
      b.innerHTML = `<span class="ic">${w.chip}</span><span class="nm">${w.sn}</span><span class="lv">${l ? (pas ? '자동 · ' : '') + 'Lv' + l : '🔒'}</span><i class="cdv"></i>`;
      b.dataset.id = id;
      b.onclick = (e) => {
        e.stopPropagation();
        if (!l) { openSheet(); return; }
        if (pas) { A.banner(`${w.sn}: ${w.ds}`); return; }
        select(id);
      };
    } else {
      const ok = unlocked(w);
      b.className = 'wp' + (G.weapon === w.id ? ' on' : '') + (ok ? '' : ' locked');
      b.innerHTML = `<span class="ic">${w.ic}</span><span class="nm">${w.nm}</span>${ok ? '' : `<span class="lk">🔒 ${w.cond}</span>`}`;
      b.onclick = (e) => { e.stopPropagation(); if (!ok) { A.banner(`🔒 ${w.cond} 달성 시 열림`); return; } select(w.id); };
    }
    el.appendChild(b);
  }
  const ab = document.createElement('button'); ab.className = 'wp arBtn'; ab.innerHTML = '<span class="ic kic">K</span><span class="nm">무기고</span>';
  ab.onclick = (e) => { e.stopPropagation(); openSheet(); }; el.appendChild(ab);
  return true;
}
function chipCd() {
  for (const b of document.querySelectorAll('#weapons .kw')) {
    const c = S.cd[b.dataset.id] || 0, i = b.querySelector('.cdv');
    if (i) { i.style.height = c > 0 ? Math.min(100, c / (V(byId(b.dataset.id), 'cd') * S.cdMul) * 100) + '%' : '0'; i.textContent = c > 0.05 ? Math.ceil(c) : ''; }
  }
}

// ---------- 무기고 시트
let slotSel = 3;
function openSheet() { renderSheet(); $('arSheet').classList.remove('hidden'); }
function closeSheet() { $('arSheet').classList.add('hidden'); A.renderWeapons(); }
function renderSheet() {
  const sh = $('arSheet');
  const slots = P.equip.map((id, i) => { const w = byId(id); return `<button class="slot ${i === slotSel ? 'sel' : ''}" data-slot="${i}"><span class="kic">${w ? (w.k ? w.badge : w.ic) : '?'}</span>${w ? esc(w.sn || w.nm) : '-'}</button>`; }).join('');
  let h = `<div class="hd"><b>K-무기고</b><span>잔고 <em>${A.DEBUG ? '시험 모드' : A.wonShort(points())}</em> · 누적 부순 집값으로 삼</span><button class="x" aria-label="닫기">✕</button></div>
    <div class="slots"><small>장착 칸 (눌러서 고른 뒤 아래에서 「장착」)</small><div class="sl">${slots}</div></div><div class="list">`;
  const baseRows = BASE.map((w) => {
    const ok = unlockedFn ? unlockedFn(w) : true, on = P.equip.includes(w.id);
    return `<li><span class="kic b">${w.ic}</span><span class="tx"><b>${w.nm}</b><small>${ok ? esc(w.hint) : '🔒 ' + w.cond + ' 달성 시 열림'}</small></span>
      <span class="bt">${ok ? `<button data-eq="${w.id}" ${on ? 'disabled' : ''}>${on ? '장착됨' : '장착'}</button>` : ''}</span></li>`;
  }).join('');
  h += `<section><h4>기본 무기</h4><ul>${baseRows}</ul></section>`;
  for (const m of MAKERS) {
    const list = KW.filter((w) => w.mk === m.id); if (!list.length) continue;
    h += `<section><h4><span class="mkb">${esc(m.nm)}</span>${m.code ? `<small>${m.code}${m.code2 ? ' · ' + m.code2 : ''} · 방산주</small>` : ''}</h4><ul>`;
    for (const w of list) {
      const l = lvl(w.id), on = P.equip.includes(w.id);
      const dots = [1, 2, 3].map((k) => `<i class="${k <= l ? 'y' : ''}"></i>`).join('');
      let buy = '';
      if (l < 3) { const c = cost(w, l), can = points() >= c; buy = `<button data-buy="${w.id}" ${can ? '' : 'disabled'}>${l ? '강화 Lv' + (l + 1) : '구매'} <small>${A.DEBUG ? '무료' : A.wonShort(c)}</small></button>`; }
      const free = !l ? `<em class="free">${w.stage}단계 깨거나 최고 ${A.wonShort(w.best)} 달성 시 무료</em>` : '';
      h += `<li><span class="kic">${w.badge}</span><span class="tx"><b>${w.nm}</b> <span class="dots">${dots}</span><small>${esc(w.ds)}</small>${free}</span>
        <span class="bt">${buy}${l ? `<button data-eq="${w.id}" ${on ? 'disabled' : ''}>${on ? '장착됨' : '장착'}</button>` : ''}</span></li>`;
    }
    h += '</ul></section>';
  }
  h += '</div><p class="arNote">국산 무기 이름만 빌린 만화 도형 · 방산주 오름은 게임 속 가상 주가</p>';
  sh.innerHTML = h;
  sh.querySelector('.x').onclick = (e) => { e.stopPropagation(); closeSheet(); };
  for (const b of sh.querySelectorAll('[data-slot]')) b.onclick = (e) => { e.stopPropagation(); slotSel = +b.dataset.slot; renderSheet(); };
  for (const b of sh.querySelectorAll('[data-eq]')) b.onclick = (e) => { e.stopPropagation(); equip(b.dataset.eq); };
  for (const b of sh.querySelectorAll('[data-buy]')) b.onclick = (e) => { e.stopPropagation(); buy(b.dataset.buy); };
}
function equip(id) {
  const old = P.equip[slotSel];
  P.equip[slotSel] = id; save();
  if (A.G.weapon === old) A.G.weapon = byId(id).kind === 'passive' ? 'meteor' : id;
  if (A.G.state === 'play' && id === 'k10' && !S.k10Given) giveK10();
  slotSel = (slotSel + 1) % 4;
  renderSheet(); A.renderWeapons();
}
function buy(id) {
  const w = KW.find((x) => x.id === id), l = lvl(id); if (!w || l >= 3) return;
  const c = cost(w, l);
  if (points() < c) return;
  if (!A.DEBUG) P.spent += c;
  P.lv[id] = l + 1; save();
  A.sfx && A.sfx.ding && A.sfx.ding();
  renderSheet(); A.renderWeapons();
}

// ---------- 방산주 (가상)
function bump(w, pct) {
  const m = MAKERS.find((x) => x.id === w.mk); if (!m || !m.code) return;
  const codes = [m.code]; if (w.mk2) { const m2 = MAKERS.find((x) => x.id === w.mk2); if (m2) codes.push(m2.code); } else if (m.code2) codes.push(m.code2);
  let used = false;
  if (A.MK && typeof A.MK.bump === 'function') { try { for (const c of codes) A.MK.bump(c, pct); used = true; } catch (e) { used = false; } }
  S.stock[m.id] = (S.stock[m.id] || 0) + pct;
  if (!used) {
    const el = $('arStock');
    el.innerHTML = `📈 방산주 ↑ <b>${esc(m.nm.split(' ·')[0])}</b> <em>+${S.stock[m.id].toFixed(1)}%</em> <small>가상</small>`;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  }
}

// ---------- 발사 지점
const _v = new THREE.Vector3();
function camDir() { const p = A.camera.position; const d = new THREE.Vector3(p.x - A.cam.tx, 0, p.z - A.cam.tz); return d.lengthSq() ? d.normalize() : d.set(0, 0, 1); }
function homePos() {
  const G = A.G, B = A.city.B;
  if (G.home >= 0) { const b = B[G.home]; return new THREE.Vector3(b.cx, b.base + b.h + 8, -b.cy); }
  return null;
}
function rearPos(p, dist, h = 20) {   // 화면 아래쪽(카메라 쪽) 뒤편
  const hp = homePos(); if (hp && hp.distanceTo(p) < 700 && hp.distanceTo(p) > 60) return hp;
  const d = camDir(); const q = p.clone().addScaledVector(d, dist); q.y = A.groundAt(q.x, q.z) + h; return q;
}
function hit(w, p, R, label, blockable) {
  if (blockable && A.war && A.war.blockMeteor(p)) return 0;
  if (A.G.state !== 'play') { boom(p); return 0; }
  return A.blast(p, R, { light: true, score: { verb: label + '!', partVerb: label + '!', chain: true } }) || 0;
}
function bldAt(p, r = 40) {
  let best = null, bd = 1e9;
  for (const b of A.city.B) { if (b.gone || b.cur < 2) continue; const d = Math.hypot(b.cx - p.x, -b.cy - p.z) - b.rad; if (d < r && d < bd) { bd = d; best = b; } }
  return best;
}
function nearB(p, range) {
  let best = null, bd = 1e9;
  for (const b of A.city.B) { if (b.gone || b.cur < 2) continue; const d = Math.hypot(b.cx - p.x, -b.cy - p.z) - b.rad; if (d < range && d < bd) { bd = d; best = b; } }
  return best;
}
// 물 (city.json 의 파란 땅 층) → 잠수함 자리
let WATER = null;
function water() {
  if (WATER) return WATER;
  WATER = [];
  for (const L of A.data.layers) {
    if (!(L.c[2] > 170 && L.c[0] < 100 && L.z < 1)) continue;
    const v = L.v, t = L.t;
    for (let i = 0; i < t.length; i += 3) { const a = t[i] * 2, b = t[i + 1] * 2, c = t[i + 2] * 2;
      WATER.push(new THREE.Vector3((v[a] + v[b] + v[c]) / 3, 0, -(v[a + 1] + v[b + 1] + v[c + 1]) / 3)); }
  }
  return WATER;
}

// ---------- 모형 풀
const pool = {};
function getModel(key) {
  pool[key] = pool[key] || [];
  let m = pool[key].find((x) => !x.userData.busy);
  if (!m) {
    if (pool[key].length >= 4) return null;
    m = key === 'k2' ? Models.tracked(0x56603a, 1.1, { bigTurret: true, gun: 18 })
      : key === 'redback' ? Models.tracked(0x6b6f45, 0.95, { gun: 8 })
      : key === 'k9' ? Models.tracked(0x5f6a40, 1.1, { rearTurret: true, bigTurret: true, gun: 22 })
      : key === 'k808' ? Models.wheeled(0x5d6845, 1.0, { gun: true })
      : key === 'kltv' ? Models.wheeled(0x6a7050, 0.75, { axles: 2, h: 4, gun: true })
      : key === 'chunmoo' ? Models.wheeled(0x58623e, 1.15, { launcher: true })
      : key === 'jet' ? Models.jet(0x8c98a6, 1.0, { roundel: true })
      : key === 'jet2' ? Models.jet(0x9aa6b2, 0.85, { roundel: true, wing: 11 })
      : key === 'heli' ? Models.heli(0x4e5a3c, 1.2)
      : key === 'sub' ? Models.ship(0x22262b, 1.4, { sub: true })
      : Models.ship(0x8792a0, 1.3);
    if (!['jet', 'jet2', 'ship'].includes(key)) m.scale.multiplyScalar(key === 'sub' ? 1 : 1.5);   // 도시 속에서 보이게 키움
    const rs = roundelSprite(); rs.scale.setScalar(key === 'ship' ? 28 : 20); rs.position.y = key === 'sub' ? 22 : key.startsWith('jet') ? 14 : 24; rs.scale.divideScalar(m.scale.x); rs.position.y /= m.scale.x; m.add(rs);
    A.scene.add(m); pool[key].push(m);
  }
  m.userData.busy = true; m.visible = true; return m;
}
function free(m) { if (m) { m.userData.busy = false; m.visible = false; } }

// ---------- 발사 (main.fire1 / 드래그가 부름)
export const isDrag = (id) => { const w = KW.find((x) => x.id === id); return !!w && (w.kind === 'line' || w.kind === 'jet'); };
export function isK(id) { return !!KW.find((x) => x.id === id); }
function ready(w) {
  if (A.G.state !== 'play') return false;
  if (!lvl(w.id)) { openSheet(); return false; }
  const c = S.cd[w.id] || 0;
  if (c > 0) { A.banner(`${w.sn} 재장전 ${Math.ceil(c)}초`); return false; }
  if (S.ops.length >= 8) { A.banner('출동 중인 부대가 많아요'); return false; }
  if (!A.useShot()) return false;
  S.cd[w.id] = V(w, 'cd') * S.cdMul; S.uses++;
  bump(w, 0.8 + lvl(w.id) * 0.6);
  return true;
}
export function fire(id, p) {
  const w = KW.find((x) => x.id === id); if (!w) return false;
  if (w.kind === 'passive') return true;
  if (isDrag(id)) { A.banner(`${w.sn}: 드래그로 선을 그으세요`); return true; }
  if (w.kind === 'sub' && !water().length) { A.banner('이 지도엔 물이 없어요'); return true; }
  if (!ready(w)) return true;
  const R = w.R ? V(w, 'R') : 0, G = A.G;
  if (w.kind === 'arty') {
    const n = V(w, 'n'), from = rearPos(p, w.salvo ? 260 : 420, w.salvo ? 14 : 18);
    let veh = null;
    if (!homePos() || homePos().distanceTo(p) >= 700) { veh = getModel(w.salvo ? 'k808' : 'k9'); if (veh) { veh.position.set(from.x, A.groundAt(from.x, from.z) + 0.5, from.z); veh.lookAt(p.x, veh.position.y, p.z); } }
    const op = { t: 0, life: (w.salvo ? 0.12 : 0.4) * n + 3, veh }; S.ops.push(op);
    for (let i = 0; i < n; i++) {
      const sc = w.salvo ? 40 : 14;
      const to = new THREE.Vector3(p.x + rnd(sc), 0, p.z + rnd(sc)); to.y = A.groundAt(to.x, to.z) + 2;
      shoot(from, to, { delay: i * (w.salvo ? 0.12 : 0.4), dur: w.salvo ? 1.0 : 1.6, arc: w.salvo ? 60 : 160, color: w.salvo ? 0xffd060 : 0xffb050, size: w.salvo ? 0.7 : 1, onHit: (q) => hit(w, q, R, w.sn, false) });
    }
    A.sfx && A.sfx.boom && A.sfx.boom(0.35);
  } else if (w.kind === 'big') {
    const mark = { t: 0, life: 3.2, p: p.clone(), R, w };
    A.rings.add(p.x, p.y + 1, p.z, R, 0xff2a20, 3);
    A.popup(p.clone().add(new THREE.Vector3(0, 40, 0)), `🎯 ${w.sn} 낙하 3초 전`, 0, true, -1);
    mark.step = (o, dt) => {
      if (!o.fired && o.t > 1.6) { o.fired = 1; const from = p.clone().add(new THREE.Vector3(0, 900, 0)); shoot(from, p, { dur: 1.3, arc: 0, size: 3, glow: 40, color: 0xffffff, onHit: (q) => {
        if (A.war && A.war.blockMeteor(q)) return;
        A.blast(q, R, { score: { verb: '현무 직격!', partVerb: '현무 충격파!' } }); } }); }
    };
    S.ops.push(mark);
  } else if (w.kind === 'drive') {
    const m = getModel(w.model); if (!m) return true;
    const dir = camDir(), start = p.clone().addScaledVector(dir, w.speed * w.life * 0.7);
    start.y = A.groundAt(start.x, start.z) + 0.5;
    m.position.copy(start); m.lookAt(p.x, start.y, p.z);
    S.ops.push({ t: 0, life: w.life, veh: m, w, R, p: p.clone(), fireT: 0.4, step: stepDrive });
  } else if (w.kind === 'heli') {
    const m = getModel('heli'); if (!m) return true;
    const start = p.clone().addScaledVector(camDir(), 380); start.y = 110;
    const hold = p.clone().addScaledVector(camDir(), 90); hold.y = 80;
    m.position.copy(start); m.lookAt(p.x, 110, p.z);
    S.ops.push({ t: 0, life: 6, veh: m, w, R, p: p.clone(), start, hold, n: V(w, 'n'), shot: 0, step: stepHeli });
  } else if (w.kind === 'cruise') {
    const b = bldAt(p, 30), to = b ? new THREE.Vector3(b.cx, b.base + Math.max(2, b.cur * 0.6), -b.cy) : p.clone();
    const d = camDir(), from = p.clone().addScaledVector(d, w.far); from.y = w.top ? 160 : 25;
    shoot(from, to, { dur: w.top ? 1.0 : 2.0, arc: w.top ? 120 : 6, size: 1.2, color: 0xfff0a0, onHit: (q) => hit(w, q, R, w.sn + ' 정밀 타격', true) });
    S.ops.push({ t: 0, life: w.top ? 1.2 : 2.2 });
    A.sfx && A.sfx.whoosh && A.sfx.whoosh(w.top ? 0.8 : 1.6);
  } else if (w.kind === 'sub') {
    let best = null, bd = 1e9; for (const q of water()) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
    const m = getModel('sub'); if (!m) return true;
    m.position.set(best.x, -12, best.z); m.lookAt(p.x, -12, p.z);
    S.ops.push({ t: 0, life: 5.5, veh: m, w, R, p: p.clone(), n: V(w, 'n'), shot: 0, step: stepSub });
  }
  A.updateHud();
  return true;
}
export function fireLine(a, b) {
  const w = KW.find((x) => x.id === A.G.weapon); if (!w) return;
  if (!ready(w)) return;
  const R = V(w, 'R'), n = V(w, 'n');
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  if (w.kind === 'line') {
    const mid = a.clone().lerp(b, 0.5), from = rearPos(mid, 460, 16);
    const veh = getModel('chunmoo'); if (veh) { veh.position.set(from.x, A.groundAt(from.x, from.z) + 0.5, from.z); veh.lookAt(mid.x, veh.position.y, mid.z); }
    for (let i = 0; i < n; i++) {
      const to = a.clone().lerp(b, n > 1 ? i / (n - 1) : 0.5); to.y = A.groundAt(to.x, to.z) + 2;
      shoot(from, to, { delay: i * 0.12, dur: 1.5, arc: 180, color: 0xff8a40, onHit: (q) => hit(w, q, R, '천무', false) });
    }
    S.ops.push({ t: 0, life: n * 0.12 + 2.5, veh });
    A.sfx && A.sfx.whoosh && A.sfx.whoosh(1.2);
  } else {
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    const m = getModel(w.id === 'kf21' ? 'jet' : 'jet2'); if (!m) return;
    const s = new THREE.Vector3(a.x - dx * 500, 130, a.z - dz * 500), e = new THREE.Vector3(b.x + dx * 500, 130, b.z + dz * 500);
    m.position.copy(s); m.lookAt(e);
    S.ops.push({ t: 0, life: (L + 1000) / w.speed, veh: m, w, R, a: a.clone(), b: b.clone(), s, e, n, dropped: 0, step: stepJet });
    A.sfx && A.sfx.whoosh && A.sfx.whoosh(2.2);
  }
  A.updateHud();
}
function stepDrive(o, dt) {
  const w = o.w, m = o.veh;
  _v.set(o.p.x - m.position.x, 0, o.p.z - m.position.z);
  const d = _v.length();
  if (d > 20) { _v.normalize(); m.position.addScaledVector(_v, Math.min(d - 20, w.speed * dt)); m.position.y = A.groundAt(m.position.x, m.position.z) + 0.5; }
  if (Math.random() < 0.3) { const f = A.fx(); f.smoke && f.smoke.emit(m.position.x + rnd(4), m.position.y + 2, m.position.z + rnd(4), rnd(2), 2, rnd(2), 1.2, 4, 10, 0.4, 0.7, 0.66, 0.6, 0.9); }
  o.fireT -= dt;
  if (o.fireT <= 0 && o.t < w.life - 0.3) {
    o.fireT = w.fire;
    const b = nearB(m.position, w.range);
    if (b) {
      const to = new THREE.Vector3(b.cx + rnd(b.rad * 0.4), b.base + Math.min(b.cur, 10) * Math.random(), -b.cy + rnd(b.rad * 0.4));
      const tur = m.userData.tur; if (tur) { tur.lookAt(to.x, tur.getWorldPosition(_v).y, to.z); tur.rotation.x = 0; }
      const from = m.position.clone(); from.y += 9;
      const f = A.fx(); if (f.fire) for (let i = 0; i < 5; i++) f.fire.emit(from.x, from.y, from.z, rnd(10), rnd(10), rnd(10), 0.12, 7, 2, 1, 1, 0.8, 0.4, 0.9);
      shoot(from, to, { dur: 0.25, arc: 0, size: 0.5, glow: 8, color: 0xffe080, smoke: false, onHit: (q) => hit(w, q, o.R, w.sn, false) });
    }
  }
}
function stepHeli(o, dt) {
  const m = o.veh, r = m.userData.rot; if (r) r.rotation.y += dt * 30;
  if (o.t < 1.6) m.position.lerpVectors(o.start, o.hold, 1 - Math.pow(1 - o.t / 1.6, 3));
  else if (o.t > 4.6) { m.position.lerpVectors(o.hold, o.start, (o.t - 4.6) / 1.4); }
  else {
    m.position.y = o.hold.y + Math.sin(o.t * 3) * 2;
    const k = Math.floor((o.t - 1.6) / (2.6 / o.n));
    while (o.shot < Math.min(o.n, k + 1)) {
      o.shot++;
      const b = nearB(o.p, 80); const to = b ? new THREE.Vector3(b.cx + rnd(b.rad * 0.5), b.base + Math.min(b.cur, 8), -b.cy + rnd(b.rad * 0.5)) : o.p.clone().add(new THREE.Vector3(rnd(20), 0, rnd(20)));
      shoot(m.position.clone().add(new THREE.Vector3(o.shot % 2 ? 5 : -5, -3, 0)), to, { dur: 0.5, arc: 0, size: 0.6, color: 0xffc070, onHit: (q) => hit(o.w, q, o.R, '수리온', false) });
    }
  }
  m.lookAt(o.p.x, m.position.y, o.p.z);
}
function stepJet(o, dt) {
  const m = o.veh, k = Math.min(1, o.t / o.life);
  m.position.lerpVectors(o.s, o.e, k);
  const f = A.fx(); if (f.smoke && Math.random() < 0.5) f.smoke.emit(m.position.x, m.position.y, m.position.z, 0, 0, 0, 0.8, 3, 8, 0.35, 0.95, 0.95, 0.95, 0.9);
  const along = o.s.distanceTo(m.position) - 500, L = o.a.distanceTo(o.b);
  while (o.dropped < o.n && along >= (o.n > 1 ? o.dropped / (o.n - 1) : 0.5) * L) {
    const t2 = o.n > 1 ? o.dropped / (o.n - 1) : 0.5;
    const to = o.a.clone().lerp(o.b, t2); to.y = A.groundAt(to.x, to.z) + 2;
    shoot(m.position.clone().add(new THREE.Vector3(0, -4, 0)), to, { dur: 0.7, arc: 0, size: 0.9, color: 0xffa040, onHit: (q) => hit(o.w, q, o.R, o.w.sn + ' 폭격', true) });
    o.dropped++;
  }
}
function stepSub(o, dt) {
  const m = o.veh;
  if (o.t < 1.2) m.position.y = -12 + 13 * (o.t / 1.2);
  else if (o.t > 4.3) m.position.y = 1 - 13 * Math.min(1, (o.t - 4.3) / 1.2);
  if (o.t > 1.4 && o.shot < o.n && o.t > 1.4 + o.shot * 0.5) {
    o.shot++;
    const b = nearB(o.p, 90) || bldAt(o.p, 200);
    const to = b ? new THREE.Vector3(b.cx, b.base + Math.min(b.cur, 8), -b.cy) : o.p.clone();
    const from = m.position.clone(); from.y += 8;
    const f = A.fx(); if (f.smoke) for (let i = 0; i < 14; i++) f.smoke.emit(from.x + rnd(4), from.y, from.z + rnd(4), rnd(6), 8 + Math.random() * 8, rnd(6), 2, 8, 24, 0.6, 0.92, 0.94, 0.96, 0.9);
    shoot(from, to, { dur: 1.6, arc: 220, size: 1.3, color: 0xfff0b0, onHit: (q) => hit(o.w, q, o.R, 'KSS-III', true) });
  }
}

// ---------- 방어 (천궁 · 정조대왕함)
export function counterFactor() {   // 방어군 요격 확률에 곱함
  let f = 1;
  for (const id of ['cheongung', 'jeongjo']) if (equipped(id)) f *= V(KW.find((x) => x.id === id), 'cf');
  return f;
}
export function interceptEnemy(p) {  // war.js 의 폭격 · 직접 요격
  if (S.icT > 0) return false;
  let pr = 0, src = null;
  for (const id of ['cheongung', 'jeongjo']) if (equipped(id)) { const w = KW.find((x) => x.id === id); pr = 1 - (1 - pr) * (1 - V(w, 'p')); }
  if (!pr || Math.random() >= pr) return false;
  const w = equipped('cheongung') ? KW.find((x) => x.id === 'cheongung') : KW.find((x) => x.id === 'jeongjo');
  S.icT = V(w, 'icd');
  src = homePos() || (S.ship ? S.ship.position.clone().setY(30) : p.clone().add(new THREE.Vector3(0, -80, 200)));
  boom(p, 0x8fd8ff, 22, 30);
  A.popup(p.clone(), `🛡 ${w.sn} 요격 성공!`, 0, false, 0);
  bump(w, 0.6);
  return true;
}
function stepDefense(real) {
  if (S.icT > 0) S.icT -= real;
  // market.js 보복 미사일 → 천궁/이지스 요격 미사일이 날아가 맞힌 순간 시장의 자동 요격 1발을 채워 줌
  const MS = A.MK && A.MK._S;
  const has = equipped('cheongung') || equipped('jeongjo');
  if (MS && has && MS.missiles) {
    for (const m of MS.missiles) {
      if (m.arTag || m.t < 0) continue;
      const k = m.t / m.dur;
      if (k < 0.15 || k > 0.45 || S.icT > 0) continue;
      const w = equipped('cheongung') ? KW.find((x) => x.id === 'cheongung') : KW.find((x) => x.id === 'jeongjo');
      if (Math.random() >= V(w, 'p')) { m.arTag = 1; continue; }
      m.arTag = 1; S.icT = V(w, 'icd');
      const src = homePos() || (S.ship ? S.ship.position.clone().setY(30) : m.g.position.clone().add(new THREE.Vector3(0, -100, 150)));
      const to = new THREE.Vector3(); m.g.getWorldPosition(to);
      shoot(src, to.clone().lerp(m.to, 0.25), { dur: 0.45, arc: 20, size: 0.8, color: 0x8fd8ff, smoke: true, onHit: () => {
        if (MS.missiles.includes(m) && m.t / m.dur < 0.55) { MS.inv.ic = (MS.inv.ic || 0) + 1; m.arGive = 1; }
      } });
      bump(w, 0.6);
    }
  }
  // 정조대왕함: 먼 바다에서 주기적 타격
  if (equipped('jeongjo') && A.G.armed) {
    const w = KW.find((x) => x.id === 'jeongjo');
    if (!S.ship) { S.ship = getModel('ship'); }
    if (S.ship) {
      const d = camDir(), base = new THREE.Vector3(A.cam.tx, 0, A.cam.tz).addScaledVector(d, 480).add(new THREE.Vector3(d.z * 250, 0, -d.x * 250));
      const r = Math.hypot(base.x, base.z), R = A.data.R * 0.95; if (r > R) base.multiplyScalar(R / r);
      S.ship.position.lerp(base.setY(2), Math.min(1, real * 0.8)); S.ship.lookAt(A.cam.tx, 2, A.cam.tz);
    }
    S.strikeT -= real;
    if (S.strikeT <= 0) {
      S.strikeT = V(w, 'strike');
      const b = nearB(new THREE.Vector3(A.cam.tx, 0, A.cam.tz), 300);
      if (b && S.ship) { const to = new THREE.Vector3(b.cx, b.base + Math.min(b.cur, 8), -b.cy); shoot(S.ship.position.clone().setY(20), to, { dur: 2.0, arc: 260, size: 1.2, color: 0xfff0b0, onHit: (q) => hit(w, q, V(w, 'R'), '이지스 타격', false) }); bump(w, 0.5); }
    }
  }
}
function giveK10() {
  const w = KW.find((x) => x.id === 'k10'); const n = V(w, 'n');
  S.k10Given = true; S.cdMul = V(w, 'cdm');
  A.G.meteors += n; A.updateHud();
  setTimeout(() => A.G.state === 'play' && A.banner(`K10 탄약 보급 +${n}발`), 900);
}

// ---------- 공개
export function init(api, WEAPONS) {
  A = api; BASE = WEAPONS.slice(); A.arsenal = { counterFactor, interceptEnemy };
  load();
  for (const w of KW) WEAPONS.push(w);
  const d = document.createElement('div');
  d.innerHTML = '<div id="arSheet" class="hidden"></div><div id="arStock"></div>';
  while (d.firstElementChild) document.body.appendChild(d.firstElementChild);
  $('arSheet').addEventListener('pointerdown', (e) => e.stopPropagation());
  // 끝 화면: 방산주 줄
  const st = document.querySelector('#end .stats');
  if (st) { const ul = document.createElement('p'); ul.id = 'arEnd'; ul.className = 'arEnd hidden'; st.after(ul); }
  window.__ar = { KW, P, S, lvl, open: openSheet, close: closeSheet, fire, fireLine, equip(ids) { P.equip = ids.slice(0, 4); save(); A.renderWeapons(); }, setLv(id, l) { P.lv[id] = l; save(); } };
}
export function reset() {
  for (const o of S.ops) free(o.veh); S.ops.length = 0;
  if (S.ship) { free(S.ship); S.ship = null; }
  Object.assign(S, { cd: {}, stock: {}, icT: 0, strikeT: 4, cdMul: 1, uses: 0, k10Given: false });
  if (equipped('k10')) giveK10();
  if (!P.equip.includes(A.G.weapon) || (isK(A.G.weapon) && !lvl(A.G.weapon))) A.G.weapon = 'meteor';
}
export function busy() { return S.ops.length > 0; }
export function end() {
  for (const o of S.ops) free(o.veh); S.ops.length = 0;
  if (S.ship) { free(S.ship); S.ship = null; }
  $('arSheet').classList.add('hidden');
  const el = $('arEnd'); if (!el) return;
  const ks = Object.keys(S.stock).sort((a, b) => S.stock[b] - S.stock[a]);
  el.innerHTML = ks.length ? `📈 방산주(가상) ${ks.slice(0, 3).map((k) => `${esc(MAKERS.find((m) => m.id === k).nm.split(' ·')[0])} <b>+${S.stock[k].toFixed(1)}%</b>`).join(' · ')}` : '';
  el.classList.toggle('hidden', !ks.length);
}
let cdT = 0;
export function step(real, dt) {
  if (!A) return;
  for (const k in S.cd) if (S.cd[k] > 0) S.cd[k] -= real;
  for (let i = S.ops.length - 1; i >= 0; i--) {
    const o = S.ops[i]; o.t += dt;
    if (o.step) o.step(o, dt);
    if (o.t >= o.life) { free(o.veh); S.ops.splice(i, 1); }
  }
  if (A.G.state === 'play') stepDefense(real);
  cdT += real; if (cdT > 0.2) { cdT = 0; chipCd(); }
}
