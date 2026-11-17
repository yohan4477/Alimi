// 서현역 부수기 — 메인
import * as THREE from 'three';
import { buildCity, makeLabel, pip, pipRings, distToRing, ringArea } from './city.js';
import { Particles, Decals, Rings, Sfx, glowTex } from './fx.js';
import * as MK from './market.js';   // 가상 주가·회장님·보복·방어 상점
import * as WAR from './war.js';   // 참전 (게임 속 가상 전쟁)
import * as AR from './arsenal.js';   // K-무기고
import * as MP from './maps.js';   // 지도 고르기·캠페인 단계·삼성 거점 보스

const $ = (id) => document.getElementById(id);
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.get('debug') === '1';
const ROUND_TIME = 60, ROUND_METEORS = 20, LV_STEP = 6;
const TALL = 30;                  // 이 높이(m) 이상은 쓰러지며 연쇄
const CHAIN_DEPTH = 6, MAX_SLABS = 10;
const SITE = 'seoulbeauty.me/seohyeon-smash';
const KIND = { apt: '아파트', house: '주택', villa: '빌라', shop: '상가', office: '오피스', school: '학교', hospital: '병원', public: '공공건물',
  hotel: '호텔', dept: '백화점', church: '교회', officetel: '오피스텔', greenhouse: '비닐하우스', kinder: '유치원', misc: '건물' };

// ---------- 돈 표기
export function won(n) {
  n = Math.max(0, Math.round(n));
  const jo = Math.floor(n / 1e12), eok = Math.floor((n % 1e12) / 1e8), man = Math.floor((n % 1e8) / 1e4);
  if (jo) return `${jo.toLocaleString('ko-KR')}조${eok ? ' ' + eok.toLocaleString('ko-KR') + '억' : ''} 원`;
  if (eok >= 100) return `${eok.toLocaleString('ko-KR')}억 원`;
  if (eok) { const ch = Math.floor(man / 1000); return `${eok}억${ch ? ' ' + ch + '천만' : ''} 원`; }
  if (man) return `${man.toLocaleString('ko-KR')}만 원`;
  return `${n.toLocaleString('ko-KR')}원`;
}
const wonShort = (n) => (n >= 1e12 ? `${(n / 1e12).toFixed(n >= 1e13 ? 0 : 1).replace(/\.0$/, '')}조` : `${Math.round(n / 1e8).toLocaleString('ko-KR')}억`);
window.__won = won;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 렌더러·장면
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH || devicePixelRatio < 2, powerPreference: 'high-performance' });
let DPR = Math.min(devicePixelRatio, IS_TOUCH ? 1.75 : 2);
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !IS_TOUCH;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = new THREE.Color('#cfe0ea');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 2600, 6000);
const camera = new THREE.PerspectiveCamera(32, 1, 8, 8000);

const hemi = new THREE.HemisphereLight(0xf4f8ff, 0xb5ab98, 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e0, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-0.55, 1, 0.35).normalize();
const boomLight = new THREE.PointLight(0xffb060, 0, 400, 1.6);
scene.add(boomLight);

// ---------- 카메라
const PORTRAIT = () => innerWidth < innerHeight;
const MAXD = () => (PORTRAIT() ? 4300 : 2800) * Math.max(1, (data && data.R ? data.R : 1000) / 1000);
const cam = { tx: 0, tz: 0, dist: innerWidth < innerHeight ? 4300 : 2700, el: THREE.MathUtils.degToRad(34), az: THREE.MathUtils.degToRad(45),
  shake: 0, anim: null };
function placeCamera() {
  const { tx, tz, dist, el, az } = cam;
  const off = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist);
  camera.position.set(tx + off.x, off.y, tz + off.z);
  camera.lookAt(tx, 0, tz);
  if (cam.shake > 0.01) {
    const s = cam.shake * Math.min(1, dist / 500);
    camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
  }
  const span = Math.min(1100, dist * 0.75);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - span) > 1) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); }
  sun.target.position.set(tx, 0, tz);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 1200);
  sc.near = 100; sc.far = 2600;
}
function easeCam(to, dur) { cam.anim = { from: { tx: cam.tx, tz: cam.tz, dist: cam.dist }, to, t: 0, dur }; }
function shake(v) { cam.shake = Math.max(cam.shake, v); }

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 46 : 32;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- 시간 (히트스톱·슬로모션)
const TS = { stop: 0, slow: 0, slowCool: 0 };
const hitstop = (s = 0.08) => { TS.stop = Math.max(TS.stop, s); };
function slowmo() { if (TS.slowCool > 0) return; TS.slow = 0.4; TS.slowCool = 1.6; }
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 무시 */ } }
const timers = [];
const later = (t, fn) => timers.push({ t, fn });
function stepTimers(dt) {
  for (let i = timers.length - 1; i >= 0; i--) {
    const o = timers[i]; o.t -= dt;
    if (o.t <= 0) { timers.splice(i, 1); o.fn(); }
  }
}

// ---------- 상태
let city, data, totalVol = 0;
const sfx = new Sfx();
let smoke, fire, decals, rings;
const meteors = [];
const G = {
  state: 'load', price: 0, dest: 0, destVol: 0, meteors: ROUND_METEORS, time: ROUND_TIME, lvl: 1, combo: 0, chainBest: 0, big: null,
  endWait: 0, weapon: 'meteor', home: -1, homeLost: false, homeSafeShown: false, missions: [], bonus: 0,
};
const radius = () => Math.min(62, 24 + (G.lvl - 1) * 7);

// ---------- 저장 (최고·누적)
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, String(v)); } catch (e) { /* 무시 */ } return null; }
const bestGet = () => Number(store('seohyeon-smash-best') || 0);
const totalGet = () => Number(store('seohyeon-smash-total') || 0);

// ---------- 무기
const WEAPONS = [
  { id: 'meteor', nm: '운석', ic: '☄️', hint: '건물을 톡 → 운석' },
  { id: 'quake', nm: '지진', ic: '〰️', hint: '톡 → 넓게 흔들어 높은 건물 쓰러뜨림', need: { best: 2e12 }, cond: '최고 2조' },
  { id: 'laser', nm: '레이저', ic: '⚡', hint: '드래그로 선 긋기 → 싹둑 · 두 손가락 이동', need: { total: 10e12 }, cond: '누적 10조' },
  { id: 'stomp', nm: '괴수 발', ic: '🦖', hint: '톡 → 쿵! 발자국 자리 납작', need: { best: 5e12 }, cond: '최고 5조' },
];
function unlocked(w) {
  if (!w.need || DEBUG) return true;
  if (w.need.best && bestGet() >= w.need.best) return true;
  if (w.need.total && totalGet() >= w.need.total) return true;
  return false;
}
function renderWeapons() {
  const el = $('weapons');
  if (AR.render(el, WEAPONS, unlocked, (id) => { G.weapon = id; renderWeapons(); showModeHint(); })) return;
  el.innerHTML = '';
  for (const w of WEAPONS) {
    const ok = unlocked(w);
    const b = document.createElement('button');
    b.className = 'wp' + (G.weapon === w.id ? ' on' : '') + (ok ? '' : ' locked');
    b.innerHTML = `<span class="ic">${w.ic}</span><span class="nm">${w.nm}</span>${ok ? '' : `<span class="lk">🔒 ${w.cond}</span>`}`;
    b.onclick = (e) => {
      e.stopPropagation();
      if (!ok) { banner(`🔒 ${w.cond} 달성 시 열림`); return; }
      G.weapon = w.id; renderWeapons(); showModeHint();
    };
    el.appendChild(b);
  }
}
let mhTimer;
function showModeHint() {
  const w = WEAPONS.find((x) => x.id === G.weapon), h = $('modeHint');
  h.textContent = `${w.ic} ${w.nm}: ${w.hint}`; h.classList.remove('hidden');
  clearTimeout(mhTimer); mhTimer = setTimeout(() => h.classList.add('hidden'), w.id === 'laser' ? 4000 : 2200);
}

// ---------- 잔해 조각 (자체 간이 물리)
const CAP = 5000;
const boxG = new THREE.BoxGeometry(1, 1, 1);
let chunkWin, chunkPlain;
const chunks = [];
const hf = new Map();
const HF = 2.5;
const hkey = (x, z) => (Math.floor(x / HF) + 2000) * 4000 + (Math.floor(z / HF) + 2000);
const gcache = new Map();
function groundAt(x, z) {
  const k = (Math.floor(x / 4) + 1000) * 2000 + (Math.floor(z / 4) + 1000);
  let v = gcache.get(k);
  if (v === undefined) {
    v = 0;
    for (const g of data.plateau) if (pipRings(x, -z, g)) { v = data.PH; break; }
    gcache.set(k, v);
  }
  return v;
}
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
class Pool {
  constructor(mesh) { this.mesh = mesh; this.free = []; for (let i = CAP - 1; i >= 0; i--) this.free.push(i); this.hideAll(); }
  hideAll() { for (let i = 0; i < CAP; i++) this.mesh.setMatrixAt(i, ZERO_M); this.mesh.instanceMatrix.needsUpdate = true; }
  take() { return this.free.length ? this.free.pop() : -1; }
  give(i) { this.mesh.setMatrixAt(i, ZERO_M); this.free.push(i); }
}
let poolW, poolP;
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q2 = new THREE.Quaternion();
const UPV = new THREE.Vector3(0, 1, 0);
const load = () => (chunks.length > 3200 ? 0.3 : chunks.length > 2000 ? 0.55 : 1) * (IS_TOUCH ? 0.75 : 1);

function spawnChunk(pool, x, y, z, sx, sy, sz, rot, color, vel, delay) {
  let idx = pool.take();
  if (idx < 0) {
    const old = chunks.findIndex((c) => c.pool === pool && c.st === 1);
    if (old < 0) return;
    removeChunk(old); idx = pool.take(); if (idx < 0) return;
  }
  pool.mesh.setColorAt(idx, color);
  const q = typeof rot === 'number' ? new THREE.Quaternion().setFromAxisAngle(UPV, rot) : rot.clone();
  const c = { pool, idx, p: new THREE.Vector3(x, y, z), v: vel, q,
    w: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6).multiplyScalar(vel.length() > 3 ? 1 : 0.3),
    s: new THREE.Vector3(sx, sy, sz), delay, st: 0, rest: 0, sink: 0 };
  chunks.push(c);
  writeChunk(c);
  pool.mesh.instanceColor.needsUpdate = true;
}
function writeChunk(c) { _m.compose(c.p, c.q, c.s); c.pool.mesh.setMatrixAt(c.idx, _m); }
function removeChunk(i) {
  const c = chunks[i];
  c.pool.give(c.idx);
  const k = hkey(c.p.x, c.p.z), h = hf.get(k);
  if (h !== undefined) hf.set(k, h - c.s.y * 0.45);
  chunks[i] = chunks[chunks.length - 1]; chunks.pop();
}
const GRAV = 26;
const _dq = new THREE.Quaternion();
function stepChunks(dt) {
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    if (c.delay > 0) { c.delay -= dt; continue; }
    if (c.st === 0) {
      c.v.y -= GRAV * dt;
      c.p.addScaledVector(c.v, dt);
      const wl = c.w.length();
      if (wl > 1e-3) { _dq.setFromAxisAngle(_v.copy(c.w).divideScalar(wl), wl * dt); c.q.premultiply(_dq); }
      const k = hkey(c.p.x, c.p.z);
      const fl = Math.max(groundAt(c.p.x, c.p.z) + 0.6, hf.get(k) ?? -1e9);
      const hy = Math.min(c.s.x, c.s.y, c.s.z) * 0.5;
      if (c.p.y - hy < fl) {
        c.p.y = fl + hy;
        if (c.v.y < -5) { c.v.y *= -0.22; c.v.x *= 0.55; c.v.z *= 0.55; c.w.multiplyScalar(0.5); }
        else {
          c.v.set(0, 0, 0); c.w.set(0, 0, 0); c.st = 1;
          hf.set(k, Math.max(fl, hf.get(k) ?? -1e9) + Math.min(c.s.y, c.s.x) * 0.45);
          if (Math.random() < 0.12) smoke.emit(c.p.x, c.p.y, c.p.z, 0, 1.5, 0, 2.2, 6, 14, 0.35, 0.82, 0.78, 0.7);
        }
      }
      writeChunk(c);
    } else {
      c.rest += dt;
      if (c.rest > 6) {
        c.sink += dt;
        c.p.y -= dt * (c.s.y * 0.5 + 0.6);
        writeChunk(c);
        if (c.sink > 2.2) removeChunk(i);
      }
    }
  }
  poolW.mesh.instanceMatrix.needsUpdate = true; poolP.mesh.instanceMatrix.needsUpdate = true;
}

// 바닥 모양 격자 (가장 긴 변 방향)
function footFrame(b) {
  const f = b.ext;
  let best = 0, ang = 0;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const dx = f[i] - f[j], dy = f[i + 1] - f[j + 1], L = dx * dx + dy * dy;
    if (L > best) { best = L; ang = Math.atan2(dy, dx); }
  }
  const ca = Math.cos(-ang), sa = Math.sin(-ang);
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (let i = 0; i < f.length; i += 2) {
    const a = f[i] * ca - f[i + 1] * sa, bb = f[i] * sa + f[i + 1] * ca;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, bb); b1 = Math.max(b1, bb);
  }
  return { ang, a0, a1, b0, b1 };
}
const CONCRETE = new THREE.Color().setRGB(0.72, 0.7, 0.66, THREE.SRGBColorSpace);
// 격자 칸마다 cb(x, y, z, sizes, color, pool, edge, il, nl)
function gridCells(b, lo, hi, budget, cb) {
  const { ang, a0, a1, b0, b1 } = footFrame(b);
  const H = hi - lo;
  if (H <= 0.3) return 0;
  let cs = 4.2, lh = Math.max(2.6, b.fh);
  const count = () => Math.ceil((a1 - a0) / cs) * Math.ceil((b1 - b0) / cs) * Math.ceil(H / lh) * 0.8;
  let flip = 0;
  while (count() > budget && cs < 40) { if (flip++ % 2) cs *= 1.3; else lh *= 1.4; }
  const na = Math.max(1, Math.round((a1 - a0) / cs)), nb = Math.max(1, Math.round((b1 - b0) / cs)), nl = Math.max(1, Math.round(H / lh));
  const da = (a1 - a0) / na, db = (b1 - b0) / nb, dl = H / nl;
  const cb2 = Math.cos(ang), sb = Math.sin(ang);
  let made = 0;
  for (let ia = 0; ia < na; ia++) for (let ib = 0; ib < nb; ib++) {
    const la = a0 + (ia + 0.5) * da, lb = b0 + (ib + 0.5) * db;
    const u = la * cb2 - lb * sb, v = la * sb + lb * cb2;
    let inside = false;
    for (const g of b.d.g) if (pipRings(u, v, g)) { inside = true; break; }
    if (!inside) continue;
    const edge = ia === 0 || ib === 0 || ia === na - 1 || ib === nb - 1;
    for (let il = 0; il < nl; il++) {
      const y = b.base + lo + (il + 0.5) * dl;
      const isTop = il === nl - 1;
      const color = isTop ? b.rc : (edge ? b.wc : CONCRETE);
      const pool = isTop || !edge ? poolP : poolW;
      cb(u, y, -v, da, dl, db, ang, color, pool, il, nl);
      made++;
    }
  }
  return made;
}

