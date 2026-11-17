// 효과: 입자(연기·불), 충격파, 크레이터, 소리
import * as THREE from 'three';

function radialTex(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, s] of stops) gr.addColorStop(o, s);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const glowTex = radialTex([[0, 'rgba(255,255,240,1)'], [0.25, 'rgba(255,200,90,0.85)'], [0.6, 'rgba(255,110,30,0.25)'], [1, 'rgba(255,80,0,0)']]);
const smokeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 64 + Math.cos(i * 2.1) * 22 * (i % 3 ? 1 : 0.4), y = 64 + Math.sin(i * 2.1) * 22 * (i % 3 ? 1 : 0.4), r = 30 + (i % 4) * 6;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c); return t;
})();
const craterTex = radialTex([[0, 'rgba(30,24,20,0.95)'], [0.35, 'rgba(55,44,36,0.9)'], [0.55, 'rgba(90,72,58,0.75)'],
  [0.72, 'rgba(120,100,80,0.45)'], [1, 'rgba(120,100,80,0)']], 256);

const VS = `
attribute float size; attribute float alpha; attribute vec3 tint;
varying float vA; varying vec3 vC;
uniform float scale;
void main() {
  vA = alpha; vC = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D map; varying float vA; varying vec3 vC;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vC * t.rgb, t.a * vA);
  if (gl_FragColor.a < 0.01) discard;
}`;

export class Particles {
  constructor(scene, n, tex, additive) {
    this.n = n; this.live = 0;
    this.pos = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.tint = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n); this.drag = new Float32Array(n); this.grav = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aTint = new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('size', this.aSize); g.setAttribute('alpha', this.aAlpha); g.setAttribute('tint', this.aTint);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex || smokeTex }, scale: { value: 600 } }, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 6 : 5;
    scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, a0, r, gc, b, drag = 0.9, grav = 0) {
    if (this.live >= this.n) return;
    const i = this.live++;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.tint.set([r, gc, b], i * 3);
    this.life[i] = 0; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.drag[i] = drag; this.grav[i] = grav;
    this.size[i] = s0; this.alpha[i] = a0;
  }
  update(dt, viewH) {
    this.mat.uniforms.scale.value = viewH;
    let i = 0;
    while (i < this.live) {
      this.life[i] += dt;
      const k = this.life[i] / this.max[i];
      if (k >= 1) { this.kill(i); continue; }
      const d = Math.pow(this.drag[i], dt * 10), j = i * 3;
      this.vel[j] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * dt; this.vel[j + 2] *= d;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - k) * (1 - k));
      this.alpha[i] = this.a0[i] * (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9);
      i++;
    }
    this.pts.geometry.setDrawRange(0, this.live);
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = this.aTint.needsUpdate = true;
  }
  kill(i) {
    const l = --this.live;
    if (i !== l) {
      for (const a of [this.pos, this.vel, this.tint]) { a[i * 3] = a[l * 3]; a[i * 3 + 1] = a[l * 3 + 1]; a[i * 3 + 2] = a[l * 3 + 2]; }
      for (const a of [this.size, this.alpha, this.life, this.max, this.s0, this.s1, this.a0, this.drag, this.grav]) a[i] = a[l];
    }
  }
  clear() { this.live = 0; this.pts.geometry.setDrawRange(0, 0); }
}

export class Decals {
  constructor(scene) { this.scene = scene; this.list = []; this.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); }
  crater(x, y, z, r) {
    const m = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({ map: craterTex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.position.set(x, y + 0.15, z); m.scale.set(r * 2.2, 1, r * 2.2); m.rotation.y = Math.random() * 6; m.renderOrder = 2;
    this.scene.add(m); this.list.push(m);
  }
  rubble(b, y) {
    // 무너진 자리: 발자국 모양 잔해 판
    const shape = new THREE.Shape();
    const f = b.ext;
    for (let i = 0; i < f.length; i += 2) (i ? shape.lineTo(f[i], f[i + 1]) : shape.moveTo(f[i], f[i + 1]));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const c = b.wc.clone().lerp(new THREE.Color(0.35, 0.3, 0.26), 0.55);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: c }));
    m.position.y = y; m.receiveShadow = true; this.scene.add(m); this.list.push(m);
  }
  clear() { for (const m of this.list) { this.scene.remove(m); m.material.dispose(); if (m.geometry !== this.geo) m.geometry.dispose(); } this.list = []; }
}

export class Rings {
  constructor(scene) {
    this.scene = scene; this.list = [];
    this.geo = new THREE.RingGeometry(0.9, 1, 72).rotateX(-Math.PI / 2);
  }
  add(x, y, z, r, color = 0xfff2c8, dur = 0.9) {
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.set(x, y + 1.2, z); m.renderOrder = 7; this.scene.add(m);
    this.list.push({ m, t: 0, r, dur });
  }
  update(dt) {
    this.list = this.list.filter((o) => {
      o.t += dt; const k = o.t / o.dur;
      if (k >= 1) { this.scene.remove(o.m); o.m.material.dispose(); return false; }
      const s = o.r * (0.2 + 2.8 * (1 - Math.pow(1 - k, 3)));
      o.m.scale.set(s, 1, s); o.m.material.opacity = 0.7 * (1 - k) * (1 - k);
      return true;
    });
  }
}

// ---- 소리 (WebAudio 합성)
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor(); this.out.connect(comp); comp.connect(this.ctx.destination);
      const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
    } catch (e) { this.ctx = null; }
  }
  setMuted(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : 0.8; }
  _noise(t, dur, f0, f1, q, g0, type = 'lowpass') {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(g0, t + Math.min(0.05, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  whoosh(dur) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this._noise(t, dur, 300, 2600, 4, 0.35, 'bandpass');
  }
  boom(size = 1) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.9);
    const g = c.createGain(); g.gain.setValueAtTime(0.9 * Math.min(1.3, size), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 1.4);
    this._noise(t, 1.6, 3000, 120, 0.7, 0.9);
    this._noise(t, 0.25, 6000, 1500, 0.5, 0.5, 'highpass');
  }
  crumble(n) {
    if (!this.ctx || this.muted || n <= 0) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < Math.min(8, n + 2); i++) this._noise(t + 0.25 + i * 0.13 + Math.random() * 0.1, 0.5 + Math.random() * 0.5, 900, 150, 1.2, 0.25);
  }
  ding() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + i * 0.08); g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.4);
      o.connect(g); g.connect(this.out); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.45);
    });
  }
}
