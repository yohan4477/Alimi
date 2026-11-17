// 서현역 부수기 — 메인
import * as THREE from 'three';
import { buildCity, makeLabel, pip, pipRings, distToRing, ringArea } from './city.js';
import { Particles, Decals, Rings, Sfx, glowTex } from './fx.js';

const $ = (id) => document.getElementById(id);
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const ROUND_TIME = 60, ROUND_METEORS = 20, LV_STEP = 6;
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
window.__won = won;

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
const SUN_DIR = new THREE.Vector3(-0.55, 1, 0.35).normalize();   // 남서쪽 위
const boomLight = new THREE.PointLight(0xffb060, 0, 400, 1.6);
scene.add(boomLight);

// ---------- 카메라 (픽셀 지도 각도: 남동쪽에서 30도 내려다봄)
const PORTRAIT = () => innerWidth < innerHeight;
const MAXD = () => (PORTRAIT() ? 4300 : 2800);
const cam = { tx: 0, tz: 0, dist: innerWidth < innerHeight ? 4300 : 2700, el: THREE.MathUtils.degToRad(34), az: THREE.MathUtils.degToRad(45),
  shake: 0, anim: null };
function placeCamera(t) {
  const { tx, tz, dist, el, az } = cam;
  const off = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist);
  camera.position.set(tx + off.x, off.y, tz + off.z);
  camera.lookAt(tx, 0, tz);
  if (cam.shake > 0.01) {
    const s = cam.shake * Math.min(1, dist / 500);
    camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
  }
  // 그림자 범위: 보이는 곳 따라감
  const span = Math.min(1100, dist * 0.75);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - span) > 1) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); }
  sun.target.position.set(tx, 0, tz);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 1200);
  sc.near = 100; sc.far = 2600;
}
function easeCam(to, dur) { cam.anim = { from: { tx: cam.tx, tz: cam.tz, dist: cam.dist }, to, t: 0, dur }; }

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 46 : 32;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- 상태
let city, data, totalVol = 0;
const sfx = new Sfx();
let smoke, fire, decals, rings;
const meteors = [];
const G = {
  state: 'load', price: 0, dest: 0, destVol: 0, meteors: ROUND_METEORS, time: ROUND_TIME, lvl: 1, combo: 0, big: null,
  endWait: 0,
};
const radius = () => Math.min(62, 24 + (G.lvl - 1) * 7);

// ---------- 잔해 조각 (자체 간이 물리)
const CAP = 5000;
const boxG = new THREE.BoxGeometry(1, 1, 1);
let chunkWin, chunkPlain;
const chunks = [];
const hf = new Map();            // 2.5m 칸 → 쌓인 높이(절대)
const HF = 2.5;
const hkey = (x, z) => (Math.floor(x / HF) + 2000) * 4000 + (Math.floor(z / HF) + 2000);
const gcache = new Map();
function groundAt(x, z) {        // 지반 위면 PH
  const k = (Math.floor(x / 4) + 1000) * 2000 + (Math.floor(z / 4) + 1000);
  let v = gcache.get(k);
  if (v === undefined) {
    v = 0;
    for (const g of data.plateau) if (pipRings(x, -z, g)) { v = data.PH; break; }
    gcache.set(k, v);
  }
  return v;
}

class Pool {
  constructor(mesh) { this.mesh = mesh; this.free = []; for (let i = CAP - 1; i >= 0; i--) this.free.push(i); this.hideAll(); }
  hideAll() { const m = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < CAP; i++) this.mesh.setMatrixAt(i, m); this.mesh.instanceMatrix.needsUpdate = true; }
  take() { return this.free.length ? this.free.pop() : -1; }
  give(i) { this.mesh.setMatrixAt(i, ZERO_M); this.free.push(i); }
}
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
let poolW, poolP;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();

