// 정적 도시 만들기: 원판·땅 층·지반·건물(병합)·나무·차(인스턴스)·고가
import * as THREE from 'three';

export const ZS = 1.5;               // 땅 층 사이 간격 확대(깊이 싸움 방지)
const col = (c) => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
export { col };

export function windowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgb(232,232,232)'; g.fillRect(0, 0, 64, 6);
  g.fillStyle = 'rgb(112,134,160)'; g.fillRect(12, 18, 40, 30);
  g.fillStyle = 'rgb(150,172,196)'; g.fillRect(12, 18, 40, 7);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// 평면 폴리곤 유틸 (u,v)
export function pip(x, y, f) {
  let inside = false;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const xi = f[i], yi = f[i + 1], xj = f[j], yj = f[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pipRings(x, y, g) {          // g = [ext, hole...]
  if (!pip(x, y, g[0])) return false;
  for (let k = 1; k < g.length; k++) if (pip(x, y, g[k])) return false;
  return true;
}
export function ringArea(f) {
  let a = 0;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) a += f[j] * f[i + 1] - f[i] * f[j + 1];
  return a / 2;
}
export function distToRing(x, y, f) {
  let best = Infinity;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const ax = f[j], ay = f[j + 1], bx = f[i], by = f[i + 1];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    let t = ((x - ax) * dx + (y - ay) * dy) / L; t = Math.max(0, Math.min(1, t));
    const ex = ax + t * dx - x, ey = ay + t * dy - y, d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// 비인덱스 삼각형 버퍼
class Buf {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; }
  get count() { return this.p.length / 3; }
  tri(a, b, c, n, cl, ua, ub, uc) {
    // a,b,c = [x,y,z] ; 법선과 감김 맞춤
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) {
      this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.c.push(cl.r, cl.g, cl.b);
      this.uv.push(u ? u[0] : 0.05, u ? u[1] : 0.05);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

const P3 = (u, y, v) => [u, y, -v];
const UP = [0, 1, 0];

function walls(buf, f, y0, y1, cl, fh, outward, uvs) {
  // f: 고리 평면 좌표. outward: 고리 면적 부호 곱(바깥 법선 방향)
  let per = 0;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const ax = f[j], ay = f[j + 1], bx = f[i], by = f[i + 1];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    if (L < 1e-3) continue;
    // CCW 고리의 바깥 = (dy,-dx) in uv → three (x=u, z=-v): (dy, 0, dx)
    const nx = dy / L * outward, nz = dx / L * outward;
    const n = [nx, 0, nz];
    const A0 = P3(ax, y0, ay), B0 = P3(bx, y0, by), A1 = P3(ax, y1, ay), B1 = P3(bx, y1, by);
    const u0 = per / 3.6, u1 = (per + L) / 3.6, v1 = (y1 - y0) / fh;
    if (uvs) {
      buf.tri(A0, B0, B1, n, cl, [u0, 0], [u1, 0], [u1, v1]);
      buf.tri(A0, B1, A1, n, cl, [u0, 0], [u1, v1], [u0, v1]);
    } else {
      buf.tri(A0, B0, B1, n, cl); buf.tri(A0, B1, A1, n, cl);
    }
    per += L;
  }
}

function cap(buf, g, y, cl) {
  const toV = (f) => { const a = []; for (let i = 0; i < f.length; i += 2) a.push(new THREE.Vector2(f[i], f[i + 1])); return a; };
  const ext = toV(g[0]), holes = g.slice(1).map(toV);
  let tris;
  try { tris = THREE.ShapeUtils.triangulateShape(ext, holes); } catch (e) { return; }
  const all = ext.concat(...holes);
  for (const t of tris) {
    const a = all[t[0]], b = all[t[1]], c = all[t[2]];
    buf.tri(P3(a.x, y, a.y), P3(b.x, y, b.y), P3(c.x, y, c.y), UP, cl);
  }
}

export function buildCity(data, scene, opts) {
  const R = data.R, PH = data.PH;
  const layerY = (z) => (z < PH - 1 ? z * ZS : PH + (z - PH) * ZS);
  const out = {};

  // ---- 원판(흙 테두리)
  const soil = col(data.soil), soilTop = col(data.soil_top), ground = col(data.ground);
  const discG = new THREE.CylinderGeometry(R, R * 0.985, 34, 160, 1, false);
  const disc = new THREE.Mesh(discG, [
    new THREE.MeshLambertMaterial({ color: soil }),
    new THREE.MeshLambertMaterial({ color: ground }),
    new THREE.MeshLambertMaterial({ color: soil.clone().multiplyScalar(0.6) })]);
  disc.position.y = -17; disc.receiveShadow = true; scene.add(disc);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.5, R + 0.5, 5, 160, 1, true),
    new THREE.MeshLambertMaterial({ color: soilTop }));
  rim.position.y = -2.4; scene.add(rim);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.99, R * 0.982, 10, 160, 1, true),
    new THREE.MeshLambertMaterial({ color: soil.clone().multiplyScalar(0.78) }));
  band.position.y = -26; scene.add(band);

  // ---- 땅 층 + 지반 옆면
  const gb = new Buf();
  for (const L of data.layers) {
    const c = col(L.c), y = layerY(L.z), v = L.v, t = L.t;
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i] * 2, b = t[i + 1] * 2, d = t[i + 2] * 2;
      gb.tri(P3(v[a], y, v[a + 1]), P3(v[b], y, v[b + 1]), P3(v[d], y, v[d + 1]), UP, c);
    }
  }
  const wallC = new THREE.Color().setRGB(0.62, 0.58, 0.52, THREE.SRGBColorSpace);
  for (const g of data.plateau) {
    g.forEach((f, k) => {
      const s = Math.sign(ringArea(f)) * (k === 0 ? 1 : -1);
      walls(gb, f, 0, PH, wallC, 3, s, false);
    });
  }
  // 고가 상판
  const deckC = new THREE.Color().setRGB(0.58, 0.58, 0.6, THREE.SRGBColorSpace);
  const deckTop = new THREE.Color().setRGB(0.36, 0.37, 0.4, THREE.SRGBColorSpace);
  const brb = new Buf(), bridge = [];
  for (const [q, h0, h1, pillar, bid] of data.decks) {
    const tb = bid ? brb : gb;
    const st0 = tb.count;
    const pts = [[q[0], q[1], h0], [q[2], q[3], h0], [q[4], q[5], h1], [q[6], q[7], h1]];
    const top = pts.map(([u, v, h]) => P3(u, h, v)), bot = pts.map(([u, v, h]) => P3(u, h - 1.1, v));
    tb.tri(top[0], top[1], top[2], UP, deckTop); tb.tri(top[0], top[2], top[3], UP, deckTop);
    tb.tri(bot[0], bot[2], bot[1], [0, -1, 0], deckC); tb.tri(bot[0], bot[3], bot[2], [0, -1, 0], deckC);
    const f = [q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7]], s = Math.sign(ringArea(f));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const dx = q[j * 2] - q[i * 2], dy = q[j * 2 + 1] - q[i * 2 + 1], L = Math.hypot(dx, dy) || 1;
      const n = [dy / L * s, 0, dx / L * s];
      tb.tri(bot[i], bot[j], top[j], n, deckC); tb.tri(bot[i], top[j], top[i], n, deckC);
    }
    if (pillar) {
      const cu = (q[0] + q[2] + q[4] + q[6]) / 4, cv = (q[1] + q[3] + q[5] + q[7]) / 4, hh = (h0 + h1) / 2 - 1.1, r = 0.7;
      const sq = [cu - r, cv - r, cu + r, cv - r, cu + r, cv + r, cu - r, cv + r];
      walls(tb, sq, 0, hh, deckC, 3, 1, false);
    }
    if (bid) {
      const cu = (q[0] + q[2] + q[4] + q[6]) / 4, cv = (q[1] + q[3] + q[5] + q[7]) / 4;
      bridge.push({ bid, start: st0, count: tb.count - st0, x: cu, z: -cv, h: (h0 + h1) / 2, gone: false,
        len: Math.max(Math.hypot(q[2] - q[0], q[3] - q[1]), Math.hypot(q[4] - q[2], q[5] - q[3])) });
    }
  }
  if (bridge.length) {
    const bm = new THREE.Mesh(brb.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    bm.receiveShadow = true; bm.castShadow = true; scene.add(bm);
    out.bridgeMesh = bm; out.bridgeOrig = bm.geometry.attributes.position.array.slice();
  }
  out.bridge = bridge;
  const groundMesh = new THREE.Mesh(gb.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  out.groundMesh = groundMesh;

  // ---- 건물 (한 덩어리)
  const bb = new Buf();
  const B = [];
  data.buildings.forEach((b, i) => {
    const start = bb.count;
    const fh = Math.max(2.6, b.h / Math.max(1, b.f));
    const wc = col(b.w), rc = col(b.r);
    const y0 = b.z, y1 = b.z + b.h;
    let area = 0, cx = 0, cy = 0, np = 0, ext = b.g[0][0];
    for (const g of b.g) {
      g.forEach((f, k) => {
        const s = Math.sign(ringArea(f)) * (k === 0 ? 1 : -1);
        walls(bb, f, y0, y1, wc, fh, s, true);
        const a = Math.abs(ringArea(f)); area += k === 0 ? a : -a;
        if (k === 0) { for (let j = 0; j < f.length; j += 2) { cx += f[j]; cy += f[j + 1]; np++; } if (f.length > ext.length) ext = f; }
      });
      cap(bb, g, y1, rc);
    }
    cx /= np; cy /= np;
    let rad = 0;
    for (const g of b.g) { const f = g[0]; for (let j = 0; j < f.length; j += 2) rad = Math.max(rad, Math.hypot(f[j] - cx, f[j + 1] - cy)); }
    B.push({ i, d: b, start, count: bb.count - start, fh, cx, cy, rad, area: Math.max(area, 4), ext,
      base: b.z, h: b.h, cur: b.h, gone: false, wc, rc,
      vol: Math.max(area, 4) * b.h, price: b.price || 0 });
  });
  const bg = bb.geometry();
  const win = windowTexture();
  const bmat = new THREE.MeshLambertMaterial({ vertexColors: true, map: win });
  const bmesh = new THREE.Mesh(bg, bmat);
  bmesh.castShadow = true; bmesh.receiveShadow = true;
  scene.add(bmesh);
  out.bmesh = bmesh; out.B = B; out.win = win;
  out.origPos = bg.attributes.position.array.slice();
  out.origUV = bg.attributes.uv.array.slice();
  out.origCol = bg.attributes.color.array.slice();
  bg.attributes.color.setUsage(THREE.DynamicDrawUsage);

  // ---- 나무 (인스턴스)
  const trunk = new THREE.CylinderGeometry(0.28, 0.38, 2.4, 5).translate(0, 1.2, 0);
  const crown = new THREE.IcosahedronGeometry(2.3, 0).translate(0, 3.9, 0);
  const tg = mergeColored([[trunk, [0.42, 0.3, 0.2]], [crown, [1, 1, 1]]]);
  const T = data.trees;
  const trees = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true }), T.length);
  const greens = [[86, 140, 62], [70, 128, 58], [104, 156, 72], [122, 166, 80], [92, 150, 90]].map(col);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const treeState = [];
  T.forEach((t, i) => {
    const sc = 0.75 + t[2] * 0.14;
    const y = layerY(t[4] > 1 ? PH + 0.3 : 0.3) ;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.39) % 6.28);
    p.set(t[0], y, -t[1]); s.set(sc, sc * (0.9 + t[3] * 0.1), sc);
    m.compose(p, q, s); trees.setMatrixAt(i, m);
    const c = greens[(t[3] + t[2] * 2 + i) % greens.length].clone().multiplyScalar(0.92 + (i % 7) * 0.025);
    trees.setColorAt(i, c);
    treeState.push({ x: t[0], z: -t[1], y, sc, sy: s.y, rot: q.clone(), fall: 0, ax: null, done: false });
  });
  trees.castShadow = true; trees.receiveShadow = false;
  trees.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(trees);
  out.trees = trees; out.treeState = treeState;

  // ---- 차 (인스턴스)
  const Cc = data.cars;
  const carG = new THREE.BoxGeometry(4.3, 1.45, 1.85).translate(0, 0.72, 0);
  const cars = new THREE.InstancedMesh(carG, new THREE.MeshLambertMaterial(), Cc.length);
  const carState = [];
  Cc.forEach((c, i) => {
    const y = layerY(c[4] > 1 ? PH + 0.42 : 0.42) + 0.02;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c[2]);
    p.set(c[0], y, -c[1]); s.set(1, 1, 1); m.compose(p, q, s); cars.setMatrixAt(i, m);
    const cc = col(c[3]); cars.setColorAt(i, cc);
    carState.push({ x: c[0], z: -c[1], y, rot: q.clone(), color: cc, gone: false });
  });
  cars.castShadow = true;
  scene.add(cars);
  out.cars = cars; out.carState = carState;

  out.layerY = layerY;
  return out;
}

function mergeColored(list) {
  const P = [], N = [], C = [], I = [];
  let off = 0;
  for (const [g0, c] of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i++) { P.push(pa[i]); N.push(na[i]); }
    for (let i = 0; i < pa.length / 3; i++) C.push(c[0], c[1], c[2]);
    off += pa.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

export function makeLabel(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 72;
  const g = c.getContext('2d');
  g.font = '800 34px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  const w = Math.min(250, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  const x = (256 - w) / 2;
  g.beginPath(); g.roundRect(x, 8, w, 52, 16); g.fill();
  g.fillStyle = '#1d2430'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(46, 13, 1); sp.renderOrder = 10; sp.material.opacity = 0.75;   // 작게·반투명
  return sp;
}