// 건물 → 조각 (폭발)
function fracture(b, cutFrom, impact, power, R, down = 0) {
  const budget = Math.max(30, Math.min(260, 30 + b.d.f * 14)) * load();
  return gridCells(b, cutFrom, b.cur, budget, (x, y, z, da, dl, db, ang, color, pool, il) => {
    const dx = x - impact.x, dz = z - impact.z, dist = Math.hypot(dx, dz) || 1;
    const fall = Math.max(0.15, 1 - dist / (R * 1.7));
    const hgt = (y - b.base) / 30;
    const sp = power * fall * (0.5 + Math.random() * 0.8);
    const vel = new THREE.Vector3(dx / dist * sp + (Math.random() - 0.5) * 6, (sp * (0.35 + Math.random() * 0.5) + hgt * 4) * (1 - down) - down * 18,
      dz / dist * sp + (Math.random() - 0.5) * 6);
    const j = 0.78 + Math.random() * 0.2;
    spawnChunk(pool, x, y, z, da * j, dl * (0.85 + Math.random() * 0.12), db * j, ang, color, vel, dist / 160 + Math.random() * 0.08 + il * 0.01 * (1 - down));
  });
}

// 정적 건물 자르기
function cutBuilding(b, keepH) {
  const pos = city.bmesh.geometry.attributes.position, uv = city.bmesh.geometry.attributes.uv;
  const P = pos.array, U = uv.array, O = city.origPos, OU = city.origUV;
  const lim = b.base + keepH;
  for (let k = b.start; k < b.start + b.count; k++) {
    const y = O[k * 3 + 1];
    if (y > lim) {
      P[k * 3 + 1] = keepH <= 0.01 ? b.base - 0.5 : lim;
      if (OU[k * 2] !== 0.05 || OU[k * 2 + 1] !== 0.05) U[k * 2 + 1] = (P[k * 3 + 1] - b.base) / b.fh;
    }
    if (keepH <= 0.01) { P[k * 3 + 1] = b.base - 0.5; }
  }
  pos.needsUpdate = true; uv.needsUpdate = true;
  b.cur = keepH;
}

// ---------- 피해 기록 (점수·미션·우리 집)
function newShot() { return { full: 0, chain: 0, val: 0 }; }
// 건물을 keep 높이로 깎고 기록. 반환: 점수용 기록
function applyCut(b, keep, shot) {
  const before = b.cur;
  cutBuilding(b, keep);
  const live = G.state === 'play';
  const frac = (before - keep) / b.h;
  const val = live ? b.price * frac : 0;
  if (live) G.destVol += b.vol * frac;
  const full = keep <= 0.01;
  if (full) { b.gone = true; if (live) G.dest++; shot.full++; decals.rubble(b, b.base + 0.05); }
  MP.onCut(b, full, val, live);
  missionEvent('cut', { b, val, full, shot });
  MK.onCut(b, live ? frac : 0, val);
  if (b.i === G.home && live) homeHit(full);
  return { b, val, full, floors: Math.max(1, Math.round(b.d.f * frac)) };
}
// 점수 반영 + 글자
function scoreHits(hits, shot, anchor, opt = {}) {
  if (!hits.length || G.state !== 'play') return 0;
  const groups = new Map();
  for (const h of hits) {
    const key = h.b.d.n ? h.b.d.n + '|' + (/^\d+동$/.test(h.b.d.d) ? h.b.d.d : '') : 'k' + h.b.i;
    const gr = groups.get(key) || { b: h.b, val: 0, full: true, floors: 0, est: false };
    gr.val += h.val; gr.full = gr.full && h.full; gr.floors = Math.max(gr.floors, h.floors); gr.est = gr.est || h.b.d.price_src !== '실거래';
    groups.set(key, gr);
  }
  const list = [...groups.values()].sort((a, b) => b.val - a.val);
  const n = hits.filter((h) => h.full).length;
  let mult = opt.mult || (n >= 2 ? Math.min(3, 1 + 0.15 * (n - 1)) : 1);
  let sum = 0;
  for (const g of list) sum += g.val;
  sum *= mult;
  G.price += sum; shot.val += sum;
  if (n > G.combo) G.combo = n;
  if (!G.big || list[0].val > G.big.val) G.big = { val: list[0].val, name: label(list[0].b), b: list[0].b };
  // 큰 것만 이름 글자, 나머지는 「외 N채」 하나로
  let maxPop = opt.chain ? 1 : (opt.few ? 2 : 4);
  while (maxPop > 1 && list[maxPop - 1] && list[maxPop - 1].val * mult < 1e10) maxPop--;
  list.slice(0, maxPop).forEach((g, i) => {
    const nm = label(g.b);
    const what = g.full ? (g.b.d.f >= 3 ? g.b.d.f + '층 ' : '') + (opt.verb || '붕괴!') : (opt.partVerb || '윗층 날아감!');
    const txt = `${nm} ${what} <em>+${won(g.val * mult)}</em>${g.est ? ' <small>(추정)</small>' : ' <small>(실거래)</small>'}`;
    popup(new THREE.Vector3(g.b.cx, g.b.base + g.b.h + 6, -g.b.cy), txt, i * 0.18, i === 0 && g.val > 5e10, i);
  });
  if (list.length > maxPop && !opt.chain) popup(anchor.clone().add(new THREE.Vector3(0, 10, 0)), `외 ${list.length - maxPop}채 <em>+${won(list.slice(maxPop).reduce((s, g) => s + g.val, 0) * mult)}</em>`, 1.0, false, maxPop);
  if (!opt.chain && n >= 2) banner(`${n}채 콤보! ×${mult.toFixed(2)}`);
  if (list.some((g) => g.full && g.b.d.f >= 20)) slowmo();
  sfx.crumble(hits.length);
  const lv = 1 + Math.floor(G.dest / LV_STEP);
  if (lv > G.lvl) { G.lvl = lv; later(n >= 2 ? 1.3 : 0.3, () => { if (G.lvl === lv) { banner(`Lv.${lv}! 반경 ${radius()}m`); sfx.ding(); } }); }
  missionEvent('score', { shot });
  updateHud();
  return sum;
}

// ---------- 쓰러지는 건물 (강체 판)
const slabs = [];
function makeSlab(b, lo, mode, dir, shot, depth) {
  const hi = b.cur;
  if (hi - lo < 2) return null;
  const s = b.start, n = b.count;
  const P = city.origPos, U = city.origUV, A = city.bmesh.geometry.attributes;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const nor = A.normal.array.slice(s * 3, (s + n) * 3), col = A.color.array.slice(s * 3, (s + n) * 3);
  const yl = b.base + lo, yh = b.base + hi;
  for (let k = 0; k < n; k++) {
    const i3 = (s + k) * 3, i2 = (s + k) * 2;
    const yc = Math.min(yh, Math.max(yl, P[i3 + 1]));
    pos[k * 3] = P[i3]; pos[k * 3 + 1] = yc; pos[k * 3 + 2] = P[i3 + 2];
    const roof = U[i2] === 0.05 && U[i2 + 1] === 0.05;
    uv[k * 2] = U[i2]; uv[k * 2 + 1] = roof ? 0.05 : (yc - b.base) / b.fh;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, city.bmesh.material);
  mesh.castShadow = renderer.shadowMap.enabled;
  // 축: 발자국을 dir 방향으로 투영 → 넘어질 쪽 끝을 경첩으로
  const f = b.ext;
  let mx = -1e9, p0 = 1e9, p1 = -1e9;
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  for (let i = 0; i < f.length; i += 2) {
    const x = f[i], z = -f[i + 1];
    mx = Math.max(mx, x * dir.x + z * dir.z);
    const pp = x * perp.x + z * perp.z; p0 = Math.min(p0, pp); p1 = Math.max(p1, pp);
  }
  const cx = b.cx, cz = -b.cy;
  const cd = cx * dir.x + cz * dir.z;
  const pivot = mode === 'topple' ? new THREE.Vector3(cx + dir.x * (mx - cd), yl, cz + dir.z * (mx - cd)) : new THREE.Vector3(cx, yl, cz);
  const grp = new THREE.Group();
  grp.position.copy(pivot); mesh.position.set(-pivot.x, -pivot.y, -pivot.z);
  grp.add(mesh); scene.add(grp);
  const sl = { b, lo, hi, H: hi - lo, W: Math.max(4, p1 - p0), grp, mesh, mode, dir: dir.clone(), axis: new THREE.Vector3().crossVectors(UPV, dir).normalize(),
    th: mode === 'topple' ? 0.03 : 0, w: mode === 'topple' ? 0.22 : 0.15, t: 0, shot, depth, pivot,
    v: mode === 'slide' ? dir.clone().multiplyScalar(7 + Math.random() * 4).add(new THREE.Vector3(0, 1.5, 0)) : null,
    k: mode === 'topple' ? THREE.MathUtils.clamp(Math.sqrt(60 / (hi - lo + 10)), 0.75, 1.5) : 1 };
  slabs.push(sl);
  return sl;
}
function stepSlabs(dt) {
  for (let i = slabs.length - 1; i >= 0; i--) {
    const s = slabs[i]; s.t += dt;
    let land = false;
    if (s.mode === 'topple') {
      s.w += (1.1 + 6.5 * Math.sin(s.th)) * s.k * dt;
      s.th += s.w * dt;
      if (s.th >= Math.PI / 2 - 0.03) { s.th = Math.PI / 2 - 0.03; land = true; }
      if (s.t > 0.12 && s.t - dt <= 0.12) sfx.creak();
    } else {
      s.grp.position.addScaledVector(s.v, dt);
      if (s.t > 0.28) { s.v.y -= GRAV * dt; s.w += 2.2 * dt; s.th = Math.min(1.4, s.th + s.w * dt); }
      const fl = groundAt(s.grp.position.x, s.grp.position.z);
      if (s.grp.position.y < fl + Math.min(s.H, s.W) * 0.35 * Math.sin(s.th) + 0.5 || s.t > 3) land = true;
    }
    s.grp.quaternion.setFromAxisAngle(s.axis, s.th);
    if (land) { slabLand(s); slabs.splice(i, 1); }
  }
}
function slabLand(s) {
  const b = s.b;
  s.grp.updateMatrixWorld(true);
  const M = s.mesh.matrixWorld;
  const budget = Math.min(170, 50 + s.H * 1.3) * load();
  const qg = s.grp.quaternion;
  gridCells(Object.assign(Object.create(b), { cur: s.hi }), s.lo, s.hi, budget, (x, y, z, da, dl, db, ang, color, pool) => {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(M);
    const q = qg.clone().multiply(_q2.setFromAxisAngle(UPV, ang));
    const vel = new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 5, (Math.random() - 0.5) * 5).addScaledVector(s.dir, 2 + Math.random() * 3);
    const j = 0.8 + Math.random() * 0.18;
    spawnChunk(pool, p.x, p.y, p.z, da * j, dl * 0.92, db * j, q, color, vel, Math.random() * 0.06);
  });
  // 먼지 줄
  const tip = s.mode === 'topple' ? s.pivot.clone().addScaledVector(s.dir, s.H) : s.grp.position.clone();
  const base = s.mode === 'topple' ? s.pivot : s.grp.position;
  const nd = Math.min(IS_TOUCH ? 14 : 26, 4 + Math.round(s.H / 4));
  for (let i = 0; i < nd; i++) {
    const t = i / Math.max(1, nd - 1), x = base.x + (tip.x - base.x) * t, z = base.z + (tip.z - base.z) * t;
    smoke.emit(x + rnd(s.W * 0.4), groundAt(x, z) + 2, z + rnd(s.W * 0.4), rnd(8), 2 + Math.random() * 5, rnd(8), 3 + Math.random() * 2, 14, 38 + s.W * 0.5, 0.55, 0.84, 0.8, 0.72, 0.88);
  }
  scene.remove(s.grp); s.mesh.geometry.dispose();
  shake(3 + s.H * 0.07); sfx.crash(s.H / 60); buzz(30);
  if (s.mode === 'topple') fallDamage(s, tip);
}
// 쓰러진 자리에 깔린 건물 → 연쇄
function fallDamage(s, tip) {
  const ax = s.pivot.x, az = s.pivot.z, bx = tip.x, bz = tip.z, hw = s.W / 2;
  const L = Math.hypot(bx - ax, bz - az) || 1;
  const victims = [];
  for (const b of city.B) {
    if (b.gone || b === s.b || b.cur < 1) continue;
    const x = b.cx, z = -b.cy;
    let t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L); t = Math.max(0, Math.min(1, t));
    const dd = Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z);
    if (dd > b.rad + hw) continue;
    // 자세히: 줄 따라 점 찍어 발자국에 닿는지
    let hitT = -1;
    for (let d = 0; d <= L; d += 3) {
      const px = ax + (bx - ax) * d / L, pz = az + (bz - az) * d / L;
      for (const g of b.d.g) {
        if (pipRings(px, -pz, g) || distToRing(px, -pz, g[0]) < hw * 0.85) { hitT = d; break; }
      }
      if (hitT >= 0) break;
    }
    if (hitT >= 0) victims.push({ b, d: hitT });
  }
  if (!victims.length) return;
  victims.sort((a, b) => a.d - b.d);
  const shot = s.shot, hits = [];
  for (const v of victims.slice(0, 3)) {
    const b = v.b;
    if (b.gone) continue;
    shot.chain++;
    if (shot.chain > G.chainBest && G.state === 'play') G.chainBest = shot.chain;
    const gp = new THREE.Vector3(ax + (bx - ax) * v.d / L, b.base, az + (bz - az) * v.d / L);
    // 쓰러지는 건물보다 너무 높으면 버팀(반쯤 깔림), 한 방 연쇄 쓰러짐은 8채까지
    const tall = b.cur >= TALL && b.cur <= s.H * 1.15;
    if (tall && s.depth < CHAIN_DEPTH && slabs.length < MAX_SLABS && (shot.topples || 0) < 8) {
      shot.topples = (shot.topples || 0) + 1;
      const a = Math.atan2(s.dir.z, s.dir.x) + rnd(0.3);
      const nd = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      makeSlab(b, 0, 'topple', nd, shot, s.depth + 1);
      hits.push(applyCut(b, 0, shot));
    } else {
      const keep = b.cur <= s.W * 1.6 + 6 ? 0 : b.cur * (b.cur > s.H ? 0.65 : 0.45);
      fracture(b, keep, gp, 16, 24);
      hits.push(applyCut(b, keep < 3 ? 0 : keep, shot));
      bridgeDamage(gp, 6);
    }
  }
  const mult = 1 + 0.25 * Math.min(8, shot.chain);
  const mid = new THREE.Vector3((ax + bx) / 2, s.pivot.y + 10, (az + bz) / 2);
  scoreHits(hits, shot, mid, { mult, chain: true, verb: '깔림!', partVerb: '반쯤 깔림!' });
  chainPopup(shot, mid, shot.chain, mult);
  sfx.chain(shot.chain);
  if (shot.chain >= 3) slowmo();
  missionEvent('chain', { shot });
}
function chainPopup(shot, pos, n, mult) {
  const html = `연쇄 ×${n}! <em>보너스 ×${mult.toFixed(2)}</em>`;
  const w = pos.clone().add(new THREE.Vector3(0, 30, 0));
  if (shot.pop && pops.includes(shot.pop)) { shot.pop.el.innerHTML = html; shot.pop.t = 0.2; shot.pop.world = w; }
  else shot.pop = popup(w, html, 0, false, -2, 'chain');
  if (n >= 2) banner(`연쇄 ×${n}!`);
  buzz([20, 30, 20]);
}