function spawnChunk(pool, x, y, z, sx, sy, sz, rotY, color, vel, delay) {
  let idx = pool.take();
  if (idx < 0) {   // 꽉 차면 가장 오래 쉰 조각 회수
    const old = chunks.findIndex((c) => c.pool === pool && c.st === 1);
    if (old < 0) return;
    removeChunk(old); idx = pool.take(); if (idx < 0) return;
  }
  pool.mesh.setColorAt(idx, color);
  const c = { pool, idx, p: new THREE.Vector3(x, y, z), v: vel, q: new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), rotY),
    w: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6).multiplyScalar(vel.length() > 3 ? 1 : 0.3),
    s: new THREE.Vector3(sx, sy, sz), delay, st: 0, rest: 0, sink: 0, floor: groundAt(x, z) };
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
function stepChunks(dt) {
  const dq = new THREE.Quaternion();
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    if (c.delay > 0) { c.delay -= dt; continue; }
    if (c.st === 0) {
      c.v.y -= GRAV * dt;
      c.p.addScaledVector(c.v, dt);
      const wl = c.w.length();
      if (wl > 1e-3) { dq.setFromAxisAngle(_v.copy(c.w).divideScalar(wl), wl * dt); c.q.premultiply(dq); }
      const k = hkey(c.p.x, c.p.z);
      const fl = Math.max(groundAt(c.p.x, c.p.z) + 0.6, hf.get(k) ?? -1e9);
      const hy = Math.min(c.s.x, c.s.y, c.s.z) * 0.5;
      if (c.p.y - hy < fl) {
        c.p.y = fl + hy;
        if (c.v.y < -5) { c.v.y *= -0.22; c.v.x *= 0.55; c.v.z *= 0.55; c.w.multiplyScalar(0.5); }
        else {
          c.v.set(0, 0, 0); c.w.set(0, 0, 0); c.st = 1;
          hf.set(k, Math.max(fl, hf.get(k) ?? -1e9) + Math.min(c.s.y, c.s.x) * 0.45);
          // 바닥에 닿으면 먼지 한 줌
          if (Math.random() < 0.15) smoke.emit(c.p.x, c.p.y, c.p.z, 0, 1.5, 0, 2.2, 6, 14, 0.35, 0.82, 0.78, 0.7);
        }
      }
      writeChunk(c);
    } else {
      c.rest += dt;
      if (c.rest > 6) {                 // 가라앉으며 사라짐
        c.sink += dt;
        c.p.y -= dt * (c.s.y * 0.5 + 0.6);
        writeChunk(c);
        if (c.sink > 2.2) removeChunk(i);
      }
    }
  }
  poolW.mesh.instanceMatrix.needsUpdate = true; poolP.mesh.instanceMatrix.needsUpdate = true;
}

// 건물 → 조각
function fracture(b, cutFrom, impact, power, R) {
  const f = b.ext, d = b.d;
  // 가장 긴 변 방향으로 격자
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
  const top = b.base + b.cur, y0 = b.base + cutFrom, H = top - y0;
  if (H <= 0.3) return 0;
  const budget = Math.max(30, Math.min(260, 30 + b.d.f * 14)) * (chunks.length > 3500 ? 0.4 : 1);
  let cs = 4.2, lh = Math.max(2.6, b.fh);
  const count = () => Math.ceil((a1 - a0) / cs) * Math.ceil((b1 - b0) / cs) * Math.ceil(H / lh) * 0.8;
  let flip = 0;
  while (count() > budget && cs < 40) { if (flip++ % 2) cs *= 1.3; else lh *= 1.4; }
  const na = Math.max(1, Math.round((a1 - a0) / cs)), nb = Math.max(1, Math.round((b1 - b0) / cs)), nl = Math.max(1, Math.round(H / lh));
  const da = (a1 - a0) / na, db = (b1 - b0) / nb, dl = H / nl;
  const rotY = ang;   // u,v 회전 → three: y축 회전 = +ang (z=-v)
  const cb = Math.cos(ang), sb = Math.sin(ang);
  let made = 0;
  const concrete = new THREE.Color().setRGB(0.72, 0.7, 0.66, THREE.SRGBColorSpace);
  for (let ia = 0; ia < na; ia++) for (let ib = 0; ib < nb; ib++) {
    const la = a0 + (ia + 0.5) * da, lb = b0 + (ib + 0.5) * db;
    const u = la * cb - lb * sb, v = la * sb + lb * cb;
    let inside = false;
    for (const g of d.g) if (pipRings(u, v, g)) { inside = true; break; }
    if (!inside) continue;
    const edge = ia === 0 || ib === 0 || ia === na - 1 || ib === nb - 1;
    for (let il = 0; il < nl; il++) {
      const y = y0 + (il + 0.5) * dl;
      const x = u, z = -v;
      const dx = x - impact.x, dz = z - impact.z, dist = Math.hypot(dx, dz) || 1;
      const fall = Math.max(0.15, 1 - dist / (R * 1.7));
      const hgt = (y - b.base) / 30;
      const sp = power * fall * (0.5 + Math.random() * 0.8);
      const vel = new THREE.Vector3(dx / dist * sp + (Math.random() - 0.5) * 6, sp * (0.35 + Math.random() * 0.5) + hgt * 4, dz / dist * sp + (Math.random() - 0.5) * 6);
      const j = 0.78 + Math.random() * 0.2;
      const isTop = il === nl - 1 && cutFrom === 0 || il === nl - 1;
      const color = isTop ? b.rc : (edge ? b.wc : concrete);
      const pool = isTop || !edge ? poolP : poolW;
      spawnChunk(pool, x, y, z, da * j, dl * (0.85 + Math.random() * 0.12), db * j, rotY, color, vel, dist / 160 + Math.random() * 0.08 + il * 0.01);
      made++;
    }
  }
  return made;
}

