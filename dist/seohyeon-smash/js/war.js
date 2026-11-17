// 서현역 부수기 — 참전 시스템 (게임 속 가상 전쟁)
// 실제 나라 이름·국기만 쓰고, 실존 인물(지도자·군인)은 어디에도 나오지 않는다.
// 지휘관 글자는 「북측 사령관」처럼 역할 이름만.
import * as THREE from 'three';
import { emit } from './bus.js';

let A = null;
const $ = (id) => document.getElementById(id);
const rnd = (s) => (Math.random() - 0.5) * 2 * s;

// ---------- 국기 (작은 SVG, 30x20)
function star(cx, cy, r, rot = -90) {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.382 : r; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2); }
  return d + 'Z';
}
function trig(cx, cy, ang, pat) {   // 괘: pat = 위→아래 1=통, 0=끊김
  let s = `<g transform="translate(${cx} ${cy}) rotate(${ang})" fill="#000">`;
  pat.forEach((p, i) => { const y = -2.25 + i * 1.5;
    s += p ? `<rect x="-2.6" y="${y}" width="5.2" height="1"/>` : `<rect x="-2.6" y="${y}" width="2.3" height="1"/><rect x="0.3" y="${y}" width="2.3" height="1"/>`; });
  return s + '</g>';
}
const FLAG_SVG = {
  kr: `<rect width="30" height="20" fill="#fff"/><g transform="rotate(33.69 15 10)"><path d="M10 10a5 5 0 0 1 10 0z" fill="#cd2e3a"/><path d="M10 10a5 5 0 0 0 10 0z" fill="#0047a0"/>
    <circle cx="12.5" cy="10" r="2.5" fill="#cd2e3a"/><circle cx="17.5" cy="10" r="2.5" fill="#0047a0"/></g>
    ${trig(6.4, 4.3, -56.31, [1, 1, 1])}${trig(23.6, 15.7, -56.31, [0, 0, 0])}${trig(23.6, 4.3, 56.31, [0, 1, 0])}${trig(6.4, 15.7, 56.31, [1, 0, 1])}`,
  kp: `<rect width="30" height="20" fill="#024fa2"/><rect y="3.4" width="30" height="13.2" fill="#fff"/><rect y="4.1" width="30" height="11.8" fill="#ed1c27"/>
    <circle cx="10.6" cy="10" r="3.9" fill="#fff"/><path d="${star(10.6, 10, 3.7)}" fill="#ed1c27"/>`,
  cn: `<rect width="30" height="20" fill="#ee1c25"/><path d="${star(5, 5, 3)}" fill="#ffde00"/><path d="${star(10, 2, 1, -60)}" fill="#ffde00"/>
    <path d="${star(12, 4, 1, -80)}" fill="#ffde00"/><path d="${star(12, 7, 1, -100)}" fill="#ffde00"/><path d="${star(10, 9, 1, -120)}" fill="#ffde00"/>`,
  jp: `<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>`,
  us: (() => { let s = '<rect width="30" height="20" fill="#fff"/>';
    for (let i = 0; i < 13; i += 2) s += `<rect y="${(i * 20 / 13).toFixed(3)}" width="30" height="${(20 / 13).toFixed(3)}" fill="#b22234"/>`;
    s += '<rect width="12" height="10.77" fill="#3c3b6e"/>';
    for (let r = 0; r < 5; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) s += `<circle cx="${(1 + c * 2 + (r % 2)).toFixed(1)}" cy="${(1.1 + r * 2.1).toFixed(1)}" r=".45" fill="#fff"/>`;
    return s; })(),
};
export function roundelSprite() {   // 우리 편 차량 위 작은 태극 원
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
  g.save(); g.translate(32, 32); g.rotate(0.588);
  g.fillStyle = '#cd2e3a'; g.beginPath(); g.arc(0, 0, 22, Math.PI, 0); g.fill();
  g.fillStyle = '#0047a0'; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI); g.fill();
  g.fillStyle = '#cd2e3a'; g.beginPath(); g.arc(-11, 0, 11, 0, 7); g.fill();
  g.fillStyle = '#0047a0'; g.beginPath(); g.arc(11, 0, 11, 0, 7); g.fill(); g.restore();
  g.strokeStyle = '#1d2b4a'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false })); sp.renderOrder = 10; return sp;
}
export function flagSvg(code, h = 16) {
  return `<svg class="flag" viewBox="0 0 30 20" width="${h * 1.5}" height="${h}" aria-hidden="true">${FLAG_SVG[code]}<rect width="30" height="20" fill="none" stroke="rgba(0,0,0,.25)" stroke-width=".6"/></svg>`;
}
const flagImg = {};
for (const k in FLAG_SVG) { const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="120" height="80">${FLAG_SVG[k]}</svg>`); flagImg[k] = im; }

// ---------- 나라 정보 (사이드: p = 플레이어 편, d = 방어군 편)
const C = {
  kp: { nm: '북한', side: 'p', ban: '북한 참전! 지원군 남하', who: '북측 사령관', say: '지원 포격 개시!', dur: 15 },
  cn: { nm: '중국', side: 'p', ban: '중국 참전! 항모 전단 출격', who: '항모 함장', say: '전투기 발진!', dur: 15 },
  jp: { nm: '일본', side: 'd', ban: '일본 참전! 방어군 지원', who: '방공 지휘관', say: '운석 요격 준비!', dur: 18 },
  us: { nm: '미국', side: 'd', ban: '미국 참전! 항모 타격단 도착', who: '타격단 사령관', say: '폭격기 출격!', dur: 18 },
};

// ---------- 공용 모형 (단순 도형 · 실제 부대 표식 없음)
const geoBox = new THREE.BoxGeometry(1, 1, 1), geoCyl = new THREE.CylinderGeometry(1, 1, 1, 10), geoCone = new THREE.ConeGeometry(1, 1, 10);
const matCache = new Map();
const mat = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(c); };
function part(g, geo, c, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat(c)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
// 모든 모형은 +z 가 앞
export const Models = {
  tracked(c = 0x5b6b3a, s = 1, opt = {}) {   // 전차·자주포·장갑차
    const g = new THREE.Group();
    part(g, geoBox, 0x2b2f2a, 9, 2.4, 22, -5.5, 1.6, 0); part(g, geoBox, 0x2b2f2a, 9, 2.4, 22, 5.5, 1.6, 0);
    part(g, geoBox, c, 14, 4, 21, 0, 4.2, 0);
    const tur = new THREE.Group(); tur.position.set(0, 7.5, opt.rearTurret ? -3 : -1); g.add(tur);
    part(tur, geoBox, c, opt.bigTurret ? 11 : 9, 3.4, opt.bigTurret ? 11 : 8, 0, 0, 0);
    if (!opt.noGun) part(tur, geoCyl, 0x3a3f36, 0.9, opt.gun || 16, 0.9, 0, 0.4, (opt.gun || 16) / 2 + 3, Math.PI / 2);
    g.userData.tur = tur; g.scale.setScalar(s); return g;
  },
  wheeled(c = 0x6b7448, s = 1, opt = {}) {    // 차륜형·전술차량·발사 트럭
    const g = new THREE.Group();
    const n = opt.axles || 4;
    for (let i = 0; i < n; i++) for (const sx of [-5.6, 5.6]) part(g, geoCyl, 0x1e1f22, 2.2, 1.6, 2.2, sx, 2.2, -8 + i * 16 / Math.max(1, n - 1), 0, 0, Math.PI / 2);
    part(g, geoBox, c, 10, opt.h || 5, 22, 0, 5.4, 0);
    if (opt.launcher) part(g, geoBox, 0x4a5236, 8, 4, 12, 0, 10, -3, -0.45);
    if (opt.gun) part(g, geoCyl, 0x333, 0.6, 8, 0.6, 0, 9.5, 6, Math.PI / 2);
    g.scale.setScalar(s); return g;
  },
  jet(c = 0x8a96a4, s = 1, opt = {}) {
    const g = new THREE.Group();
    part(g, geoCyl, c, 1.8, 26, 1.8, 0, 0, 0, Math.PI / 2);
    part(g, geoCone, c, 1.8, 6, 1.8, 0, 0, 16, Math.PI / 2);
    const w = new THREE.Shape(); w.moveTo(0, 8); w.lineTo(opt.wing || 13, -6); w.lineTo(-(opt.wing || 13), -6); w.closePath();
    const wm = new THREE.Mesh(new THREE.ShapeGeometry(w), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
    wm.rotation.x = -Math.PI / 2; g.add(wm);
    part(g, geoBox, c, 0.6, 6, 5, 0, 3, -10);
    if (opt.roundel) { const r = part(g, geoCyl, 0xffffff, 2.2, 0.3, 2.2, 7, 0.35, -2); part(g, geoCyl, 0xcd2e3a, 1.3, 0.35, 1.3, 7, 0.45, -2); r.renderOrder = 1; }
    g.scale.setScalar(s); return g;
  },
  wing(c = 0x26292e, s = 1) {   // 전익 폭격기
    const g = new THREE.Group();
    const w = new THREE.Shape(); w.moveTo(0, 14); w.lineTo(30, -6); w.lineTo(20, -10); w.lineTo(10, -4); w.lineTo(0, -10); w.lineTo(-10, -4); w.lineTo(-20, -10); w.lineTo(-30, -6); w.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(w, { depth: 2, bevelEnabled: false }), mat(c)); m.rotation.x = -Math.PI / 2; g.add(m);
    g.scale.setScalar(s); return g;
  },
  heli(c = 0x4e5a3c, s = 1) {
    const g = new THREE.Group();
    part(g, geoBox, c, 6, 6, 16, 0, 0, 2); part(g, geoBox, c, 1.6, 1.6, 16, 0, 1.6, -12);
    part(g, geoBox, 0x9fc3d8, 5, 3, 3, 0, 1, 10);
    const rot = new THREE.Group(); rot.position.y = 4.5; g.add(rot);
    part(rot, geoBox, 0x222, 34, 0.3, 1.4, 0, 0, 0); part(rot, geoBox, 0x222, 1.4, 0.3, 34, 0, 0, 0);
    part(g, geoBox, 0x3a3f36, 10, 1, 2, 0, -2, 3);
    g.userData.rot = rot; g.scale.setScalar(s); return g;
  },
  ship(c = 0x7d8794, s = 1, opt = {}) {
    const g = new THREE.Group();
    const L = opt.carrier ? 120 : 70, W = opt.carrier ? 26 : 14;
    part(g, geoBox, c, W, 8, L, 0, 3, 0);
    part(g, geoCone, c, W / 2, 16, 4, 0, 3, L / 2 + 6, Math.PI / 2, 0, 0).scale.set(W / 2, 14, 4);
    if (opt.carrier) { part(g, geoBox, 0x5a626c, W + 8, 1, L, 0, 7.5, 0); part(g, geoBox, c, 6, 12, 14, W / 2, 14, -10); }
    else { part(g, geoBox, c, 9, 10, 16, 0, 12, 4); part(g, geoBox, c, 5, 8, 6, 0, 20, 4); part(g, geoCyl, 0x444, 0.8, 9, 0.8, 0, 9, 24, Math.PI / 2 - 0.2); }
    if (opt.sub) { g.clear(); part(g, geoCyl, 0x22262b, 6, 70, 6, 0, 0, 0, Math.PI / 2); part(g, geoBox, 0x22262b, 3, 9, 10, 0, 6, 10); }
    g.scale.setScalar(s); return g;
  },
  drone(c = 0xdfe4ea, s = 1) {
    const g = new THREE.Group();
    part(g, geoBox, c, 6, 2, 6, 0, 0, 0);
    for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) part(g, geoCyl, 0x333, 3, 0.3, 3, x, 1, z);
    g.scale.setScalar(s); return g;
  },
};

// ---------- 발사체 풀 (포탄·로켓·미사일 공용)
const PCAP = 48;
const projs = [];
let projPool = [];
function projMesh() {
  const g = new THREE.Group();
  const body = part(g, geoCyl, 0xf0f0f0, 0.9, 7, 0.9, 0, 0, 0, Math.PI / 2);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowTex, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(14); g.add(glow);
  g.userData.body = body; g.userData.glow = glow; g.visible = false; A.scene.add(g); return g;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
// from, to: Vector3. opt: dur, arc(높이), size, color, smoke, onHit(pos), low(낮게 직선)
export function shoot(from, to, opt = {}) {
  if (!A) return;
  if (projs.length >= PCAP) { opt.onHit && opt.onHit(to.clone()); return; }
  const g = projPool.pop() || projMesh();
  g.visible = true; g.position.copy(from);
  g.userData.glow.material.color.setHex(opt.color || 0xffa040);
  g.userData.glow.scale.setScalar(opt.glow || 14);
  g.userData.body.scale.set(0.9 * (opt.size || 1), 7 * (opt.size || 1), 0.9 * (opt.size || 1));
  g.userData.body.visible = opt.body !== false;
  const d = from.distanceTo(to);
  projs.push({ g, from: from.clone(), to: to.clone(), t: -(opt.delay || 0), dur: opt.dur || Math.max(0.6, d / 420), arc: opt.arc != null ? opt.arc : d * 0.35, opt });
}
function stepProjs(dt) {
  const f = A.fx();
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.t += dt;
    if (p.t < 0) { p.g.visible = false; continue; }
    p.g.visible = true;
    const k = Math.min(1, p.t / p.dur);
    _a.copy(p.g.position);
    p.g.position.lerpVectors(p.from, p.to, k); p.g.position.y += Math.sin(k * Math.PI) * p.arc;
    _b.copy(p.g.position).add(p.g.position).sub(_a); p.g.lookAt(_b);
    if (p.opt.smoke !== false && f.smoke && Math.random() < 0.7) f.smoke.emit(_a.x, _a.y, _a.z, rnd(1), rnd(1), rnd(1), 1.0, 3, 10, 0.5, 0.9, 0.9, 0.88, 0.9);
    if (f.fire && Math.random() < 0.6) f.fire.emit(_a.x, _a.y, _a.z, 0, 0, 0, 0.15, 6, 2, 1, 1, 0.55, 0.2, 0.9);
    if (k >= 1) {
      p.g.visible = false; projPool.push(p.g); projs.splice(i, 1);
      p.opt.onHit && p.opt.onHit(p.to);
    }
  }
}
function clearProjs() { for (const p of projs) { p.g.visible = false; projPool.push(p.g); } projs.length = 0; }

// 요격 선 (짧게 번쩍)
const tracers = [];
function tracer(from, to, col = 0x8fd8ff) {
  let t = tracers.find((x) => x.t <= 0);
  if (!t) {
    if (tracers.length > 10) return;
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    line.frustumCulled = false; A.scene.add(line); t = { line, t: 0 }; tracers.push(t);
  }
  const a = t.line.geometry.attributes.position.array; a.set([from.x, from.y, from.z, to.x, to.y, to.z]);
  t.line.geometry.attributes.position.needsUpdate = true; t.line.material.color.setHex(col); t.line.visible = true; t.t = 0.3;
}
function stepTracers(dt) { for (const t of tracers) if (t.t > 0) { t.t -= dt; t.line.material.opacity = Math.max(0, t.t / 0.3); if (t.t <= 0) t.line.visible = false; } }

export function boom(p, col = 0xffa040, n = 18, ring = 24) {
  const f = A.fx(); if (!f.fire) return;
  for (let i = 0; i < n; i++) f.fire.emit(p.x, p.y, p.z, rnd(40), rnd(40), rnd(40), 0.45, 9, 22, 1, 1, col === 0xffa040 ? 0.6 : 0.85, col === 0xffa040 ? 0.25 : 1, 0.9);
  A.rings && A.rings.add(p.x, p.y, p.z, ring, col, 0.5);
}

// ---------- 소리 (경적·사이렌 합성)
function horn(side) {
  const s = A.sfx; if (!s || !s.ctx || s.muted) return;
  const c = s.ctx, t = c.currentTime;
  if (side === 'p') {   // 나팔 두 음
    [[0, 392], [0.28, 523]].forEach(([dt, fq]) => {
      for (const det of [0, 4]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fq + det;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.16, t + dt + 0.04); g.gain.setValueAtTime(0.16, t + dt + 0.22); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + (dt ? 0.6 : 0.26));
        o.connect(lp); lp.connect(g); g.connect(s.out); o.start(t + dt); o.stop(t + dt + 0.7);
      }
    });
  } else {              // 사이렌 오르내림
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(980, t + 0.45); o.frequency.linearRampToValueAtTime(520, t + 0.9); o.frequency.linearRampToValueAtTime(980, t + 1.35);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.08); g.gain.setValueAtTime(0.14, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(g); g.connect(s.out); o.start(t); o.stop(t + 1.6);
  }
}

// ---------- 게이지 정의
// 우리 편 힘 P = log2(1 + r/1천억), r = 최근 5초 평균 「초당 부순 집값」 (지원군 공격 포함, 큰 연쇄 한 방이 너무 크지 않게 로그)
// 방어 힘 D = 0.75 + 방어 사건 누적(요격 1·보복/폭격 손실 1.5·보복 발사 0.5, 5초 감쇠) × 0.25 + 일본 0.5 + 미국 0.7 (활동 중일 때)
// 게이지 목표 = 0.5 + 0.5·tanh(1.3·(P − D)), 0 = 완전 열세 · 1 = 완전 우세. 실제 게이지는 목표를 부드럽게 따라감.
// 참전: 게이지 < 0.3 이 1.5초 = 「밀림」, > 0.72 가 1.5초 = 「우세」. 일본이 온 뒤엔 우세가 꺾이거나(< 0.45) 12초가 지나면 중국.
// 참전 사이 7초 쉼, 한 판에 나라마다 한 번.
const REF = 1e11;
const W = { since: {}, g: 0.5, pr: 0, def: 0, lowT: 0, hiT: 0, cool: 0, order: [], active: {}, lastPrice: 0, mk: { shots: 0, loss: 0 }, t: 0, allyVal: 0, blocked: 0, enemyHits: 0 };
function nextEntry(kind) {
  const has = (k) => W.order.includes(k);
  if (kind === 'low') {           // 우리 편이 밀림 → 우리 편 지원
    if (has('jp') && !has('cn')) return 'cn';    // 일본 온 뒤 밀리면 중국
    if (!has('kp')) return 'kp';                 // 처음 밀리면 북한
    if (!has('cn')) return 'cn';                 // 북한도 밀리면 중국
  } else {                        // 우리 편이 우세 → 방어군 지원
    if (has('cn') && !has('us')) return 'us';    // 중국 쪽이 우세하면 미국
    if (!has('jp')) return 'jp';                 // 처음 우세하면 일본
  }
  return null;
}
export function decide(kind, order) { const o = W.order; W.order = order; const r = nextEntry(kind); W.order = o; return r; }   // 검사용

// ---------- 나라별 부대
const U = {};   // code → { grp, units[], ... } (판마다 재사용)
function edgePos(dir, out = new THREE.Vector3()) {   // 카메라가 보는 곳에서 dir 방향으로 화면 밖 (지도 안쪽으로 제한)
  const cam = A.cam, R = A.data.R * 0.92;
  const d = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[dir];
  const x = cam.tx + d[0] * 430, z = cam.tz + d[1] * 430;
  const r = Math.hypot(x, z); const k = r > R ? R / r : 1;
  return out.set(x * k, 0, z * k);
}
function flagSprite(code) {
  const cv = document.createElement('canvas'); cv.width = 120; cv.height = 80;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => { const g = cv.getContext('2d'); g.drawImage(flagImg[code], 0, 0, 120, 80); tex.needsUpdate = true; };
  if (flagImg[code].complete) draw(); else flagImg[code].onload = draw;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sp.scale.set(24, 16, 1); return sp;
}
function build(code) {
  if (U[code]) return U[code];
  const grp = new THREE.Group(); A.scene.add(grp);
  const u = { grp, units: [], jets: [], drones: [], code };
  if (code === 'kp') {
    for (let i = 0; i < 4; i++) { const m = Models.wheeled(0x55603e, 1.1, { launcher: true }); m.position.set((i - 1.5) * 34, 0, 0); grp.add(m); u.units.push(m); }
  } else if (code === 'cn') {
    const sh = Models.ship(0x8a929c, 1.3, { carrier: true }); sh.rotation.y = Math.PI / 2; grp.add(sh); u.units.push(sh);
    for (let i = 0; i < 3; i++) { const j = Models.jet(0x9aa2ac, 1.1); j.visible = false; A.scene.add(j); u.jets.push({ m: j, t: -1 - i * 1.1 }); }
  } else if (code === 'jp') {
    const sh = Models.ship(0x9aa4ae, 1.2); sh.rotation.y = -Math.PI / 2; grp.add(sh); u.units.push(sh);
    for (let i = 0; i < 4; i++) { const d = Models.drone(0xe8ecf0, 1.6); d.visible = false; A.scene.add(d); u.drones.push(d); }
  } else if (code === 'us') {
    const sh = Models.ship(0x7d8794, 1.5, { carrier: true }); sh.rotation.y = Math.PI; grp.add(sh); u.units.push(sh);
    for (const x of [-90, 90]) { const e = Models.ship(0x8b95a0, 1.0); e.position.set(x, 0, -30); grp.add(e); u.units.push(e); }
    for (let i = 0; i < 2; i++) { const j = Models.wing(0x2a2d33, 1.3); j.visible = false; A.scene.add(j); u.jets.push({ m: j, t: -2 - i * 2.5 }); }
  }
  const fl = flagSprite(code); fl.position.set(0, 60, 0); grp.add(fl);
  grp.visible = false; U[code] = u; return u;
}
function targetB(near, r = 380) {
  const B = A.city.B, cand = [];
  for (let k = 0; k < 40; k++) {
    const b = B[Math.floor(Math.random() * B.length)];
    if (b.gone || b.cur < 5) continue;
    if (Math.hypot(b.cx - near.x, -b.cy - near.z) > r) continue;
    cand.push(b);
  }
  if (!cand.length) return B.find((b) => !b.gone && b.cur > 3);
  return cand.sort((a, b) => b.price - a.price)[0];
}
const camT = () => new THREE.Vector3(A.cam.tx, 0, A.cam.tz);
function allyHit(p, R) {
  if (A.G.state !== 'play') { boom(p); return; }
  const v = A.blast(p, R, { light: true, score: { verb: '지원 공격!', partVerb: '지원 공격!', chain: true } }) || 0;
  W.allyVal += v;
}
function enter(code) {
  if (W.order.includes(code)) return false;
  W.order.push(code); W.cool = 7; W.since[code] = W.t;
  const c = C[code], u = build(code);
  const dir = { kp: 'n', cn: 'w', jp: 'e', us: 's' }[code];
  edgePos(dir, u.grp.position);
  u.grp.position.y = A.groundAt(u.grp.position.x, u.grp.position.z) + 1;
  u.enterFrom = u.grp.position.clone().add(new THREE.Vector3(...{ n: [0, 0, -260], s: [0, 0, 260], w: [-260, 0, 0], e: [260, 0, 0] }[dir]));
  u.enterTo = u.grp.position.clone(); u.grp.position.copy(u.enterFrom);
  u.grp.visible = true; u.t = 0; u.fireT = 1.5; u.dur = c.dur;
  if (code === 'kp') u.grp.rotation.y = 0; if (code === 'jp') u.grp.rotation.y = 0;
  for (const d of u.drones) d.visible = true;
  u.jets.forEach((j, i) => { j.t = -1 - i * (code === 'us' ? 2.5 : 1.1); j.m.visible = false; });
  W.active[code] = u;
  showBanner(code);
  horn(c.side);
  emit('collect', 'war:' + code);
  renderGauge(true);
  return true;
}
function leave(code) {
  const u = W.active[code]; if (!u) return;
  u.grp.visible = false; for (const d of u.drones) d.visible = false; for (const j of u.jets) j.m.visible = false;
  delete W.active[code];
  renderGauge(true);
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
function stepUnits(dt) {
  for (const code in W.active) {
    const u = W.active[code];
    u.t += dt;
    const ek = Math.min(1, u.t / 2.5), e = 1 - Math.pow(1 - ek, 3);
    if (u.t < 2.5) u.grp.position.lerpVectors(u.enterFrom, u.enterTo, e);
    if (u.t > u.dur) { u.grp.position.lerpVectors(u.enterTo, u.enterFrom, Math.min(1, (u.t - u.dur) / 2)); if (u.t > u.dur + 2) { leave(code); continue; } }
    const acting = u.t > 2 && u.t < u.dur && A.G.state === 'play';
    if (code === 'kp' && acting) {          // 다연장 로켓 일제 사격
      u.fireT -= dt;
      if (u.fireT <= 0) {
        u.fireT = 2.4;
        const tc = camT(); u.vol = (u.vol || 0) + 1;
        u.units.forEach((m, i) => {
          if (i % 2 !== u.vol % 2) return;   // 한 번에 두 대씩 번갈아
          const b = targetB(tc); if (!b) return;
          m.getWorldPosition(_v); _v.y += 14;
          const to = new THREE.Vector3(b.cx + rnd(6), b.base + Math.min(b.cur, 6), -b.cy + rnd(6));
          shoot(_v, to, { delay: i * 0.18, dur: 1.4, color: 0xff7a30, onHit: (p) => allyHit(p, 12) });
        });
        A.sfx && A.sfx.whoosh && A.sfx.whoosh(0.5);
      }
    }
    if (code === 'cn' || code === 'us') {   // 항모 발진 → 목표 상공 통과
      for (const j of u.jets) {
        j.t += dt;
        if (j.t < 0) continue;
        if (!j.path) {
          if (!acting) { j.m.visible = false; continue; }
          const s = u.grp.position.clone(); s.y = 140;
          let tgt;
          if (code === 'cn') { const b = targetB(camT()); tgt = b ? new THREE.Vector3(b.cx, 0, -b.cy) : camT(); }
          else tgt = homeTarget();
          const dir = tgt.clone().sub(s); dir.y = 0; dir.normalize();
          const e2 = tgt.clone().addScaledVector(dir, 600); e2.y = 140;
          j.path = { s, tgt, e: e2, L: s.distanceTo(e2), drop: 0 }; j.t = 0; j.m.visible = true;
        }
        const P = j.path, spd = code === 'cn' ? 320 : 220, k = Math.min(1, j.t * spd / P.L);
        j.m.position.lerpVectors(P.s, P.e, k); _w.lerpVectors(P.s, P.e, Math.min(1, k + 0.01)); j.m.lookAt(_w);
        const dTo = Math.hypot(j.m.position.x - P.tgt.x, j.m.position.z - P.tgt.z);
        if (!P.drop && dTo < 60 && acting) {
          P.drop = 1;
          if (code === 'cn') for (let q = 0; q < 2; q++) { const b = targetB(P.tgt, 120); if (!b) break; shoot(j.m.position, new THREE.Vector3(b.cx, b.base + 3, -b.cy), { delay: q * 0.2, dur: 0.9, arc: 10, color: 0xff5040, onHit: (p) => allyHit(p, 13) }); }
          else enemyBomb(j.m.position, P.tgt);
        }
        if (k >= 1) { j.path = null; j.t = code === 'us' ? -2.5 : -2.2; j.m.visible = false; }
      }
    }
    if (code === 'jp') {                    // 드론이 카메라 주변 상공에서 맴돔
      u.drones.forEach((d, i) => { const a = u.t * 0.6 + i * Math.PI / 2; d.position.set(A.cam.tx + Math.cos(a) * 160, 150 + Math.sin(u.t * 2 + i) * 6, A.cam.tz + Math.sin(a) * 160); });
    }
  }
}
function homeTarget() {
  const G = A.G, B = A.city.B;
  if (G.home >= 0 && !B[G.home].gone) return new THREE.Vector3(B[G.home].cx, 0, -B[G.home].cy);
  const b = targetB(camT(), 300); return b ? new THREE.Vector3(b.cx, 0, -b.cy) : camT();
}
function enemyBomb(from, tgt) {   // 미국 폭격기 → 우리 집(없으면 내 구역) 보복
  const G = A.G, B = A.city.B;
  const b = G.home >= 0 && !B[G.home].gone ? B[G.home] : targetB(tgt, 80);
  if (!b) return;
  const to = new THREE.Vector3(b.cx, b.base + Math.max(4, b.cur), -b.cy);
  shoot(from, to, { dur: 1.3, arc: 0, color: 0xff3020, size: 1.4, onHit: (p) => {
    if (A.G.state !== 'play') return;
    if (A.arsenal && A.arsenal.interceptEnemy && A.arsenal.interceptEnemy(p)) return;   // 천궁·이지스 요격
    W.def += 1.5; W.enemyHits++;
    const loss = Math.min(Math.max(0, A.G.price), 8e10);
    A.G.price -= loss;
    A.enemyStrike(b);
    A.popup(p.clone().add(new THREE.Vector3(0, 30, 0)), `폭격 손실 <em>−${A.won(loss)}</em>`, 0.1, true, 1);
    A.updateHud();
  } });
}
// 플레이어 운석·미사일을 방어군이 요격? (main.js · arsenal.js 가 부름)
export function blockMeteor(pos) {
  if (!A || A.G.state !== 'play') return false;
  let ch = 0, src = null;
  if (W.active.jp && W.active.jp.t > 2 && W.active.jp.t < W.active.jp.dur) { ch += 0.35; src = W.active.jp.drones[Math.floor(Math.random() * 4)].position; }
  if (W.active.us && W.active.us.t > 2 && W.active.us.t < W.active.us.dur) { ch += 0.3; if (!src || Math.random() < 0.5) src = W.active.us.units[1 + Math.floor(Math.random() * 2)].getWorldPosition(new THREE.Vector3()).setY(30); }
  if (!ch) return false;
  if (A.arsenal && A.arsenal.counterFactor) ch *= A.arsenal.counterFactor();
  if (Math.random() >= ch) return false;
  tracer(src, pos); boom(pos, 0x8fd8ff, 20, 30);
  W.def += 1; W.blocked++;
  A.popup(pos.clone(), '🛡 방어군 요격!', 0, false, 0);
  A.sfx && A.sfx.whoosh && A.sfx.whoosh(0.25);
  return true;
}

// ---------- 화면
function buildDom() {
  const gw = document.createElement('div'); gw.id = 'warGauge'; gw.className = 'hidden';
  gw.innerHTML = `<div class="side l" id="wgL"></div><div class="bar"><i id="wgFill"></i><b id="wgMid"></b></div><div class="side r" id="wgR"></div>`;
  document.body.appendChild(gw);
  const bn = document.createElement('div'); bn.id = 'warBan'; bn.className = 'hidden'; document.body.appendChild(bn);
  const note = document.querySelector('#start .note');
  if (note) { const p = document.createElement('p'); p.className = 'note warNote'; p.innerHTML = `${flagSvg('kr', 11)} 게임 속 가상 전쟁입니다 · 형세에 따라 다른 나라가 참전해요 (실존 인물은 나오지 않습니다)`; note.after(p); }
  const st = document.querySelector('#end .stats');
  if (st) { const d = document.createElement('div'); d.id = 'warEnd'; d.className = 'hidden'; st.after(d); }
}
function renderGauge(force) {
  const el = $('wgFill'); if (!el) return;
  el.style.width = (W.g * 100).toFixed(1) + '%';
  if (!force) return;
  const pl = ['kr', ...W.order.filter((c) => C[c].side === 'p')], df = W.order.filter((c) => C[c].side === 'd');
  $('wgL').innerHTML = pl.map((c) => `<span class="${W.active[c] || c === 'kr' ? 'on' : ''}">${flagSvg(c, 12)}</span>`).join('') + '<em>우리 편</em>';
  $('wgR').innerHTML = '<em>방어군</em>' + df.map((c) => `<span class="${W.active[c] ? 'on' : ''}">${flagSvg(c, 12)}</span>`).join('') + '<span class="def">🛡</span>';
}
let banT = 0;
function showBanner(code) {
  const c = C[code], el = $('warBan');
  el.innerHTML = `<div class="fl">${flagSvg(code, 44)}</div><b>${c.ban}</b><small>${c.side === 'p' ? '우리 편 지원' : '방어군 지원'} · ${c.who}: 「${c.say}」</small>`;
  el.className = 'show ' + (c.side === 'p' ? 'p' : 'd'); banT = 2.6;
}

// ---------- 공개 함수
export function init(api) {
  A = api; A.war = { blockMeteor };
  buildDom();
  window.__war = {
    force(code) { if (!C[code] || !A || A.G.state !== 'play') return false; W.order = W.order.filter((x) => x !== code); return enter(code); },
    get state() { return { g: W.g, order: W.order.slice(), active: Object.keys(W.active), allyVal: W.allyVal, blocked: W.blocked, enemyHits: W.enemyHits, P: Math.log1p(W.pr / REF) / Math.LN2, def: W.def }; },
    setGauge(v) { W.g = v; }, decide, W, blockMeteor,
  };
}
export function reset() {
  for (const k of Object.keys(W.active)) leave(k);
  clearProjs();
  Object.assign(W, { since: {}, g: 0.5, pr: 0, def: 0, lowT: 0, hiT: 0, cool: 0, order: [], active: {}, lastPrice: 0, t: 0, allyVal: 0, blocked: 0, enemyHits: 0 });
  W.mk = mkStat();
  $('warGauge').classList.remove('hidden'); $('warBan').className = 'hidden';
  renderGauge(true);
}
function mkStat() { const S = A.MK && A.MK._S; return S ? { shots: S.shots, loss: S.lossTotal } : { shots: 0, loss: 0 }; }
export function busy() { return projs.length > 0; }
export function result() { return { order: W.order.slice(), win: W.g >= 0.5, g: W.g, allyVal: W.allyVal }; }
export function end() {
  for (const k of Object.keys(W.active)) leave(k);
  clearProjs();
  $('warGauge').classList.add('hidden'); $('warBan').className = 'hidden';
  const el = $('warEnd'); if (!el) return;
  const win = W.g >= 0.5;
  el.innerHTML = `<div class="row"><span class="lab">참전국</span>${W.order.length ? W.order.map((c) => `<span class="fc ${C[c].side}">${flagSvg(c, 16)}<small>${C[c].nm}</small></span>`).join('<i>→</i>') : '<small class="none">없음 (혼자 싸움)</small>'}</div>
    <div class="res ${win ? 'win' : 'lose'}">${flagSvg('kr', 16)} 최종 형세 <b>${win ? '승리' : '패배'}</b> <small>우세 ${(W.g * 100).toFixed(0)}%${W.allyVal > 0 ? ` · 지원 공격 +${A.wonShort(W.allyVal)}` : ''}</small></div>`;
  el.classList.remove('hidden');
}
// 결과 카드: 국기 줄 (카드 사진 왼쪽 위 제목 띠 밑)
export function drawCard(g, x, y, F) {
  if (!W.order.length) return;
  const fw = 54, fh = 36, gap = 10, pad = 16;
  g.font = `800 26px ${F}`;
  const lab = '참전', res = W.g >= 0.5 ? '승리' : '패배';
  const lw = g.measureText(lab).width, rw = g.measureText(res).width;
  const w = pad * 2 + lw + 12 + W.order.length * (fw + gap) + rw + 4;
  g.fillStyle = 'rgba(22,26,34,0.86)'; g.beginPath(); g.roundRect(x, y, w, fh + 20, 18); g.fill();
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(lab, x + pad, y + (fh + 20) / 2);
  let cx = x + pad + lw + 12;
  for (const c of W.order) { try { g.drawImage(flagImg[c], cx, y + 10, fw, fh); } catch (e) { /* 무시 */ } g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5; g.strokeRect(cx, y + 10, fw, fh); cx += fw + gap; }
  g.fillStyle = W.g >= 0.5 ? '#ffd24a' : '#ff8a80'; g.fillText(res, cx, y + (fh + 20) / 2);
  g.textBaseline = 'alphabetic';
}
export function step(real, dt) {
  if (!A) return;
  stepProjs(dt); stepTracers(real); stepUnits(dt);
  if (banT > 0) { banT -= real; if (banT <= 0) $('warBan').className = 'hidden'; }
  const G = A.G;
  if (G.state !== 'play') return;
  if (!G.armed) { W.lastPrice = G.price; return; }
  W.t += real;
  // 플레이어 힘
  const dp = Math.max(0, G.price - W.lastPrice); W.lastPrice = G.price;
  const inst = real > 0 ? dp / real : 0;
  W.pr += (inst - W.pr) * Math.min(1, real / 5);
  // 방어 사건 (market.js 보복 포함)
  const mk = mkStat();
  if (mk.shots > W.mk.shots) W.def += 0.5 * (mk.shots - W.mk.shots);
  if (mk.loss > W.mk.loss) W.def += 1.5;
  W.mk = mk;
  W.def *= Math.exp(-real / 5);
  const P = Math.log1p(W.pr / REF) / Math.LN2;
  const D = 0.75 + W.def * 0.25 + (W.active.jp ? 0.5 : 0) + (W.active.us ? 0.7 : 0);
  const target = 0.5 + 0.5 * Math.tanh(1.3 * (P - D));
  W.g += (target - W.g) * Math.min(1, real * 1.5);
  renderGauge(false);
  // 참전 판정
  if (W.cool > 0) W.cool -= real;
  W.lowT = W.g < 0.3 ? W.lowT + real : 0;
  W.hiT = W.g > 0.72 ? W.hiT + real : 0;
  W.midT = W.g < 0.45 ? (W.midT || 0) + real : 0;
  if (W.cool <= 0 && W.t > 4) {
    const jpThenCn = W.order.includes('jp') && !W.order.includes('cn') && (W.midT > 1.5 || W.t - W.since.jp > 12);
    if (jpThenCn) enter('cn');
    else if (W.lowT > 1.5) { const c = nextEntry('low'); if (c) enter(c); W.lowT = 0; }
    else if (W.hiT > 1.5) { const c = nextEntry('high'); if (c) enter(c); W.hiT = 0; }
  }
}