// 높은 건물이면 쓰러뜨리고, 아니면 폭발
function knock(b, keep, gp, power, R, shot, dirFrom, opt = {}) {
  { const k2 = MP.armor(b, keep); if (k2 !== keep) { keep = k2; if (k2 > 0) opt = Object.assign({}, opt, { noTopple: true }); } }   // 거점·본사·팹은 여러 번 (마지막 방은 통째로)
  const canTopple = b.cur >= TALL && slabs.length < MAX_SLABS && (keep === 0 || opt.force) && !opt.noTopple;
  if (canTopple) {
    let dx = b.cx - dirFrom.x, dz = -b.cy - dirFrom.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const a = Math.atan2(dz, dx) + rnd(opt.jitter || 0.15);
    makeSlab(b, 0, 'topple', new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), shot, 0);
    return applyCut(b, 0, shot);
  }
  fracture(b, keep, gp, power, R, opt.down || 0);
  return applyCut(b, keep, shot);
}

// ---------- 다리
function bridgeDamage(p, R) {
  if (!city.bridge.length) return;
  const P = city.bridgeMesh.geometry.attributes.position;
  let any = false;
  for (const d of city.bridge) {
    if (d.gone) continue;
    if (Math.hypot(d.x - p.x, d.z - p.z) > R + d.len * 0.5) continue;
    d.gone = true; any = true;
    for (let k = d.start; k < d.start + d.count; k++) P.array[k * 3 + 1] = -6;
    const gray = new THREE.Color().setRGB(0.5, 0.5, 0.52, THREE.SRGBColorSpace);
    for (let i = 0; i < 3; i++) spawnChunk(poolP, d.x + rnd(3), d.h, d.z + rnd(3), 3.5, 1.1, 3.5, Math.random() * 6, gray, new THREE.Vector3(rnd(4), 3, rnd(4)), 0.05 * i);
    for (let i = 0; i < 6; i++) smoke.emit(d.x + rnd(4), 1, d.z + rnd(4), rnd(3), 6 + Math.random() * 6, rnd(3), 1.6, 6, 18, 0.7, 0.8, 0.9, 1.0, 0.9);
    missionEvent('bridge', { d });
  }
  if (any) P.needsUpdate = true;
}

// ---------- 나무·차
const fallingTrees = [];
function blastTreesCars(p, R, power) {
  for (const t of city.treeState) {
    if (t.done) continue;
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    if (d > R * 1.35) continue;
    t.ax = new THREE.Vector3(dz, 0, -dx).normalize(); t.fall = 0.0001; t.done = true; t.delay = d / 160; t.tgt = 1.25 + Math.random() * 0.3;
    fallingTrees.push(t);
  }
  let carHit = false;
  city.carState.forEach((c, i) => {
    if (c.gone) return;
    const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
    if (d > R * 1.25) return;
    c.gone = true; carHit = true;
    city.cars.setMatrixAt(i, ZERO_M);
    const s = power * 1.1 * Math.max(0.3, 1 - d / (R * 1.3));
    const vel = new THREE.Vector3(dx / (d || 1) * s, s * 0.8 + 6, dz / (d || 1) * s);
    const e = new THREE.Euler().setFromQuaternion(c.rot);
    spawnChunk(poolP, c.x, c.y + 0.8, c.z, 4.3, 1.45, 1.85, e.y, c.color, vel, d / 160);
  });
  if (carHit) city.cars.instanceMatrix.needsUpdate = true;
}
function stepTrees(dt) {
  if (!fallingTrees.length) return;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = fallingTrees.length - 1; i >= 0; i--) {
    const t = fallingTrees[i];
    if (t.delay > 0) { t.delay -= dt; continue; }
    t.fall = Math.min(t.tgt, t.fall + dt * (1.5 + t.fall * 4));
    q.setFromAxisAngle(t.ax, t.fall).multiply(t.rot);
    p.set(t.x, t.y, t.z); s.set(t.sc, t.sy, t.sc);
    m.compose(p, q, s); city.trees.setMatrixAt(t.i, m);
    if (t.fall >= t.tgt) fallingTrees.splice(i, 1);
  }
  city.trees.instanceMatrix.needsUpdate = true;
}
function label(b) {
  const d = b.d;
  if (d.n) return d.n + (/^\d+동$/.test(d.d) ? ' ' + d.d : '');
  return KIND[d.k] || '건물';
}
const rnd = (s) => (Math.random() - 0.5) * 2 * s;
function bDist(b, x, z) {   // 점 → 건물 발자국 거리 (안이면 0)
  for (const g of b.d.g) if (pipRings(x, -z, g)) return 0;
  return Math.min(...b.d.g.map((g) => distToRing(x, -z, g[0])));
}
function flash(o = 0.55) {
  $('flash').style.transition = 'none'; $('flash').style.opacity = String(o);
  requestAnimationFrame(() => { $('flash').style.transition = 'opacity .5s ease-out'; $('flash').style.opacity = '0'; });
}
function useShot() {
  if (G.state !== 'play' || G.meteors <= 0) return false;
  if (!G.armed) { G.armed = true; hideTapHint(); }
  G.meteors--; updateHud();
  return true;
}

// ---------- 무기 1: 운석
const meteorGeo = new THREE.IcosahedronGeometry(1, 1);
function launch(target) {
  if (!useShot()) return;
  const R = radius();
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, UPV);
  const start = target.clone().addScaledVector(right, -260).addScaledVector(fwd, 240).add(new THREE.Vector3(0, 520, 0));
  const g = new THREE.Group();
  const core = new THREE.Mesh(meteorGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
  core.scale.setScalar(3 + R * 0.06);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(28 + R * 0.5);
  g.add(core, glow); g.position.copy(start); scene.add(g);
  meteors.push({ g, start, target: target.clone(), t: 0, dur: 0.85, R });
  sfx.whoosh(0.85);
}
function stepMeteors(dt) {
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.t += dt;
    const k = Math.min(1, m.t / m.dur), e = k * k;
    const prev = m.g.position.clone();
    m.g.position.lerpVectors(m.start, m.target, e);
    for (let s = 0; s < 4; s++) {
      const p = prev.clone().lerp(m.g.position, s / 4);
      fire.emit(p.x + rnd(1.5), p.y + rnd(1.5), p.z + rnd(1.5), rnd(4), rnd(4), rnd(4), 0.45, 9 + m.R * 0.2, 2, 0.9, 1, 0.62, 0.25);
      if (s % 2 === 0) smoke.emit(p.x, p.y, p.z, rnd(2), rnd(2), rnd(2), 1.3, 6, 20, 0.35, 0.5, 0.47, 0.45);
    }
    if (k >= 1 || (!m.wc && k > 0.6 && (m.wc = 1) && WAR.blockMeteor(m.g.position))) { scene.remove(m.g); m.g.children[0].material.dispose(); m.g.children[1].material.dispose(); meteors.splice(i, 1); if (k >= 1) impact(m.target, m.R); }
  }
}
function impact(p, R, opt = {}) {   // opt.light: 지원·K무기 (번쩍·멈춤 없이 가볍게), opt.score: scoreHits 옵션
  const shot = newShot();
  const gy = groundAt(p.x, p.z) + 0.65;
  const gp = new THREE.Vector3(p.x, gy, p.z);
  if (!opt.light) { flash(0.55); hitstop(0.08); buzz(IS_TOUCH ? [35, 25, 60] : 40); }
  boomLight.position.set(p.x, p.y + 25, p.z); boomLight.intensity = 9000; boomLight.distance = R * 8;
  shake(6 + R * 0.12);
  rings.add(gp.x, gp.y, gp.z, R); rings.add(gp.x, gp.y, gp.z, R * 0.6, 0xffb070, 0.6);
  decals.crater(gp.x, gp.y, gp.z, R * 0.55);
  const lf = load() * (opt.light ? 0.35 : 1);
  for (let i = 0; i < 40 * lf; i++) fire.emit(p.x + rnd(4), p.y + 2, p.z + rnd(4), rnd(R * 0.9), Math.random() * R * 0.9, rnd(R * 0.9), 0.5 + Math.random() * 0.5, 14 + R * 0.3, 30 + R * 0.5, 1, 1, 0.55 + Math.random() * 0.2, 0.2, 0.86);
  for (let i = 0; i < 70 * lf; i++) {
    const a = Math.random() * 6.28, s = R * (0.6 + Math.random() * 0.9);
    smoke.emit(gp.x + Math.cos(a) * 3, gp.y + 2, gp.z + Math.sin(a) * 3, Math.cos(a) * s, 2 + Math.random() * 8, Math.sin(a) * s,
      3 + Math.random() * 2.5, 14 + R * 0.25, 40 + R * 0.9, 0.55, 0.8, 0.75, 0.68, 0.86);
  }
  for (let i = 0; i < 30 * lf; i++) smoke.emit(gp.x + rnd(6), gp.y + 4, gp.z + rnd(6), rnd(3), 10 + Math.random() * 14, rnd(3), 4 + Math.random() * 2, 18, 55 + R, 0.5, 0.45, 0.42, 0.4, 0.92);
  for (let i = 0; i < 24 * lf; i++) fire.emit(gp.x, gp.y + 2, gp.z, rnd(R), 15 + Math.random() * 25, rnd(R), 1.2, 3, 2, 1, 1, 0.8, 0.4, 0.97, 25);
  sfx.boom(R / 30);

  const hits = [];
  const power = 22 + R * 0.45;
  for (const b of city.B) {
    if (b.gone) continue;
    if (Math.hypot(b.cx - p.x, -b.cy - p.z) - b.rad > R * 1.6) continue;
    const dist = bDist(b, p.x, p.z);
    if (dist > R * 1.6) continue;
    const before = b.cur;
    let keep;
    if (dist <= R) keep = 0;
    else { const f = 1 - (dist - R) / (0.6 * R); keep = before * (1 - (0.25 + 0.5 * f)); if (keep < 3) keep = 0; }
    if (before - keep < 1) continue;
    // 맞은 건물은 폭발, 옆에서 맞은 높은 건물은 바깥으로 쓰러짐
    const force = keep > 0 && (before - keep) / before > 0.4;
    hits.push(knock(b, keep, gp, power, R, shot, gp, { noTopple: dist === 0, force }));
    const n = Math.min(10, 2 + Math.round(b.rad / 6));
    for (let i = 0; i < n * lf; i++) smoke.emit(b.cx + rnd(b.rad * 0.6), b.base + keep + Math.random() * (before - keep), -b.cy + rnd(b.rad * 0.6),
      rnd(4), 1 + Math.random() * 3, rnd(4), 3.5 + Math.random() * 2, 12, 34 + b.rad * 0.6, 0.55, 0.86, 0.82, 0.74, 0.9);
  }
  blastTreesCars(p, R, power);
  bridgeDamage(p, R);
  const sum = scoreHits(hits, shot, gp, opt.score || {});
  updateHud();
  return sum;
}