// 정적 건물 자르기 (위 부분 없애기)
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

// ---------- 메테오
const meteorGeo = new THREE.IcosahedronGeometry(1, 1);
function launch(target) {
  if (G.state !== 'play' || G.meteors <= 0) return;
  if (!G.armed) { G.armed = true; hideTapHint(); }   // 첫 탭부터 시간이 흐름
  G.meteors--;
  const R = radius();
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  const start = target.clone().addScaledVector(right, -260).addScaledVector(fwd, 240).add(new THREE.Vector3(0, 520, 0));
  const g = new THREE.Group();
  const core = new THREE.Mesh(meteorGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
  core.scale.setScalar(3 + R * 0.06);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(28 + R * 0.5);
  g.add(core, glow); g.position.copy(start); scene.add(g);
  meteors.push({ g, start, target: target.clone(), t: 0, dur: 0.85, R, lvl: G.lvl });
  sfx.whoosh(0.85);
  updateHud();
}
function stepMeteors(dt) {
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.t += dt;
    const k = Math.min(1, m.t / m.dur), e = k * k;
    const prev = m.g.position.clone();
    m.g.position.lerpVectors(m.start, m.target, e);
    // 꼬리
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const p = prev.clone().lerp(m.g.position, s / steps);
      fire.emit(p.x + rnd(1.5), p.y + rnd(1.5), p.z + rnd(1.5), rnd(4), rnd(4), rnd(4), 0.45, 9 + m.R * 0.2, 2, 0.9, 1, 0.62, 0.25);
      if (s % 2 === 0) smoke.emit(p.x, p.y, p.z, rnd(2), rnd(2), rnd(2), 1.3, 6, 20, 0.35, 0.5, 0.47, 0.45);
    }
    if (k >= 1) { scene.remove(m.g); meteors.splice(i, 1); impact(m.target, m.R); }
  }
}
const rnd = (s) => (Math.random() - 0.5) * 2 * s;

