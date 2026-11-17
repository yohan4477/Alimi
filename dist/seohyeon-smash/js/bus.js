// 아주 작은 이벤트 통로 — 다른 모듈이 서로 import 하지 않고 meta.js(도감·저장)에 알림
const L = {};
export function on(type, fn) { (L[type] = L[type] || []).push(fn); }
export function emit(type, data) {
  const fs = L[type]; if (!fs) return;
  for (const f of fs) { try { f(data); } catch (e) { console.warn('bus', type, e); } }
}