// ---------- 무기 2: 지진
function quake(p) {
  if (!useShot()) return;
  const R = radius(), RR = R * 2.8, shot = newShot();
  const gy = groundAt(p.x, p.z) + 0.6;
  hitstop(0.06); shake(16); buzz([60, 40, 120, 40, 200]); sfx.rumble(1);
  for (let i = 0; i < 4; i++) rings.add(p.x, gy, p.z, RR * 0.45, i % 2 ? 0x8a6a48 : 0xc9a46c, 1.3, i * 0.22, true);
  rings.add(p.x, gy, p.z, RR * 0.4, 0xfff0c0, 0.8);
  decals.crater(p.x, gy, p.z, R * 0.35);
  const lf = load();
  for (let i = 0; i < 50 * lf; i++) {   // 바닥 따라 퍼지는 흙먼지
    const a = Math.random() * 6.28, r = Math.random() * RR, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    smoke.emit(x, groundAt(x, z) + 1, z, Math.cos(a) * 10, 2 + Math.random() * 4, Math.sin(a) * 10, 2.5 + Math.random() * 2, 10, 30, 0.45, 0.78, 0.68, 0.54, 0.9);
  }
  const list = [];
  for (const b of city.B) {
    if (b.gone) continue;
    const d = Math.hypot(b.cx - p.x, -b.cy - p.z) - b.rad * 0.5;
    if (d > RR) continue;
    list.push({ b, d: Math.max(0, d) });
  }
  // 파도처럼 바깥으로 퍼지며 피해
  const groups = new Map();
  for (const it of list) {
    const step = Math.round(it.d / 25);
    if (!groups.has(step)) groups.set(step, []);
    groups.get(step).push(it);
  }
  for (const [step, items] of groups) {
    later(step * 25 / 200, () => {
      const hits = [];
      for (const { b, d } of items) {
        if (b.gone || b.cur < 1) continue;
        const k = 1 - d / RR;
        if (b.cur >= TALL * 0.8 && Math.random() < 0.15 + k * 0.45 && slabs.length < MAX_SLABS) {
          hits.push(knock(b, 0, new THREE.Vector3(b.cx, b.base, -b.cy), 12, 20, shot, p, { force: true, jitter: 0.5 }));
        } else {
          const keep = b.cur * (0.55 + 0.35 * (1 - k));
          if (b.cur - keep < 1.2) continue;
          hits.push(knock(b, keep < 3 ? 0 : keep, new THREE.Vector3(b.cx, b.base + keep, -b.cy), 9, 18, shot, p, { noTopple: true }));
        }
      }
      if (hits.length) scoreHits(hits, shot, new THREE.Vector3(p.x, gy, p.z), { verb: '무너짐!', partVerb: '흔들려 반파!', few: true });
    });
  }
  blastTreesCars(p, RR * 0.6, 6);
  bridgeDamage(p, R * 0.8);
}

// ---------- 무기 3: 레이저
const laserPrev = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.75, depthTest: false, blending: THREE.AdditiveBlending }));
laserPrev.renderOrder = 9; laserPrev.visible = false; scene.add(laserPrev);
const beamMat = new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const beamCore = new THREE.MeshBasicMaterial({ color: 0xfff4e8, transparent: true, opacity: 1, depthWrite: false });
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
const lasers = [];
function laserLen() { return 140 + radius() * 3; }
function clampLaser(a, b) {
  const L = Math.hypot(b.x - a.x, b.z - a.z), mx = laserLen();
  if (L > mx) { b = a.clone().lerp(b, mx / L); }
  return b;
}
function showLaserPrev(a, b) {
  b = clampLaser(a, b);
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  laserPrev.visible = L > 2;
  laserPrev.position.set((a.x + b.x) / 2, Math.max(a.y, b.y, 1) + 0.6, (a.z + b.z) / 2);
  laserPrev.scale.set(L, 1, 2.4 + cam.dist / 400); laserPrev.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
}
function fireLaser(a, b) {
  laserPrev.visible = false;
  b = clampLaser(a, b);
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  if (L < 12) return;
  if (!useShot()) return;
  const shot = newShot(), dur = 0.55;
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const src = new THREE.Vector3((a.x + b.x) / 2, 700, (a.z + b.z) / 2).addScaledVector(fwd, 180);
  const g = new THREE.Group();
  const outer = new THREE.Mesh(beamGeo, beamMat), inner = new THREE.Mesh(beamGeo, beamCore);
  g.add(outer, inner); scene.add(g); g.renderOrder = 8;
  sfx.zap(dur); buzz([15, 20, 15, 20, 15, 20, 15]);
  // 선에 걸린 건물: 지나가는 순서대로
  const items = [];
  for (const bd of city.B) {
    if (bd.gone || bd.cur < 3) continue;
    const x = bd.cx, z = -bd.cy;
    let t = ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / (L * L); t = Math.max(0, Math.min(1, t));
    if (Math.hypot(a.x + (b.x - a.x) * t - x, a.z + (b.z - a.z) * t - z) > bd.rad + 2) continue;
    let hitT = -1;
    for (let d = 0; d <= L; d += 1.5) {
      const px = a.x + (b.x - a.x) * d / L, pz = a.z + (b.z - a.z) * d / L;
      if (bDist(bd, px, pz) < 1.2) { hitT = d / L; break; }
    }
    if (hitT >= 0) items.push({ b: bd, t: hitT });
  }
  const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
  lasers.push({ g, outer, inner, a: a.clone(), b: b.clone(), src, t: 0, dur, items, shot, nx, nz, hits: [], done: false });
}
function stepLasers(dt) {
  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i]; l.t += dt;
    const k = Math.min(1, l.t / l.dur);
    const p = l.a.clone().lerp(l.b, k); p.y = groundAt(p.x, p.z) + 0.5;
    // 위에서 내리꽂는 빔
    const d = new THREE.Vector3().subVectors(p, l.src), len = d.length();
    l.g.position.copy(l.src); l.g.quaternion.setFromUnitVectors(UPV, d.clone().normalize());
    const wob = 1 + Math.sin(l.t * 60) * 0.15;
    l.outer.scale.set(5 * wob, len, 5 * wob); l.inner.scale.set(1.8, len, 1.8);
    if (k < 1) {
      for (let s = 0; s < (IS_TOUCH ? 2 : 4); s++) fire.emit(p.x, p.y + 1, p.z, rnd(14), 6 + Math.random() * 14, rnd(14), 0.4, 5, 1, 1, 1, 0.45, 0.25, 0.9, 30);
      if (Math.random() < 0.5) smoke.emit(p.x, p.y + 1, p.z, rnd(2), 4, rnd(2), 1.4, 5, 16, 0.4, 0.4, 0.36, 0.34);
    }
    for (const it of l.items) {
      if (it.done || it.t > k) continue;
      it.done = true;
      const bd = it.b;
      if (bd.gone || bd.cur < 3) continue;
      const cutY = Math.max(4, bd.cur * (0.3 + Math.random() * 0.25));
      // 건물 중심이 선의 어느 쪽인지 → 그쪽으로 윗부분이 미끄러짐
      const side = Math.sign((bd.cx - l.a.x) * l.nx + (-bd.cy - l.a.z) * l.nz) || 1;
      const dir = new THREE.Vector3(l.nx * side, 0, l.nz * side);
      sfx.sizzle();
      if (bd.cur - cutY >= 5 && slabs.length < MAX_SLABS) {
        makeSlab(bd, cutY, 'slide', dir, l.shot, CHAIN_DEPTH);
        l.hits.push(applyCut(bd, cutY, l.shot));
        // 잘린 면 불꽃
        for (let s = 0; s < 10; s++) fire.emit(bd.cx + rnd(bd.rad * 0.6), bd.base + cutY, -bd.cy + rnd(bd.rad * 0.6), rnd(8), 4 + Math.random() * 6, rnd(8), 0.5, 5, 1, 1, 1, 0.55, 0.3, 0.9, 20);
      } else {
        const gp = new THREE.Vector3(bd.cx, bd.base, -bd.cy);
        fracture(bd, 0, gp.clone().addScaledVector(dir, -10), 10, 20);
        l.hits.push(applyCut(bd, 0, l.shot));
      }
    }
    if (k >= 1 && !l.done) {
      l.done = true;
      decals.scorch(l.a.x, l.a.z, l.b.x, l.b.z, Math.max(l.a.y, l.b.y, 0));
      for (let s = 0; s <= 8; s++) { const q = l.a.clone().lerp(l.b, s / 8); bridgeDamage(q, 3); }
      scoreHits(l.hits, l.shot, l.b.clone(), { verb: '싹둑!', partVerb: '싹둑!' });
    }
    if (l.t > l.dur + 0.12) { scene.remove(l.g); lasers.splice(i, 1); }
  }
}