function impact(p, R) {
  const gy = groundAt(p.x, p.z) + 0.65;
  const gp = new THREE.Vector3(p.x, gy, p.z);
  // 번쩍
  $('flash').style.transition = 'none'; $('flash').style.opacity = '0.55';
  requestAnimationFrame(() => { $('flash').style.transition = 'opacity .5s ease-out'; $('flash').style.opacity = '0'; });
  boomLight.position.set(p.x, p.y + 25, p.z); boomLight.intensity = 9000; boomLight.distance = R * 8;
  cam.shake = 6 + R * 0.12;
  rings.add(gp.x, gp.y, gp.z, R); rings.add(gp.x, gp.y, gp.z, R * 0.6, 0xffb070, 0.6);
  decals.crater(gp.x, gp.y, gp.z, R * 0.55);
  // 불덩이·먼지
  for (let i = 0; i < 40; i++) fire.emit(p.x + rnd(4), p.y + 2, p.z + rnd(4), rnd(R * 0.9), Math.random() * R * 0.9, rnd(R * 0.9), 0.5 + Math.random() * 0.5, 14 + R * 0.3, 30 + R * 0.5, 1, 1, 0.55 + Math.random() * 0.2, 0.2, 0.86);
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * 6.28, s = R * (0.6 + Math.random() * 0.9);
    smoke.emit(gp.x + Math.cos(a) * 3, gp.y + 2, gp.z + Math.sin(a) * 3, Math.cos(a) * s, 2 + Math.random() * 8, Math.sin(a) * s,
      3 + Math.random() * 2.5, 14 + R * 0.25, 40 + R * 0.9, 0.55, 0.8, 0.75, 0.68, 0.86);
  }
  for (let i = 0; i < 30; i++) smoke.emit(gp.x + rnd(6), gp.y + 4, gp.z + rnd(6), rnd(3), 10 + Math.random() * 14, rnd(3), 4 + Math.random() * 2, 18, 55 + R, 0.5, 0.45, 0.42, 0.4, 0.92);
  for (let i = 0; i < 24; i++) fire.emit(gp.x, gp.y + 2, gp.z, rnd(R), 15 + Math.random() * 25, rnd(R), 1.2, 3, 2, 1, 1, 0.8, 0.4, 0.97, 25);
  sfx.boom(R / 30);

  // 건물 피해
  const hits = [];
  const power = 22 + R * 0.45;
  for (const b of city.B) {
    if (b.gone) continue;
    const dc = Math.hypot(b.cx - p.x, -b.cy - p.z) - b.rad;
    if (dc > R * 1.6) continue;
    let dist = 0;
    let inside = false;
    for (const g of b.d.g) if (pipRings(p.x, -p.z, g)) { inside = true; break; }
    if (!inside) dist = Math.min(...b.d.g.map((g) => distToRing(p.x, -p.z, g[0])));
    if (dist > R * 1.6) continue;
    const before = b.cur;
    let keep;
    if (dist <= R) keep = 0;
    else {
      const f = 1 - (dist - R) / (0.6 * R);
      keep = before * (1 - (0.25 + 0.5 * f));
      if (keep < 3) keep = 0;
    }
    if (before - keep < 1) continue;
    fracture(b, keep, gp, power, R);
    cutBuilding(b, keep);
    const frac = (before - keep) / b.h;
    const val = b.price * frac;
    G.destVol += b.vol * frac;
    if (keep === 0) { b.gone = true; G.dest++; decals.rubble(b, b.base + 0.05); }
    hits.push({ b, val, full: keep === 0, floors: Math.max(1, Math.round(b.d.f * frac)) });
    // 무너지는 먼지
    const n = Math.min(10, 2 + Math.round(b.rad / 6));
    for (let i = 0; i < n; i++) smoke.emit(b.cx + rnd(b.rad * 0.6), b.base + keep + Math.random() * (before - keep), -b.cy + rnd(b.rad * 0.6),
      rnd(4), 1 + Math.random() * 3, rnd(4), 3.5 + Math.random() * 2, 12, 34 + b.rad * 0.6, 0.55, 0.86, 0.82, 0.74, 0.9);
  }
  // 나무 넘어짐
  for (const t of city.treeState) {
    if (t.done) continue;
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    if (d > R * 1.35) continue;
    t.ax = new THREE.Vector3(dz, 0, -dx).normalize(); t.fall = 0.0001; t.done = true; t.delay = d / 160; t.tgt = 1.25 + Math.random() * 0.3;
    fallingTrees.push(t);
  }
  // 차 날아감
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

  // 점수
  if (hits.length) {
    const groups = new Map();
    for (const h of hits) {
      const key = h.b.d.n ? h.b.d.n + '|' + (/^\d+동$/.test(h.b.d.d) ? h.b.d.d : '') : 'k' + h.b.i;
      const gr = groups.get(key) || { b: h.b, val: 0, full: true, floors: 0, est: false };
      gr.val += h.val; gr.full = gr.full && h.full; gr.floors = Math.max(gr.floors, h.floors); gr.est = gr.est || h.b.d.price_src !== '실거래';
      groups.set(key, gr);
    }
    const list = [...groups.values()].sort((a, b) => b.val - a.val);
    const n = hits.filter((h) => h.full).length;
    const mult = n >= 2 ? Math.min(3, 1 + 0.15 * (n - 1)) : 1;
    let sum = 0;
    for (const g of list) sum += g.val;
    sum *= mult;
    G.price += sum;
    if (n > G.combo) G.combo = n;
    if (!G.big || list[0].val > G.big.val) G.big = { val: list[0].val, name: label(list[0].b) };
    list.slice(0, 5).forEach((g, i) => {
      const nm = label(g.b);
      const txt = `${nm} ${g.full ? (g.b.d.f >= 3 ? g.b.d.f + '층 ' : '') + '붕괴!' : '윗층 날아감!'} <em>+${won(g.val * mult)}</em>${g.est ? ' <small>(추정)</small>' : ''}`;
      popup(new THREE.Vector3(g.b.cx, g.b.base + g.b.h + 6, -g.b.cy), txt, i * 0.18, i === 0 && g.val > 5e10, i);
    });
    if (list.length > 5) popup(gp.clone().add(new THREE.Vector3(0, 10, 0)), `외 ${list.length - 5}채 <em>+${won(list.slice(5).reduce((s, g) => s + g.val, 0) * mult)}</em>`, 1.0, false, 5);
    if (n >= 2) banner(`${n}채 콤보! ×${mult.toFixed(2)}`);
    sfx.crumble(hits.length);
    const lv = 1 + Math.floor(G.dest / LV_STEP);
    if (lv > G.lvl) { G.lvl = lv; setTimeout(() => { banner(`메테오 Lv.${lv}! 반경 ${radius()}m`); sfx.ding(); }, n >= 2 ? 1300 : 300); }
  }
  updateHud();
}
const fallingTrees = [];
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

