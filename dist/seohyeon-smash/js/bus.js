// 아주 작은 이벤트 통로 — 다른 모듈이 서로 import 하지 않고 meta.js(도감·저장)에 알림
const L = {};
export function on(type, fn) { (L[type] = L[type] || []).push(fn); }
export function emit(type, data) {
  const fs = L[type]; if (!fs) return;
  for (const f of fs) { try { f(data); } catch (e) { console.warn('bus', type, e); } }
}

// 판 가운데 가림 줄이기 — 조용한 시간(보복 미사일 비행 중 · 탄 맞은 뒤 1.5초)에는 인물·토스트를 미룸
export const ui = { quietUntil: 0, incoming: false, char: null };
export const quiet = () => ui.incoming || performance.now() < ui.quietUntil;
// 인물 자리 하나: 새 인물이 나오면 다른 모듈 인물은 내림
export function charShow(who) { ui.char = who; emit('char', who); }
export function charHide(who) { if (ui.char === who) ui.char = null; }
export const charBusy = (who) => ui.char && ui.char !== who;