// ---------- 무기 4: 괴수 발자국 (단단한 공룡 다리 — 늘어나지 않음, 크기는 균일 배율만)
// 발 좌표(발 단위): y 위, +z = 발가락 쪽, 발뒤꿈치 z≈-1.1, 가운데 발톱 끝 z≈2.4
const FOOT_TOES = [{ a: -0.62, L: 1.85 }, { a: 0, L: 2.2 }, { a: 0.62, L: 1.85 }];   // fx.js 발자국 그림과 같은 값
const FOOT_HEEL = -1.0, FOOT_MID = 1.1;            // 발자국 가운데 (탭한 자리에 맞춤)
const FOOT_COL = {
  skin: new THREE.Color(0x3f7a2e), dark: new THREE.Color(0x285020), belly: new THREE.Color(0x9fba66), bellyDark: new THREE.Color(0x7f9c4c),
  sole: new THREE.Color(0x24381c), claw: new THREE.Color(0xf4ead2), clawTip: new THREE.Color(0xbfae88),
};
function footPart(geo, mat4, paint) {
  // 면마다 색(평면 음영 + 비늘 얼룩), 법선은 면 법선
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(mat4); g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal, n = P.count;
  const col = new Float32Array(n * 3), c = new THREE.Color(), nv = new THREE.Vector3(), cv = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    nv.set(N.getX(i), N.getY(i), N.getZ(i));
    cv.set((P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, (P.getY(i) + P.getY(i + 1) + P.getY(i + 2)) / 3, (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3);
    paint(c, nv, cv);
    const j = 0.94 + Math.random() * 0.12;                  // 비늘 얼룩
    for (let k = 0; k < 3; k++) col.set([c.r * j, c.g * j, c.b * j], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function mergeGeos(list, alphaFn) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * (alphaFn ? 4 : 3));
  let o = 0;
  for (const g of list) {
    const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    pos.set(P.array, o * 3); nor.set(N.array, o * 3);
    for (let i = 0; i < P.count; i++) {
      if (alphaFn) col.set([C.getX(i), C.getY(i), C.getZ(i), alphaFn(P.getY(i))], (o + i) * 4);
      else col.set([C.getX(i), C.getY(i), C.getZ(i)], (o + i) * 3);
    }
    o += P.count; g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, alphaFn ? 4 : 3));
  g.computeBoundingSphere();
  return g;
}
const LEG_TILT = -0.3;      // 다리 위쪽이 화면 안쪽(카메라 반대)으로 기움
const ANKLE = new THREE.Vector3(0, 0.95, -0.45);
// 다리 옆모습 (발목부터 높이, 반지름): 발목 굵고 → 잘록 → 종아리 불룩 → 허벅지로 굵어짐
const LEG_PROFILE = [[0.0, 0.8], [0.7, 0.66], [1.6, 0.68], [2.6, 0.86], [3.6, 1.06], [4.6, 1.2], [6.5, 1.42], [8.5, 1.62], [11, 1.82], [13.5, 1.98], [18, 2.2]];
const LEG_SOLID = 13.5;      // 여기까지 불투명, 위는 점점 투명
let footGeo = null, legGeo = null;
function buildFootGeo() {
  const M = () => new THREE.Matrix4();
  const skinPaint = (c, n, p) => {
    if (n.y < -0.55) c.copy(FOOT_COL.sole);
    else if (n.y > 0.55 && p.y > 0.45) c.copy(FOOT_COL.skin).lerp(FOOT_COL.dark, 0.3);   // 발등은 조금 어둡게
    else c.copy(FOOT_COL.skin);
  };
  const parts = [];
  // 발바닥 판 (넓고 낮은 9각) + 볼록한 발등
  parts.push(footPart(new THREE.CylinderGeometry(0.95, 1.05, 0.5, 9), M().makeTranslation(0, 0.25, -0.15).multiply(M().makeScale(1.1, 1, 0.95)), skinPaint));
  parts.push(footPart(new THREE.IcosahedronGeometry(1.0, 1), M().makeTranslation(0, 0.5, -0.2).multiply(M().makeScale(1.05, 0.55, 1.0)), skinPaint));
  // 발가락 3 + 마디 + 휜 발톱
  for (const { a, L } of FOOT_TOES) {
    const ry = M().makeRotationY(a);
    const toe = new THREE.CylinderGeometry(0.27, 0.42, L, 7).rotateX(Math.PI / 2);
    parts.push(footPart(toe, ry.clone().multiply(M().makeTranslation(0, 0.34, 0.5 + L / 2)).multiply(M().makeScale(1, 0.8, 1)), (c, n, p) => {
      skinPaint(c, n, p);
      if (n.y > 0.3) { const r = Math.hypot(p.x, p.z); if (Math.floor(r * 2.6) % 2) c.lerp(FOOT_COL.dark, 0.45); }   // 발가락 마디 줄
    }));
    parts.push(footPart(new THREE.IcosahedronGeometry(0.4, 0), ry.clone().multiply(M().makeTranslation(0, 0.36, 0.5 + L * 0.5)).multiply(M().makeScale(1.05, 0.85, 1.15)), skinPaint));
    parts.push(footPart(new THREE.IcosahedronGeometry(0.31, 0), ry.clone().multiply(M().makeTranslation(0, 0.3, 0.5 + L)), skinPaint));
    // 발톱: 앞·아래로 휜 두 토막
    const c1 = new THREE.ConeGeometry(0.25, 0.55, 6).translate(0, 0.27, 0);
    parts.push(footPart(c1, ry.clone().multiply(M().makeTranslation(0, 0.38, 0.5 + L)).multiply(M().makeRotationX(Math.PI / 2 - 0.2)).multiply(M().makeScale(1, 1, 0.7)),
      (c) => c.copy(FOOT_COL.claw)));
    const c2 = new THREE.ConeGeometry(0.15, 0.5, 6).translate(0, 0.25, 0);
    parts.push(footPart(c2, ry.clone().multiply(M().makeTranslation(0, 0.43, 0.97 + L)).multiply(M().makeRotationX(Math.PI / 2 + 0.85)).multiply(M().makeScale(1, 1, 0.7)),
      (c) => c.copy(FOOT_COL.clawTip)));
  }
  // 뒷발톱
  parts.push(footPart(new THREE.ConeGeometry(0.16, 0.5, 6).translate(0, 0.25, 0), M().makeTranslation(0, 0.4, -1.0).multiply(M().makeRotationX(-Math.PI / 2 - 0.5)), (c) => c.copy(FOOT_COL.claw)));
  // 발목 + 다리: 앞쪽은 밝은 배 비늘(가로 줄), 뒤쪽은 어두운 등
  const legPaint = (c, n, p) => {
    c.copy(FOOT_COL.skin);
    if (n.z > 0.7) c.copy(Math.floor(p.y * 1.9) % 2 ? FOOT_COL.belly : FOOT_COL.bellyDark);
    else if (n.z < -0.4) c.lerp(FOOT_COL.dark, 0.5);
  };
  const legM = M().makeTranslation(ANKLE.x, ANKLE.y, ANKLE.z).multiply(M().makeRotationX(LEG_TILT));
  parts.push(footPart(new THREE.IcosahedronGeometry(0.88, 1), M().makeTranslation(ANKLE.x, ANKLE.y, ANKLE.z).multiply(M().makeScale(1.05, 0.8, 1.1)), legPaint));
  const lathe = (pts) => new THREE.LatheGeometry(pts.map(([h, r]) => new THREE.Vector2(r, h)), 9);
  parts.push(footPart(lathe(LEG_PROFILE.filter(([h]) => h <= LEG_SOLID)), legM, legPaint));
  // 다리 뒤 돌기(비늘판)
  for (let i = 0; i < 4; i++) {
    const h = 0.9 + i * 0.95, r = 0.66 + 0.12 * i;
    parts.push(footPart(new THREE.ConeGeometry(0.2, 0.5, 4), legM.clone().multiply(M().makeTranslation(0, h, -r)).multiply(M().makeRotationX(-Math.PI / 2 - 0.5)),
      (c) => c.copy(FOOT_COL.dark)));
  }
  footGeo = mergeGeos(parts);
  // 허벅지 쪽: 굵어지며 위로 갈수록 투명 (끝이 보이지 않음)
  const up = footPart(lathe(LEG_PROFILE.filter(([h]) => h >= LEG_SOLID)), legM, legPaint);
  const y0 = ANKLE.y + LEG_SOLID * Math.cos(LEG_TILT), y1 = ANKLE.y + 18 * Math.cos(LEG_TILT);
  legGeo = mergeGeos([up], (y) => THREE.MathUtils.clamp(1 - (y - y0) / (y1 - y0), 0, 1) ** 1.4);
}
const footSkinMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const footLegMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
// 발자국 안쪽 판정 점 (발 단위, [x, z, 반지름])
const FOOT_SAMPLES = (() => {
  const s = [[0, -0.2, 0.8]];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; s.push([Math.cos(a) * 0.7, -0.2 + Math.sin(a) * 0.55, 0.42]); }
  for (const { a, L } of FOOT_TOES) for (let t = 0.6; t <= L + 1.0; t += 0.4) s.push([Math.sin(a) * t, Math.cos(a) * t, t > L + 0.5 ? 0.18 : 0.38]);
  return s;
})();
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const footPool = [];
function getFoot() {
  let o = footPool.find((x) => !x.busy);
  if (!o) {
    if (!footGeo) buildFootGeo();
    const root = new THREE.Group(), pivot = new THREE.Group();
    const skin = new THREE.Mesh(footGeo, footSkinMat), leg = new THREE.Mesh(legGeo, footLegMat);
    skin.castShadow = renderer.shadowMap.enabled; leg.renderOrder = 4;
    pivot.position.z = FOOT_HEEL; skin.position.z = -FOOT_HEEL; leg.position.z = -FOOT_HEEL;   // 뒤꿈치 축으로 까딱
    pivot.add(skin, leg); root.add(pivot); root.visible = false; scene.add(root);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, depthTest: false }));
    sh.renderOrder = 3; sh.visible = false; scene.add(sh);
    o = { root, pivot, sh, busy: false }; footPool.push(o);
  }
  o.busy = true; return o;
}
function freeFoot(o) { o.busy = false; o.root.visible = false; o.sh.visible = false; }
const feet = [];
const FT = { sh: 0.35, down: 0.25, slap: 0.07, hold: 0.3, lift: 0.5 };
function footToWorld(f, x, z, out) {   // 발 단위 (x,z) → 월드 (발이 내려앉은 자리 기준)
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw), lx = x * f.k, lz = (z - FOOT_MID) * f.k;
  out.x = f.p.x + lx * c + lz * s; out.z = f.p.z - lx * s + lz * c; return out;
}
function footCover(f, b) {   // 건물과 발바닥의 최소 틈 (0 이하 = 밟힘)
  let d = 1e9; const w = { x: 0, z: 0 };
  for (const [x, z, r] of FOOT_SAMPLES) { footToWorld(f, x, z, w); d = Math.min(d, bDist(b, w.x, w.z) - r * f.k); if (d <= 0) return d; }
  return d;
}
function placeFoot(f, y, pitch, back) {
  const w = { x: 0, z: 0 }; footToWorld(f, 0, -back, w);
  f.o.root.position.set(w.x, f.gy + y, w.z); f.o.pivot.rotation.x = pitch;
}
function stomp(p) {
  if (!useShot()) return;
  const R = radius(), k = R * 0.9;   // 레벨에 따라 균일 배율만 (발자국 = 피해 범위)
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const yaw = Math.atan2(-fwd.x, -fwd.z) + 0.35;   // 발가락이 카메라 쪽(살짝 비스듬)
  const o = getFoot(), gy = groundAt(p.x, p.z);
  const f = { o, p: p.clone(), gy, k, R, yaw, t: 0, hit: false, slapped: false, dropped: false, top: 0 };
  o.root.scale.setScalar(k); o.root.rotation.y = yaw;
  const c = { x: 0, z: 0 }; footToWorld(f, 0, FOOT_MID, c);
  o.sh.position.set(c.x, gy + 0.8, c.z); o.sh.rotation.y = yaw; o.sh.visible = true; o.sh.scale.set(0.001, 1, 0.001);
  for (const b of city.B) {
    if (b.gone || Math.hypot(b.cx - p.x, -b.cy - p.z) - b.rad > k * 2.6) continue;
    if (footCover(f, b) <= 0) f.top = Math.max(f.top, b.cur);
  }
  f.H0 = Math.max(600, k * 26);
  placeFoot(f, f.H0, -0.3, 0);
  feet.push(f);
  sfx.stompRumble(); shake(5); if (IS_TOUCH) buzz(25);
}
function stepFeet(dt) {
  for (let i = feet.length - 1; i >= 0; i--) {
    const f = feet[i]; f.t += dt;
    const t = f.t, T1 = FT.sh, T2 = T1 + FT.down, T3 = T2 + FT.slap, T4 = T3 + FT.hold, T5 = T4 + FT.lift;
    let y, pitch, back = 0;
    if (t < T1) { y = f.H0; pitch = -0.3; if (t < T1 - 0.05) shake(4); }
    else if (t < T2) {                       // 빠르게 내려옴 (ease-in), 발가락 들고 뒤꿈치부터
      if (!f.dropped) { f.dropped = true; f.o.root.visible = true; sfx.drop(FT.down); }
      const q = (t - T1) / FT.down; y = f.H0 * (1 - q * q); pitch = -0.3 + 0.08 * q; back = 1.2 * (1 - q);
    } else if (t < T3) { y = 0; const q = (t - T2) / FT.slap; pitch = -0.22 * (1 - q * q); }   // 발가락 철썩
    else if (t < T4) { y = 0; pitch = 0; }
    else {                                    // 들어 올려 뒤로 빠짐 (ease-in-out)
      const q = Math.min(1, (t - T4) / FT.lift), e = q * q * (3 - 2 * q);
      y = f.H0 * e * e * e; pitch = 0.35 * Math.min(1, e * 2); back = 4 * e;
    }
    placeFoot(f, y, pitch, back);
    // 그림자: 내려올수록 커지고 진해짐
    const near = t < T2 ? Math.min(1, t / T2) : t < T4 ? 1 : 1 - Math.min(1, (t - T4) / FT.lift);
    const sk = 0.5 + 0.5 * near * near;
    f.o.sh.scale.set(f.k * 4.0 * sk, 1, f.k * 5.0 * sk); f.o.sh.material.opacity = 0.4 + 0.45 * near;
    if (!f.hit && t >= T1 && y <= Math.max(0, f.top - 2) && (f.top > 2 || t >= T2)) { f.hit = true; stompHit(f); }
    if (!f.slapped && t >= T3) { f.slapped = true; shake(10); sfx.thud(0.5); }
    if (t >= T5) { freeFoot(f.o); feet.splice(i, 1); }
  }
}
function stompHit(f) {
  const { p, k } = f, shot = newShot();
  const gp = new THREE.Vector3(p.x, f.gy + 0.6, p.z);
  flash(0.35); hitstop(0.12); shake(22 + f.R * 0.2); if (IS_TOUCH) buzz([110, 30, 70]); sfx.thud(1.2);
  rings.add(gp.x, gp.y, gp.z, k * 1.9, 0xfff2c8, 0.9); rings.add(gp.x, gp.y, gp.z, k * 1.4, 0xc9a46c, 1.2, 0.06, true);
  decals.footprint(gp.x, gp.y, gp.z, k, f.yaw, FOOT_MID);
  const lf = load(), w = { x: 0, z: 0 };
  for (let i = 0; i < 70 * lf; i++) {   // 발바닥 둘레에서 먼지가 바깥으로
    const [x, z] = FOOT_SAMPLES[1 + Math.floor(Math.random() * (FOOT_SAMPLES.length - 1))];
    footToWorld(f, x * 1.3, (z - FOOT_MID) * 1.3 + FOOT_MID, w);
    let dx = w.x - p.x, dz = w.z - p.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const sp = k * (1.6 + Math.random() * 1.8);
    smoke.emit(w.x, gp.y + 2, w.z, dx * sp, 1 + Math.random() * 6, dz * sp, 1.6 + Math.random() * 1.6, 8 + k * 0.25, 26 + k * 0.7, 0.45, 0.82, 0.77, 0.68, 0.86);
  }
  const hits = [];
  for (const b of city.B) {
    if (b.gone || Math.hypot(b.cx - p.x, -b.cy - p.z) - b.rad > k * 3.2) continue;
    const d = footCover(f, b);
    if (d <= 0) hits.push(knock(b, 0, gp, 10, k * 1.6, shot, gp, { noTopple: true, down: 0.85 }));        // 밟힘: 납작
    else if (d < k * 0.45) { const keep = b.cur * 0.5; hits.push(knock(b, b.cur >= TALL ? 0 : (keep < 3 ? 0 : keep), gp, 14, k * 1.6, shot, gp, { force: true })); }   // 옆: 바깥으로
  }
  blastTreesCars(p, k * 1.45, 14);
  bridgeDamage(p, k * 1.5);
  scoreHits(hits, shot, gp, { verb: '납작!', partVerb: '꿈틀 반파!' });
}

// ---------- 화면 글자
const pops = [];
function popup(world, html, delay = 0, big = false, row = 0, cls = '') {
  const el = document.createElement('div');
  el.className = 'pop' + (big ? ' hot' : '') + (cls ? ' ' + cls : ''); el.innerHTML = html; el.style.opacity = '0';
  $('popups').appendChild(el);
  const o = { el, world, t: -delay, row };
  pops.push(o);
  if (pops.length > 12) { const x = pops.shift(); x.el.remove(); }
  return o;
}
function stepPops(dt) {
  const v = new THREE.Vector3();
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt;
    if (p.t < 0) continue;
    const k = p.t / 2.2;
    if (k >= 1) { p.el.remove(); pops.splice(i, 1); continue; }
    v.copy(p.world).project(camera);
    const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight - 40 * k - 10 + p.row * 30;
    const w = p.el.offsetWidth;
    const cx = Math.max(6, Math.min(innerWidth - w - 6, x - w / 2));
    const sc = k < 0.08 ? 0.6 + k * 5 : 1;
    p.el.style.transform = `translate(${cx}px, ${Math.max(150, Math.min(innerHeight - 110, y))}px) scale(${sc})`;
    p.el.style.opacity = String(k < 0.08 ? k / 0.08 : k > 0.75 ? (1 - k) / 0.25 : 1);
  }
}
let banTimer;
function banner(t) {
  const b = $('banner'); b.textContent = t; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(banTimer); banTimer = setTimeout(() => b.classList.remove('show'), 1500);
}
function updateHud() {
  $('hScore').textContent = won(G.price);
  $('hMeteor').textContent = G.meteors;
  $('hTime').textContent = Math.ceil(G.time);
  $('hDest').textContent = G.dest;
  $('hPct').textContent = (G.destVol / totalVol * 100).toFixed(2);
  $('hLv').textContent = G.lvl; $('hRad').textContent = radius();
  missionEvent('price', {});
}