// ---------- 화면 글자
const pops = [];
function popup(world, html, delay = 0, big = false, row = 0) {
  const el = document.createElement('div');
  el.className = 'pop' + (big ? ' hot' : ''); el.innerHTML = html; el.style.opacity = '0';
  $('popups').appendChild(el);
  pops.push({ el, world, t: -delay, row });
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
    p.el.style.transform = `translate(${cx}px, ${y}px) scale(${sc})`;
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
}

// ---------- 입력: 드래그 이동 / 핀치·휠 확대 / 탭 = 메테오
const pointers = new Map();
let tapStart = null, pinch0 = null;
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
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  else { tapStart = null; pinch0 = pinchInfo(); }
  cam.anim = null;
});
function pinchInfo() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.dist };
}
canvas.addEventListener('pointermove', (e) => {
  const pr = pointers.get(e.pointerId);
  if (!pr) return;
  const nx = e.clientX, ny = e.clientY;
  if (pointers.size === 1) {
    const a = screenToGround(pr.x, pr.y), b = screenToGround(nx, ny);
    cam.tx += a.x - b.x; cam.tz += a.z - b.z;
    clampCam();
    if (tapStart) tapStart.moved += Math.hypot(nx - pr.x, ny - pr.y);
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
  if (tapStart && pointers.size === 0 && tapStart.moved < 10 && performance.now() - tapStart.t < 500) {
    const p = pick(e.clientX, e.clientY);
    if (p) launch(p);
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
  Object.assign(G, { armed: false, state: 'play', price: 0, dest: 0, destVol: 0, meteors: ROUND_METEORS, time: ROUND_TIME, lvl: 1, combo: 0, big: null, endWait: 0 });
  $('start').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  easeCam({ tx: 15, tz: 30, dist: IS_TOUCH ? 620 : 520 }, 2.2);
  updateHud();
  showTapHint();
}
// 처음 안내: 카메라가 다가간 뒤 화면 가운데에 「톡 누르면 운석」 손가락 표시, 첫 탭까지 시간 멈춤
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
  while (chunks.length) removeChunk(chunks.length - 1);
  hf.clear(); decals.clear(); smoke.clear(); fire.clear();
  for (const m2 of meteors) scene.remove(m2.g); meteors.length = 0;
  for (const p2 of pops) p2.el.remove(); pops.length = 0;
}
function bestGet() { try { return Number(localStorage.getItem('seohyeon-smash-best') || 0); } catch (e) { return 0; } }
function bestSet(v) { try { localStorage.setItem('seohyeon-smash-best', String(v)); } catch (e) { /* 무시 */ } }
function endRound() {
  G.state = 'end';
  const best = bestGet(), isNew = G.price > best;
  if (isNew) bestSet(G.price);
  $('eScore').textContent = won(G.price);
  $('eDest').textContent = G.dest;
  $('ePct').textContent = (G.destVol / totalVol * 100).toFixed(2);
  $('eCombo').textContent = G.combo;
  $('eBig').textContent = G.big ? G.big.name : '-';
  $('eBest').textContent = isNew ? '신기록!' : `최고 기록 ${won(best)}`;
  $('shareMsg').textContent = '';
  $('end').classList.remove('hidden');
}
$('again').onclick = () => { resetCity(); startRound(); };
$('share').onclick = async () => {
  const t = `서현역 부수기에서 집값 ${won(G.price)} 날림! 건물 ${G.dest}채 붕괴, 서현동 ${(G.destVol / totalVol * 100).toFixed(2)}% 파괴 (최고 콤보 ${G.combo}채)\n${location.href}`;
  try { await navigator.clipboard.writeText(t); $('shareMsg').textContent = '복사했습니다!'; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); $('shareMsg').textContent = '복사했습니다!'; } catch (e2) { $('shareMsg').textContent = t; }
    ta.remove();
  }
};
$('go').onclick = startRound;
$('mute').onclick = () => { sfx.setMuted(!sfx.muted); $('mute').textContent = sfx.muted ? '소리 끔' : '소리 켬'; };

// ---------- 루프
let last = performance.now(), fpsN = 0, fpsT = 0, lowT = 0;
window.__fps = { frames: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  window.__fps.frames++;
  if (cam.anim) {
    const a = cam.anim; a.t += dt; const k = Math.min(1, a.t / a.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    cam.tx = a.from.tx + (a.to.tx - a.from.tx) * e; cam.tz = a.from.tz + (a.to.tz - a.from.tz) * e;
    cam.dist = a.from.dist * Math.pow(a.to.dist / a.from.dist, e);
    if (k >= 1) cam.anim = null;
  }
  if (G.state === 'load' || (G.state !== 'play' && !cam.anim)) cam.az += dt * 0.0; // 고정 각도
  cam.shake *= Math.pow(0.02, dt);
  boomLight.intensity *= Math.pow(0.004, dt);
  placeCamera();
  if (city) {
    stepMeteors(dt); stepChunks(dt); stepTrees(dt); rings.update(dt);
    const vh = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    smoke.update(dt, vh); fire.update(dt, vh);
    stepPops(dt);
    if (G.state === 'play') {
      if (G.armed) G.time -= dt;
      if (Math.ceil(G.time) !== Number($('hTime').textContent)) updateHud();
      if (G.time <= 0 || (G.meteors <= 0 && meteors.length === 0)) {
        G.endWait += dt;
        if (G.time <= 0 || G.endWait > 3) { G.time = Math.max(0, G.time); updateHud(); endRound(); }
      }
    }
  }
  renderer.render(scene, camera);
  // 자동 품질: 느리면 그림자 끄고 해상도 낮춤
  fpsN++; fpsT += dt;
  if (fpsT > 2) {
    const fps = fpsN / fpsT; fpsN = 0; fpsT = 0;
    if (fps < 38 && G.state === 'play') {
      if (++lowT >= 1) {
        if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); }); }
        else if (DPR > 1) { DPR = Math.max(1, DPR - 0.25); renderer.setPixelRatio(DPR); resize(); }
        lowT = 0;
      }
    } else lowT = 0;
  }
}

// ---------- 불러오기
(async function load() {
  $('bestStart').textContent = bestGet() ? `최고 기록 ${won(bestGet())}` : '';
  placeCamera(); requestAnimationFrame(frame);
  try {
    data = await (await fetch('city.json')).json();
  } catch (e) { $('go').textContent = '데이터를 못 불러왔습니다'; console.error(e); return; }
  city = buildCity(data, scene);
  totalVol = city.B.reduce((s, b) => s + b.vol, 0);
  city.treeState.forEach((t, i) => (t.i = i));
  const winMat = new THREE.MeshLambertMaterial({ map: city.win });
  winMat.onBeforeCompile = (sh) => {   // 조각 크기에 맞춰 창문 반복
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
  smoke = new Particles(scene, 2600, null, false);
  fire = new Particles(scene, 1600, glowTex, true);
  decals = new Decals(scene); rings = new Rings(scene);
  for (const l of data.labels) {
    const sp = makeLabel(l.t); sp.position.set(l.u, (groundAt(l.u, -l.v) || 0) + (l.t === 'AK플라자' ? 118 : l.t === '서현역' ? 40 : 70), -l.v); scene.add(sp);
  }
  $('go').disabled = false; $('go').textContent = '시작';
  window.__game = { G, launch, pick, cam, chunks: () => chunks.length, city, start: startRound, won };
})();