// ---------- 미션
const SIBUM = new Set(['한양아파트', '현대아파트', '삼성아파트', '한신아파트', '우성아파트']);
let POOL = [];
function centerOf(list) { let x = 0, z = 0; for (const b of list) { x += b.cx; z -= b.cy; } return { x: x / list.length, z: z / list.length }; }
function densest(list, r = 90) {   // 이웃이 가장 많은 건물 위치
  let best = list[0], bn = -1;
  for (const a of list) { let n = 0; for (const b of list) if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < r) n++; if (n > bn) { bn = n; best = a; } }
  return { x: best.cx, z: -best.cy };
}
function buildMissionPool() {
  const B = city.B, P = [];
  const ak = B.filter((b) => b.d.n === 'AK PLAZA 분당점');
  if (ak.length) {
    const main = ak.reduce((a, b) => (b.price > a.price ? b : a));
    P.push({ id: 'ak', t: 'AK PLAZA 분당점 무너뜨리기', at: { x: main.cx, z: -main.cy }, bonus: 3e11, test: () => (main.gone ? 1 : 0) });
  }
  const byName = new Map();
  for (const b of B) if (b.d.n && b.d.k === 'apt') { if (!byName.has(b.d.n)) byName.set(b.d.n, []); byName.get(b.d.n).push(b); }
  const cx = [...byName.entries()].filter(([, l]) => l.length >= 5);
  for (const [nm, l] of cx) {
    const N = Math.min(4, l.length);
    P.push({ id: 'cx:' + nm, kind: 'cx', t: `${nm} ${N}채 부수기`, at: densest(l), bonus: 2e11, n: N, set: new Set(l), cnt: 0,
      test(m) { return Math.min(1, m.cnt / m.n); }, prog: (m) => `${Math.min(m.cnt, m.n)}/${m.n}` });
  }
  P.push({ id: 'one5', t: '한 방에 5채', bonus: 2.5e11, best: 0, test: (m) => Math.min(1, m.best / 5), prog: (m) => `${Math.min(5, m.best)}/5` });
  const tallRow = B.filter((b) => b.h >= 70);
  P.push({ id: 'chain4', t: '연쇄 ×4 만들기', at: tallRow.length ? densest(tallRow, 120) : null, bonus: 3e11, best: 0,
    test: (m) => Math.min(1, m.best / 4), prog: (m) => `${Math.min(4, m.best)}/4` });
  if (city.bridge.length && MP.isHome()) {
    const ids = [...new Set(city.bridge.map((d) => d.bid))];
    const cs = ids.map((id) => { const l = city.bridge.filter((d) => d.bid === id); return { x: l.reduce((s, d) => s + d.x, 0) / l.length, z: l.reduce((s, d) => s + d.z, 0) / l.length }; });
    cs.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    P.push({ id: 'bridge', t: '탄천 다리 끊기', at: cs[0], bonus: 2e11, cut: 0, test: (m) => (m.cut ? 1 : 0) });
  }
  const sib = B.filter((b) => SIBUM.has(b.d.n) && b.cx > 150 && MP.isHome());
  if (sib.length) {
    const tot = sib.reduce((s, b) => s + b.price, 0), PCT = 15;
    P.push({ id: 'sibum', t: `시범단지 ${PCT}% 부수기`, at: densest(sib, 120), bonus: 3e11, set: new Set(sib), v: 0, tot,
      test: (m) => Math.min(1, m.v / m.tot / (PCT / 100)), prog: (m) => `${Math.min(PCT, m.v / m.tot * 100).toFixed(0)}/${PCT}%` });
  }
  const f20 = B.filter((b) => b.d.f >= 20);
  if (f20.length >= 3) P.push({ id: 'f20', t: '20층 이상 3채', at: densest(f20, 120), bonus: 2.5e11, cnt: 0, test: (m) => Math.min(1, m.cnt / 3), prog: (m) => `${Math.min(3, m.cnt)}/3` });
  const mk = MK.mission(); if (mk) P.push(mk);
  P.push({ id: 'jo', t: '3조 원 넘기기', bonus: 2e11, test: () => Math.min(1, G.price / 3e12), prog: () => `${wonShort(Math.min(G.price, 3e12))}` });
  P.push(...MP.missions(B));
  POOL = P;
}
function pickMissions() {
  const pool = POOL.slice();
  const cxs = pool.filter((m) => m.kind === 'cx');
  const one = cxs[Math.floor(Math.random() * cxs.length)];
  const cand = pool.filter((m) => m.kind !== 'cx' || m === one);
  const out = [];
  if (QS.get('mis')) for (const id of QS.get('mis').split(',')) { const m = cand.find((x) => x.id === id || x.id.startsWith(id)); if (m && !out.includes(m)) out.push(m); }
  while (out.length < 3 && cand.length) {
    const m = cand.splice(Math.floor(Math.random() * cand.length), 1)[0];
    if (!out.includes(m)) out.push(m);
  }
  G.missions = out.map((m) => Object.assign(Object.create(m), { done: false, cnt: 0, best: 0, cut: 0, v: 0, p: 0 }));
  renderMissions();
}
function renderMissions() {
  const ul = $('missions'); ul.innerHTML = '';
  G.missions.forEach((m) => {
    const li = document.createElement('li');
    li.className = m.done ? 'done' : '';
    li.innerHTML = `<span class="ck"></span><span>${esc(m.t)}</span>${m.prog ? `<span class="pg">${m.prog(m)}</span>` : ''}${m.at && !m.done ? '<span class="go">📍</span>' : ''}`;
    li.onclick = (e) => { e.stopPropagation(); if (m.at) easeCam({ tx: m.at.x, tz: m.at.z, dist: IS_TOUCH ? 640 : 560 }, 1.1); };
    ul.appendChild(li);
  });
}
function missionEvent(type, ev) {
  if (G.state !== 'play' || !G.missions.length) return;
  let changed = false;
  for (const m of G.missions) {
    if (m.done) continue;
    const before = m.prog ? m.prog(m) : '';
    if (type === 'cut') {
      if (m.kind === 'cx' && ev.full && m.set.has(ev.b)) m.cnt++;
      if (m.id === 'sibum' && m.set.has(ev.b)) m.v += ev.val;
      if (m.id === 'f20' && ev.full && ev.b.d.f >= 20) m.cnt++;
      if (m.id === 'one5') m.best = Math.max(m.best, ev.shot.full);
    }
    if (type === 'chain' && m.id === 'chain4') m.best = Math.max(m.best, ev.shot.chain);
    if (type === 'bridge' && m.id === 'bridge') m.cut++;
    const p = m.test(m);
    if (m.prog && m.prog(m) !== before) changed = true;
    if (p >= 1) {
      m.done = true; changed = true;
      G.bonus += m.bonus; G.price += m.bonus;
      later(0.6, () => { banner(`미션 완료! +${wonShort(m.bonus)}`); sfx.fanfare(); buzz([30, 40, 30, 40, 80]); updateHud(); });
    }
  }
  if (changed) renderMissions();
}

// ---------- 우리 집
let homePin = null, homeRing = null;
function pinTex(txt, bg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.beginPath(); g.roundRect(18, 10, 220, 74, 22); g.fill();
  g.beginPath(); g.moveTo(108, 82); g.lineTo(128, 118); g.lineTo(148, 82); g.fill();
  g.fillStyle = '#fff'; g.font = '800 40px "Apple SD Gothic Neo","Malgun Gothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(txt, 128, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function setHome(i) {
  G.home = i;
  // 색 되돌리고 새로 칠함
  const C = city.bmesh.geometry.attributes.color;
  C.array.set(city.origCol); C.needsUpdate = true;
  if (homePin) { scene.remove(homePin); homePin.material.map.dispose(); homePin.material.dispose(); homePin = null; }
  if (homeRing) { scene.remove(homeRing); homeRing = null; }
  if (i < 0) { $('homeSel').textContent = ''; return; }
  const b = city.B[i];
  tintHome(b);
  homePin = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTex('🏠 우리 집', '#2f9e55'), depthTest: false, transparent: true }));
  homePin.scale.set(52, 26, 1); homePin.renderOrder = 11; homePin.center.set(0.5, 0.05);
  homePin.position.set(b.cx, b.base + b.h + 4, -b.cy); scene.add(homePin);
  homeRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x3ad070, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  homeRing.position.set(b.cx, b.base + 1, -b.cy); homeRing.renderOrder = 4; scene.add(homeRing);
  $('homeSel').textContent = `🏠 ${label(b)}${b.d.a ? ' · ' + b.d.a : ''}`;
}
function tintHome(b) {
  const C = city.bmesh.geometry.attributes.color, A = C.array;
  for (let k = b.start; k < b.start + b.count; k++) {
    A[k * 3] = A[k * 3] * 0.45 + 1.0 * 0.55; A[k * 3 + 1] = A[k * 3 + 1] * 0.45 + 0.78 * 0.55; A[k * 3 + 2] = A[k * 3 + 2] * 0.45 + 0.25 * 0.55;
  }
  C.needsUpdate = true;
}
function homeHit(full) {
  const b = city.B[G.home];
  if (full && !G.homeLost) {
    G.homeLost = true;
    later(0.5, () => { banner('내 집 날림…'); sfx.sad(); buzz([200, 100, 300]); });
    popup(new THREE.Vector3(b.cx, b.base + b.h + 20, -b.cy), '내 집 날림… <em>끝나면 −30%</em>', 0.3, true, -1);
    if (homePin) { homePin.material.map.dispose(); homePin.material.map = pinTex('💥 내 집…', '#c23a12'); }
    if (homeRing) homeRing.visible = false;
  } else if (!full) popup(new THREE.Vector3(b.cx, b.base + b.h + 20, -b.cy), '우리 집 흔들림!', 0.2, false, -1);
}
const HOME_SAFE_N = 15;
function homeSearch(q) {
  const ul = $('homeList'); ul.innerHTML = '';
  q = q.trim().replace(/\s+/g, ' ');
  if (!q) { ul.innerHTML = '<li class="empty">이름이나 주소를 입력하세요</li>'; return; }
  const terms = q.toLowerCase().split(' ');
  const res = [];
  const seen = new Set();
  for (const b of city.B) {
    const d = b.d;
    if (!d.n && !d.a) continue;
    const hay = `${d.n} ${d.d} ${d.a} ${d.j} ${KIND[d.k] || ''}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue;
    const key = d.n + '|' + d.d + '|' + d.a;
    if (seen.has(key)) continue;
    seen.add(key);
    res.push(b);
    if (res.length >= 40) break;
  }
  if (!res.length) { ul.innerHTML = '<li class="empty">없어요. 다른 이름으로 찾아보세요</li>'; return; }
  for (const b of res) {
    const li = document.createElement('li');
    li.innerHTML = `${esc(label(b))} <small>${esc([b.d.j, b.d.a].filter(Boolean).join(' ') || KIND[b.d.k] || '')} · ${b.d.f}층</small>`;
    li.onclick = () => { setHome(b.i); closeHome(); };
    ul.appendChild(li);
  }
}
function openHome() {
  if (!city) return; $('homePanel').classList.remove('hidden'); $('homeQ').value = ''; homeSearch(''); setTimeout(() => $('homeQ').focus(), 50); }
function closeHome() { $('homePanel').classList.add('hidden'); }
$('homeBtn').onclick = openHome;
$('homeClose').onclick = closeHome;
$('homeNone').onclick = () => { setHome(-1); closeHome(); };
$('homeQ').addEventListener('input', (e) => homeSearch(e.target.value));

// ---------- 도전 링크
const CH = (() => {
  const by = (QS.get('by') || '').replace(/[<>]/g, '').slice(0, 12);
  const score = Math.max(0, Number(QS.get('score')) || 0);
  const home = QS.get('home') || '';
  return { by, score, home, mode: 'guard', active: !!(score || home) };
})();
function setupChallenge() {
  if (!CH.active) return;
  const i = CH.home ? city.B.findIndex((b) => b.d.id === CH.home) : -1;
  if (i >= 0) setHome(i);
  const who = CH.by ? `<b>${esc(CH.by)}</b>님이` : '친구가';
  const el = $('chal'); el.classList.remove('hidden');
  const homeTxt = i >= 0 ? `<br>${CH.by ? esc(CH.by) + '님' : '친구'} 집: <b>${esc(label(city.B[i]))}</b>` : '';
  el.innerHTML = `${who} <b>${won(CH.score)}</b>을 부쉈어요.${homeTxt}` +
    (i >= 0 ? `<div class="tg"><button data-m="guard" class="on">이 집 지키기</button><button data-m="smash">이 집 부수기</button></div>` : '');
  el.querySelectorAll('button').forEach((bt) => (bt.onclick = () => {
    CH.mode = bt.dataset.m; el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === bt));
  }));
}
function shareUrl() {
  const u = new URL(location.href.split('?')[0].split('#')[0]);
  if (G.home >= 0) u.searchParams.set('home', city.B[G.home].d.id);
  MP.decorateUrl(u); u.searchParams.set('score', String(Math.round(G.price)));
  const nick = $('nick').value.trim().slice(0, 12);
  if (nick) u.searchParams.set('by', nick);
  return u.toString();
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove(); return ok;
  }
}
const shareText = () => `${MP.title()}: ${MP.isHome() ? '집값' : '건물값'} ${won(G.price)} 날림! 이 기록 깰 수 있어요?`;
function saveNick() { store('seohyeon-smash-nick', $('nick').value.trim().slice(0, 12)); }
async function copyLinkNow() { saveNick(); const url = shareUrl(); $('shareMsg').textContent = (await copyText(`${shareText()}
${url}`)) ? '도전 링크를 복사했어요. 카톡에 붙여 넣으세요' : url; }
$('copyLink').onclick = copyLinkNow;

// ---------- 결과 카드 (1080×1350)
function cardShot(w, h) {
  // 부서진 곳 가운데를 보기 좋은 각도로
  const gone = city.B.filter((b) => b.gone || b.cur < b.h - 1);
  const c = gone.length ? centerOf(gone) : { x: cam.tx, z: cam.tz };
  let spread = 0; for (const b of gone) spread = Math.max(spread, Math.hypot(b.cx - c.x, -b.cy - c.z));
  const dist = THREE.MathUtils.clamp(spread * 2.4 + 380, 480, 1500);
  const cc = new THREE.PerspectiveCamera(34, w / h, 8, 8000);
  const el = THREE.MathUtils.degToRad(36), az = cam.az;
  cc.position.set(c.x + Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, c.z + Math.cos(az) * Math.cos(el) * dist);
  cc.lookAt(c.x, 0, c.z);
  // 같은 작업 안에서 그리고 바로 복사 (화면에는 원래 장면이 다시 그려짐)
  const shadowWas = renderer.shadowMap.enabled;
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  if (homePin) homePin.scale.set(80, 40, 1);
  renderer.render(scene, cc);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(canvas, 0, 0, w, h);
  if (homePin) homePin.scale.set(52, 26, 1);
  renderer.setPixelRatio(DPR); resize(); renderer.shadowMap.enabled = shadowWas;
  renderer.render(scene, camera);
  return cv;
}
function wrapLines(g, text, maxW) {
  const out = []; let line = '';
  for (const ch of text) { if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
  if (line) out.push(line); return out;
}
async function makeCard() {
  const W = 1080, H = 1350, PH = 820;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const F = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
  g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, H);
  g.drawImage(cardShot(W, PH), 0, 0);
  const gr = g.createLinearGradient(0, PH - 260, 0, PH); gr.addColorStop(0, 'rgba(20,24,32,0)'); gr.addColorStop(1, 'rgba(20,24,32,0.78)');
  g.fillStyle = gr; g.fillRect(0, PH - 260, W, 260);
  // 상단 띠
  g.fillStyle = 'rgba(255,253,248,0.92)'; g.beginPath(); g.roundRect(40, 40, 380, 70, 35); g.fill();
  g.fillStyle = '#d2451e'; g.font = `900 40px ${F}`; g.textBaseline = 'middle'; g.fillText(MP.title(), 72, 76);
  const mks = MK.summary();   // 날린 시가총액 알약 (사진 오른쪽 위)
  if (mks.capLost > 0) {
    const t1 = `📉 날린 시총 ${wonShort(mks.capLost)}`, t2 = mks.worst ? `${mks.worst.name} ${mks.worst.pct.toFixed(1)}% · 가상 주가` : '가상 주가';
    g.font = `900 36px ${F}`; const w1 = g.measureText(t1).width; g.font = `700 24px ${F}`; const pw = Math.max(w1, g.measureText(t2).width) + 48;
    g.fillStyle = 'rgba(22,16,15,0.9)'; g.beginPath(); g.roundRect(W - 40 - pw, 40, pw, 104, 24); g.fill();
    g.textAlign = 'right'; g.fillStyle = '#ff5a4f'; g.font = `900 36px ${F}`; g.fillText(t1, W - 64, 76);
    g.fillStyle = '#ffd24a'; g.font = `700 24px ${F}`; g.fillText(t2, W - 64, 118); g.textAlign = 'left';
  }
  // 큰 글자
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  g.font = `900 64px ${F}`; g.fillText(MP.place(), 60, PH - 130);
  const big = won(G.price).replace(' 원', '원');
  let fs = 108; g.font = `900 ${fs}px ${F}`;
  while (g.measureText(big + ' 날렸다').width > W - 120 && fs > 60) { fs -= 4; g.font = `900 ${fs}px ${F}`; }
  g.fillStyle = '#ffd24a'; g.fillText(big, 60, PH - 30);
  const bw = g.measureText(big).width;
  g.fillStyle = '#fff'; g.fillText(' 날렸다', 60 + bw, PH - 30);
  // 통계
  let y = PH + 78;
  g.fillStyle = '#1d2430'; g.font = `800 40px ${F}`;
  const pct = (G.destVol / totalVol * 100).toFixed(2);
  g.fillText(`붕괴 ${G.dest}채 · 파괴율 ${pct}% · 최고 연쇄 ×${G.chainBest}`, 60, y);
  y += 62;
  g.font = `700 36px ${F}`; g.fillStyle = '#3a4252';
  const bigName = G.big ? `가장 큰 건물: ${G.big.name} (${wonShort(G.big.val)})` : '가장 큰 건물: -';
  for (const ln of wrapLines(g, bigName, W - 120).slice(0, 2)) { g.fillText(ln, 60, y); y += 50; }
  y += 6;
  g.font = `800 34px ${F}`;
  for (const m of G.missions) {
    g.fillStyle = m.done ? '#289650' : '#9aa0aa';
    g.fillText(`${m.done ? '✔' : '✘'} ${m.t}`, 60, y); y += 50;
  }
  WAR.drawCard(g, 40, 126, F);   // 참전국 국기 줄
  const hn = homeNote();
  if (hn) { g.fillStyle = G.homeLost ? '#c23a12' : '#2b6a3c'; g.font = `800 36px ${F}`; g.fillText(hn, 60, y + 6); }
  // 바닥 띠
  g.fillStyle = '#d2451e'; g.fillRect(0, H - 96, W, 96);
  g.fillStyle = '#fff'; g.font = `800 38px ${F}`; g.textBaseline = 'middle';
  g.fillText(SITE, 60, H - 48);
  g.textAlign = 'right'; g.font = `700 30px ${F}`; g.fillText('너도 부숴 봐 →', W - 60, H - 48); g.textAlign = 'left';
  return cv;
}
let lastCardBlob = null;
async function cardFile() {
  if (lastCardBlob) return new File([lastCardBlob], 'seohyeon-smash.png', { type: 'image/png' });
  $('shareMsg').textContent = '그림 만드는 중…';
  await new Promise((r) => setTimeout(r, 30));
  const cv = await makeCard();
  lastCardBlob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  
  return new File([lastCardBlob], 'seohyeon-smash.png', { type: 'image/png' });
}
function downloadCard() { const a = document.createElement('a'); a.href = URL.createObjectURL(lastCardBlob); a.download = 'seohyeon-smash.png'; document.body.appendChild(a); a.click(); a.remove(); }
// 한 번에 보내기: 그림 + 도전 링크. 공유 창이 없으면(PC) 그림 저장 + 링크 복사
$('shareAll').onclick = async () => {
  saveNick();
  const file = await cardFile(), url = shareUrl(), text = shareText();
  if (navigator.share) {
    const withFile = navigator.canShare && navigator.canShare({ files: [file] });
    try { await navigator.share(withFile ? { files: [file], title: '서현역 부수기', text: `${text}
${url}` } : { title: '서현역 부수기', text, url }); $('shareMsg').textContent = '보냈어요!'; return; }
    catch (e) { if (e && e.name === 'AbortError') { $('shareMsg').textContent = ''; return; } }
  }
  downloadCard(); const ok = await copyText(`${text}
${url}`);
  $('shareMsg').textContent = ok ? '그림을 저장하고 링크를 복사했어요' : '그림을 저장했어요';
};
$('saveImg').onclick = async () => { await cardFile(); downloadCard(); $('shareMsg').textContent = '그림을 저장했어요'; };

// ---------- 입력: 드래그 이동 / 핀치·휠 확대 / 탭 = 무기
const pointers = new Map();
let tapStart = null, pinch0 = null, laserA = null;
const ray = new THREE.Raycaster();
function screenToGround(x, y, h = 0) {
  ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const t = (h - ray.ray.origin.y) / ray.ray.direction.y;
  return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
}
function pick(x, y) {
  ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObject(city.bmesh, false)[0];
  let p = screenToGround(x, y, 0);
  if (groundAt(p.x, p.z) > 0) p = screenToGround(x, y, data.PH);
  if (hit && hit.distance < ray.ray.origin.distanceTo(p)) p = hit.point;
  if (Math.hypot(p.x, p.z) > data.R - 5) return null;
  return p;
}
function groundPick(x, y) {   // 레이저용: 지면
  let p = screenToGround(x, y, 0);
  if (groundAt(p.x, p.z) > 0) p = screenToGround(x, y, data.PH);
  const r = Math.hypot(p.x, p.z);
  if (r > data.R - 5) p.multiplyScalar((data.R - 5) / r);
  return p;
}
function fire1(p) {
  if (AR.isK(G.weapon)) { AR.fire(G.weapon, p); return; }
  if (G.weapon === 'quake') quake(p);
  else if (G.weapon === 'stomp') stomp(p);
  else launch(p);
}
const laserMode = () => (G.weapon === 'laser' || AR.isDrag(G.weapon)) && G.state === 'play';
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button });
  if (pointers.size === 1) {
    tapStart = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    laserA = laserMode() && e.button === 0 && city ? groundPick(e.clientX, e.clientY) : null;
  } else { tapStart = null; laserA = null; laserPrev.visible = false; pinch0 = pinchInfo(); }
  cam.anim = null;
});
function pinchInfo() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.dist };
}
canvas.addEventListener('pointermove', (e) => {
  const pr = pointers.get(e.pointerId);
  if (!pr || !city) return;
  const nx = e.clientX, ny = e.clientY;
  if (pointers.size === 1) {
    if (tapStart) tapStart.moved += Math.hypot(nx - pr.x, ny - pr.y);
    if (laserA) showLaserPrev(laserA, groundPick(nx, ny));
    else {
      const a = screenToGround(pr.x, pr.y), b = screenToGround(nx, ny);
      cam.tx += a.x - b.x; cam.tz += a.z - b.z; clampCam();
    }
  } else if (pointers.size === 2) {   // 두 손가락: 가운데 점으로 이동
    const ps = [...pointers.values()];
    const mx0 = (ps[0].x + ps[1].x) / 2, my0 = (ps[0].y + ps[1].y) / 2;
    const ps2 = ps.map((q) => (q === pr ? { x: nx, y: ny } : q));
    const mx1 = (ps2[0].x + ps2[1].x) / 2, my1 = (ps2[0].y + ps2[1].y) / 2;
    const a = screenToGround(mx0, my0), b = screenToGround(mx1, my1);
    cam.tx += a.x - b.x; cam.tz += a.z - b.z; clampCam();
  }
  pr.x = nx; pr.y = ny;
  if (pointers.size === 2 && pinch0) {
    const now = pinchInfo();
    cam.dist = THREE.MathUtils.clamp(pinch0.dist * pinch0.d / Math.max(10, now.d), 120, MAXD());
  }
});
function up(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch0 = null;
  if (laserA && pointers.size === 0) {
    if (tapStart && tapStart.moved >= 10) { if (AR.isDrag(G.weapon)) { laserPrev.visible = false; AR.fireLine(laserA, clampLaser(laserA, groundPick(e.clientX, e.clientY))); } else fireLaser(laserA, groundPick(e.clientX, e.clientY)); }
    else { laserPrev.visible = false; if (tapStart && G.state === 'play') showModeHint(); }
    laserA = null; tapStart = null; return;
  }
  if (tapStart && pointers.size === 0 && tapStart.moved < 10 && performance.now() - tapStart.t < 500 && G.state === 'play') {
    const p = pick(e.clientX, e.clientY);
    if (p) fire1(p);
  }
  if (pointers.size === 0) tapStart = null;
}
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault(); cam.anim = null;
  cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 120, MAXD());
}, { passive: false });
function clampCam() {
  const r = Math.hypot(cam.tx, cam.tz), mx = data ? data.R * 0.95 : 1000;
  if (r > mx) { cam.tx *= mx / r; cam.tz *= mx / r; }
}

// ---------- 라운드
function startRound() {
  sfx.init();
  if (sfx.ctx && sfx.ctx.state === 'suspended') sfx.ctx.resume();
  Object.assign(G, { armed: false, state: 'play', price: 0, dest: 0, destVol: 0, meteors: ROUND_METEORS, time: ROUND_TIME, lvl: 1, combo: 0, chainBest: 0,
    big: null, endWait: 0, homeLost: false, homeSafeShown: false, bonus: 0 });
  if (!unlocked(WEAPONS.find((w) => w.id === G.weapon))) G.weapon = 'meteor';
  $('start').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden'); $('weapons').classList.remove('hidden');
  $('cardPrev').classList.add('hidden');
  const hb = G.home >= 0 ? city.B[G.home] : null;
  easeCam(hb ? { tx: hb.cx, tz: -hb.cy, dist: IS_TOUCH ? 640 : 540 } : { tx: 15, tz: 30, dist: IS_TOUCH ? 620 : 520 }, 2.2);
  pickMissions(); MK.reset(); WAR.reset(); AR.reset(); renderWeapons();
  MP.start();
  updateHud();
  showTapHint();
}
let hintTimer = 0;
function showTapHint() {
  const h = $('tapHint'); clearTimeout(hintTimer);
  h.classList.add('hidden');
  hintTimer = setTimeout(() => { if (G.state === 'play' && !G.armed) h.classList.remove('hidden'); }, 1600);
}
function hideTapHint() { clearTimeout(hintTimer); $('tapHint').classList.add('hidden'); }
function resetCity() {
  const g = city.bmesh.geometry;
  g.attributes.position.array.set(city.origPos); g.attributes.uv.array.set(city.origUV);
  g.attributes.position.needsUpdate = g.attributes.uv.needsUpdate = true;
  for (const b of city.B) { b.cur = b.h; b.gone = false; }
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), p = new THREE.Vector3();
  city.treeState.forEach((t, i) => { if (t.done) { p.set(t.x, t.y, t.z); s.set(t.sc, t.sy, t.sc); m.compose(p, t.rot, s); city.trees.setMatrixAt(i, m); t.done = false; } });
  city.trees.instanceMatrix.needsUpdate = true;
  fallingTrees.length = 0;
  city.carState.forEach((c, i) => { if (c.gone) { m.compose(p.set(c.x, c.y, c.z), c.rot, s.set(1, 1, 1)); city.cars.setMatrixAt(i, m); c.gone = false; } });
  city.cars.instanceMatrix.needsUpdate = true;
  if (city.bridge.length) { city.bridgeMesh.geometry.attributes.position.array.set(city.bridgeOrig); city.bridgeMesh.geometry.attributes.position.needsUpdate = true; for (const d of city.bridge) d.gone = false; }
  while (chunks.length) removeChunk(chunks.length - 1);
  for (const s2 of slabs) { scene.remove(s2.grp); s2.mesh.geometry.dispose(); } slabs.length = 0;
  for (const l of lasers) scene.remove(l.g); lasers.length = 0;
  for (const f of feet) freeFoot(f.o); feet.length = 0;
  timers.length = 0;
  hf.clear(); decals.clear(); smoke.clear(); fire.clear(); rings.clear();
  for (const m2 of meteors) scene.remove(m2.g); meteors.length = 0;
  for (const p2 of pops) p2.el.remove(); pops.length = 0;
  setHome(G.home);
}
function homeNote() {
  if (G.home < 0) return '';
  if (G.homeLost) return '내 집 날림… −30%';
  if (G.dest >= HOME_SAFE_N) return '우리 집 지킴! ×1.5';
  return `우리 집 무사 (${HOME_SAFE_N}채 이상 부수면 ×1.5)`;
}
function endRound() {
  G.state = 'end';
  MK.end(); WAR.end(); AR.end();
  hideTapHint(); laserPrev.visible = false;
  // 우리 집 결과 반영
  if (G.home >= 0) {
    if (G.homeLost) G.price *= 0.7;
    else if (G.dest >= HOME_SAFE_N) G.price *= 1.5;
  }
  const best = bestGet(), isNew = G.price > best;
  const before = WEAPONS.filter(unlocked).map((w) => w.id);
  if (isNew) store('seohyeon-smash-best', Math.round(G.price));
  store('seohyeon-smash-total', Math.round(totalGet() + G.price));
  const newly = WEAPONS.filter((w) => unlocked(w) && !before.includes(w.id));
  $('eScore').textContent = won(G.price);
  // 맨 위: 결과 카드 그대로 (공유·저장도 이 그림을 씀)
  $('eShot').style.display = 'none'; $('end').classList.remove('hasCard');
  setTimeout(async () => {
    try { const cv = await makeCard(); lastCardBlob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      $('eShot').src = URL.createObjectURL(lastCardBlob); $('eShot').style.display = ''; $('end').classList.add('hasCard'); $('end').querySelector('.card').scrollTop = 0; }
    catch (e) { $('eShot').style.display = 'none'; }
  }, 60);
  $('eKick').textContent = G.homeLost ? '내 집까지 날렸다…' : (G.home >= 0 && G.dest >= HOME_SAFE_N ? '우리 집은 지켰다!' : '게임 끝!');
  let note = homeNote();
  if (CH.active && CH.score) {
    const diff = G.price - CH.score, who = CH.by ? `${CH.by}님` : '친구';
    note += (note ? '\n' : '') + (diff >= 0 ? `${who}보다 ${won(diff)} 더 부쉈어요!` : `${who}까지 ${won(-diff)} 모자라요`);
    if (CH.home && G.home >= 0) note += CH.mode === 'smash' ? (G.homeLost ? ' · 그 집 부수기 성공!' : ' · 그 집은 못 부쉈어요') : (G.homeLost ? ' · 그 집 지키기 실패' : ' · 그 집 지켜냄!');
  }
  $('eNote').textContent = note; $('eNote').style.whiteSpace = 'pre-line';
  $('eDest').textContent = G.dest;
  $('ePct').textContent = (G.destVol / totalVol * 100).toFixed(2);
  $('eCombo').textContent = G.combo;
  $('eChain').textContent = G.chainBest ? '×' + G.chainBest : '-';
  $('eBig').textContent = G.big ? G.big.name : '-';
  $('eMis').innerHTML = G.missions.map((m) => `<li class="${m.done ? 'y' : 'n'}">${m.done ? '✔' : '✘'} ${esc(m.t)}${m.done ? ` +${wonShort(m.bonus)}` : ''}</li>`).join('');
  $('eBest').textContent = isNew ? '신기록!' : `최고 기록 ${won(best)}`;
  $('eUnlock').textContent = newly.length ? `새 무기 열림: ${newly.map((w) => w.ic + ' ' + w.nm).join(', ')}` : '';
  $('shareMsg').textContent = '';
  $('nick').value = store('seohyeon-smash-nick') || CH.nickSelf || '';
  $('cardPrev').classList.add('hidden'); lastCardBlob = null;
  $('weapons').classList.add('hidden'); $('modeHint').classList.add('hidden');
  MP.end();
  $('end').classList.remove('hidden');
  G.ranked = false; $('rankBtn').disabled = false; $('rankBtn').textContent = '등록';
  $('rankMsg').textContent = '닉네임을 적고 등록하면 순위에 올라가요';
  loadRank();
}
// ---------- 전체 순위 (seoulbeauty.me/api/smash-rank)
const RANK_API = '/api/smash-rank';
function drawRank(top, mine) {
  const ol = $('rankList'); ol.textContent = '';
  (top || []).forEach((r) => { const li = document.createElement('li'); li.textContent = r.nickname + ' ';
    const b = document.createElement('b'); b.textContent = wonShort(r.score); li.appendChild(b);
    if (mine && r.nickname === mine.nick && r.score === mine.score) li.className = 'me'; ol.appendChild(li); });
  if (!top || !top.length) { const li = document.createElement('li'); li.textContent = '아직 기록이 없어요. 1등 해 보세요!'; ol.appendChild(li); }
}
async function loadRank() {
  try {
    const r = await fetch(`${RANK_API}?game=${MP.gameId()}&score=${Math.round(G.price)}`, { cache: 'no-store' });
    if (!r.ok) throw 0;
    const d = await r.json(); drawRank(d.top);
    if (d.rank) $('rankMsg').textContent = `지금 점수면 ${d.rank}위예요`;
  } catch { $('rankMsg').textContent = '순위를 불러오지 못했어요'; }
}
$('rankBtn').onclick = async () => {
  if (G.ranked) return;
  const nick = ($('nick').value || '').trim();
  if (!nick) { $('rankMsg').textContent = '닉네임을 먼저 적어 주세요'; $('nick').focus(); return; }
  const pin = $('pin').value;
  if ([...pin].length < 4) { $('rankMsg').textContent = '비밀번호를 4자 이상 적어 주세요'; $('pin').focus(); return; }
  $('rankBtn').disabled = true; $('rankMsg').textContent = '등록 중…';
  try {
    const score = Math.round(G.price);
    const r = await fetch(RANK_API + '?game=' + MP.gameId(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: nick, pin, score, destroyed: G.dest }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { $('rankMsg').textContent = d.error || '등록하지 못했어요'; $('rankBtn').disabled = false; return; }
    G.ranked = true; store('seohyeon-smash-nick', nick);
    $('rankBtn').textContent = '등록됨';
    $('rankMsg').textContent = d.created ? `「${nick}」 닉네임을 만들고 ${d.rank}위로 등록했어요!` : d.improved ? `최고 기록 갱신! ${d.rank}위` : `최고 기록(${wonShort(d.best)})이 더 높아요. 지금 ${d.rank}위`;
    drawRank(d.top, { nick, score: d.best });
  } catch { $('rankMsg').textContent = '등록하지 못했어요'; $('rankBtn').disabled = false; }
};
$('again').onclick = () => { resetCity(); startRound(); };
$('go').onclick = startRound;
$('mute').onclick = () => { sfx.setMuted(!sfx.muted); $('mute').textContent = sfx.muted ? '소리 끔' : '소리 켬'; };

// ---------- 루프
let last = performance.now(), fpsN = 0, fpsT = 0, lowT = 0;
window.__fps = { frames: 0, min: 999, log: [] };
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  window.__fps.frames++;
  let k = 1;
  if (TS.stop > 0) { TS.stop -= real; k = 0.02; } else if (TS.slow > 0) { TS.slow -= real; k = 0.35; }
  if (TS.slowCool > 0) TS.slowCool -= real;
  const dt = real * k;
  if (cam.anim) {
    const a = cam.anim; a.t += real; const t = Math.min(1, a.t / a.dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    cam.tx = a.from.tx + (a.to.tx - a.from.tx) * e; cam.tz = a.from.tz + (a.to.tz - a.from.tz) * e;
    cam.dist = a.from.dist * Math.pow(a.to.dist / a.from.dist, e);
    if (t >= 1) cam.anim = null;
  }
  cam.shake *= Math.pow(0.02, real);
  boomLight.intensity *= Math.pow(0.004, dt);
  placeCamera();
  if (city) {
    stepTimers(dt);
    stepMeteors(dt); stepSlabs(dt); stepLasers(dt); stepFeet(dt); stepChunks(dt); stepTrees(dt); rings.update(dt);
    const vh = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    smoke.update(dt, vh); fire.update(dt, vh);
    stepPops(real); MP.step(real); MK.step(real, dt); WAR.step(real, dt); AR.step(real, dt);
    if (homeRing && homeRing.visible) { const s = city.B[G.home].rad * (1.25 + 0.15 * Math.sin(now / 250)); homeRing.scale.set(s, 1, s); }
    if (G.state === 'play') {
      if (G.armed) G.time -= dt;
      if (Math.ceil(G.time) !== Number($('hTime').textContent)) updateHud();
      if (G.home >= 0 && !G.homeLost && !G.homeSafeShown && G.dest >= HOME_SAFE_N) { G.homeSafeShown = true; banner('우리 집 지키는 중! ×1.5'); }
      const busy = meteors.length || slabs.length || lasers.length || feet.length || timers.length || AR.busy() || WAR.busy();
      if (G.time <= 0 || (G.meteors <= 0 && !busy)) {
        G.endWait += real;
        if (G.time <= 0 || G.endWait > 2.5) { G.time = Math.max(0, G.time); updateHud(); endRound(); }
      }
    }
  }
  renderer.render(scene, camera);
  fpsN++; fpsT += real;
  if (fpsT > 1) {
    const fps = fpsN / fpsT; fpsN = 0; fpsT = 0;
    window.__fps.log.push(Math.round(fps)); if (window.__fps.log.length > 120) window.__fps.log.shift();
    if (fps < 38 && G.state === 'play' && !window.__noAuto) {
      if (++lowT >= 2) {
        if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); }); }
        else if (DPR > 1) { DPR = Math.max(1, DPR - 0.25); renderer.setPixelRatio(DPR); resize(); }
        lowT = 0;
      }
    } else lowT = 0;
  }
}

// ---------- 가상 주가 연결 (js/market.js)
function enemyStrike(b) {   // 보복 미사일: 건물만 부숨 (점수·파괴 통계·미션에 안 셈)
  const gp = new THREE.Vector3(b.cx, b.base + 0.65, -b.cy), R = 22;
  flash(0.35); shake(10); buzz([60, 40, 120]); sfx.boom(0.9);
  boomLight.position.set(gp.x, gp.y + 25, gp.z); boomLight.intensity = 7000; boomLight.distance = R * 8;
  rings.add(gp.x, gp.y, gp.z, R, 0xff6040); decals.crater(gp.x, gp.y, gp.z, R * 0.5);
  for (let i = 0; i < 30; i++) fire.emit(gp.x + rnd(4), gp.y + 2, gp.z + rnd(4), rnd(R), Math.random() * R, rnd(R), 0.6, 14, 34, 1, 1, 0.5, 0.2, 0.86);
  const st = G.state; G.state = 'enemy';
  let r;
  try { r = knock(b, 0, gp, 30, R, newShot(), gp, { noTopple: true }); } finally { G.state = st; }
  if (b.i === G.home && st === 'play') homeHit(r.full);
  return r;
}
function repairHome() {
  const b = city.B[G.home]; if (!b) return false;
  const A1 = city.bmesh.geometry.attributes, P = A1.position.array, U = A1.uv.array;
  for (let k = b.start; k < b.start + b.count; k++) { P[k * 3 + 1] = city.origPos[k * 3 + 1]; U[k * 2 + 1] = city.origUV[k * 2 + 1]; }
  A1.position.needsUpdate = A1.uv.needsUpdate = true;
  b.cur = b.h; b.gone = false; G.homeLost = false;
  setHome(G.home);
  popup(new THREE.Vector3(b.cx, b.base + b.h + 20, -b.cy), '🔧 우리 집 수리 완료!', 0, true, -1);
  return true;
}
async function initMarket() {
  try {
    await MK.init({ G, city, scene, camera, won, wonShort, banner, sfx, popup, rings, glowTex, updateHud, enemyStrike, repairHome,
      fx: () => ({ smoke, fire }), missionPing: () => missionEvent('price', {}),
      screenOf(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; } });
  } catch (e) { console.warn('market', e); }
}

// ---------- 불러오기
(async function boot() {
  $('bestStart').textContent = bestGet() ? `최고 기록 ${won(bestGet())} · 누적 ${wonShort(totalGet())}` : '';
  placeCamera(); requestAnimationFrame(frame);
  try {
    await MP.boot();
    data = await (await fetch(MP.cityUrl())).json();
  } catch (e) { $('go').textContent = '데이터를 못 불러왔습니다'; console.error(e); return; }
  city = buildCity(data, scene);
  totalVol = city.B.reduce((s, b) => s + b.vol, 0);
  city.treeState.forEach((t, i) => (t.i = i));
  const winMat = new THREE.MeshLambertMaterial({ map: city.win });
  winMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
    #ifdef USE_INSTANCING
      vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vec2 rep = abs(normal.x) > 0.5 ? vec2(isc.z, isc.y) : vec2(isc.x, isc.y);
      rep = max(vec2(1.0), floor(rep / vec2(3.6, 3.0) + 0.5));
      vMapUv = abs(normal.y) > 0.5 ? vec2(0.05) : uv * rep;
    #endif`);
  };
  chunkWin = new THREE.InstancedMesh(boxG, winMat, CAP);
  chunkPlain = new THREE.InstancedMesh(boxG, new THREE.MeshLambertMaterial(), CAP);
  for (const cm of [chunkWin, chunkPlain]) {
    cm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cm.castShadow = true; cm.receiveShadow = true; cm.frustumCulled = false;
    cm.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(cm);
  }
  poolW = new Pool(chunkWin); poolP = new Pool(chunkPlain);
  smoke = new Particles(scene, IS_TOUCH ? 2000 : 2600, null, false);
  fire = new Particles(scene, IS_TOUCH ? 1200 : 1600, glowTex, true);
  decals = new Decals(scene); rings = new Rings(scene);
  for (const l of data.labels) {
    const sp = makeLabel(l.t); sp.position.set(l.u, (groundAt(l.u, -l.v) || 0) + (l.t === 'AK플라자' ? 118 : l.t === '서현역' ? 40 : 70), -l.v); scene.add(sp);
  }
  await initMarket();
  const warApi = { G, city, data, scene, camera, cam, won, wonShort, banner, sfx, popup, rings, glowTex, updateHud, enemyStrike, MK, DEBUG, groundAt, renderWeapons,
    blast: impact, useShot, bestGet, totalGet, fx: () => ({ smoke, fire }),
    screenOf(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; } };
  try { WAR.init(warApi); AR.init(warApi, WEAPONS); } catch (e) { console.warn('war', e); }
  buildMissionPool();
  setupChallenge();
  $('go').disabled = false; $('go').textContent = CH.active ? '도전 시작' : '시작';
  try {
    MP.init({ G, city, data, scene, camera, cam, wonShort, banner, popup, sfx, later, easeCam, IS_TOUCH, again: () => { resetCity(); startRound(); },
      screenOf(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; } });
  } catch (e) { console.warn('maps', e); }
  window.__game = { G, launch, pick, cam, chunks: () => chunks.length, slabs: () => slabs.length, city, start: startRound, won, setHome, fireLaser, quake, stomp, feet,
    groundPick, makeCard, TS, market: MK, fireAt(x, z) { fire1(new THREE.Vector3(x, groundAt(x, z), z)); }, missions: () => G.missions.map((m) => ({ t: m.t, done: m.done })),
    screenOf(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; },
    // 검사용: 높은 건물 옆을 쳐서 연쇄가 날 자리
    chainSpot() {
      const cd = { x: Math.sin(cam.az), z: Math.cos(cam.az) }, R = radius();
      let best = null;
      for (const b of city.B) {
        if (b.gone || b.h < 60) continue;
        for (let k = 0; k < 12; k++) {
          const a = k / 12 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
          let n = 0;
          for (const o of city.B) {
            if (o === b || o.gone) continue;
            const rx = o.cx - b.cx, rz = -o.cy + b.cy, along = rx * dx + rz * dz, perp = Math.abs(-rx * dz + rz * dx);
            if (along > b.rad && along < b.h && perp < o.rad + 8) n++;
          }
          const sc = n + 1.5 * Math.max(0, dx * cd.x + dz * cd.z);
          if (!best || sc > best.sc) best = { b, sc, n, dx, dz };
        }
      }
      const b = best.b;
      return { x: b.cx - best.dx * (b.rad + R * 0.7), z: -b.cy - best.dz * (b.rad + R * 0.7), name: label(b), n: best.n, bx: b.cx, bz: -b.cy };
    } };
})();
