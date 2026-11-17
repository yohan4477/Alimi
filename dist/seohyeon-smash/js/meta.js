// 서현역 부수기 — 계정·영구 진행 저장 · 오늘의 동네 · 출석 · 도감
// 저장 규칙 (localStorage = 오프라인 캐시, 로그인하면 서버 /api/smash-rank?action=load|save 와 합침):
//   최고 기록·누적 집값·쓴 돈 = 큰 값 / 무기 레벨 = 무기마다 큰 값 / 장착 칸 = 더 최근에 바꾼 쪽
//   캠페인 = 깬 단계 큰 값, 총수 격파는 한쪽이라도 깼으면 깸 / 지도·오늘의 동네 최고 = 큰 값
//   도감 = 합집합(처음 등록 시각은 이른 쪽) / 출석 = 마지막 출석일이 늦은 쪽(같으면 연속 일수 큰 쪽)
//   보상(잔고 보너스·현무·돔) = 받은 보상마다 고유 번호(att날짜-n) → 합집합이라 두 번 더하지 않음, 쓴 보상도 번호로 합집합
import { on } from './bus.js';
import { flagSvg } from './war.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API = '/api/smash-rank';
const K = { best: 'seohyeon-smash-best', total: 'seohyeon-smash-total', nick: 'seohyeon-smash-nick', ark: 'seohyeon-smash-ark', camp: 'smash-camp-v1', meta: 'smash-meta-v1', acct: 'smash-acct-v1' };
const DAY = 86400000, KST = 9 * 3600e3;

// ---------- 날짜 (한국 시간)
export const kstDay = (t = Date.now()) => Math.floor((t + KST) / DAY);
export const dayStr = (n) => new Date(n * DAY).toISOString().slice(0, 10).replace(/-/g, '');
export const kstDate = (t = Date.now()) => dayStr(kstDay(t));
export const msToMidnight = (t = Date.now()) => DAY - ((t + KST) % DAY);
// 오늘의 동네: 서현역 + 사업장 지도를 날짜로 돌림 (모두 같은 지도)
export function dailyMap(ids, day = kstDay()) {
  const order = ['seohyeon', ...ids.filter((i) => i !== 'seohyeon')];
  return order[((day % order.length) + order.length) % order.length];
}
// 날짜로 정해지는 난수 (오늘의 미션이 모두 같게)
export function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- 저장소
function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function wr(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }
function rm(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } }
function rj(k) { try { return JSON.parse(rd(k) || 'null'); } catch (e) { return null; } }
function normMeta(m) {
  m = m && typeof m === 'object' ? m : {};
  const o = { bests: {}, col: {}, att: { last: '', streak: 0 }, gifts: { g: {}, u: [] }, ts: +m.ts || 0 };
  if (m.bests) for (const k in m.bests) if (+m.bests[k] > 0) o.bests[k] = Math.round(+m.bests[k]);
  if (m.col) for (const k in m.col) o.col[k] = +m.col[k] || 1;
  if (m.att && typeof m.att.last === 'string') o.att = { last: m.att.last.slice(0, 8), streak: Math.max(0, +m.att.streak || 0) };
  const g = (m.gifts && m.gifts.g) || {}, used = new Set((m.gifts && m.gifts.u) || []);
  const today = kstDay();
  for (const id in g) {
    const x = g[id]; if (!x || !x.t) continue;
    const d = /^\d{8}$/.test(x.d) ? Math.floor(Date.UTC(+x.d.slice(0, 4), +x.d.slice(4, 6) - 1, +x.d.slice(6, 8)) / DAY) : today;
    if (x.t !== 'won' && today - d > 30) { used.delete(id); continue; }      // 아이템 보상은 30일 안에 쓰기
    o.gifts.g[id] = { t: x.t, n: +x.n || 1, d: x.d };
  }
  o.gifts.u = [...used].filter((id) => o.gifts.g[id]);
  return o;
}
let M = normMeta(rj(K.meta));
function persist() { wr(K.meta, JSON.stringify(M)); }
function touch() { M.ts = Date.now(); persist(); }

function snapshot() {
  return { v: 1, best: Math.round(+rd(K.best) || 0), total: Math.round(+rd(K.total) || 0), ark: rj(K.ark) || {}, camp: rj(K.camp) || {}, meta: M, ts: M.ts || 0 };
}
export function merge(a, b) {
  if (!b || typeof b !== 'object') return a;
  const A = a.ark || {}, B = b.ark || {};
  const lv = {};
  for (const src of [A.lv || {}, B.lv || {}]) for (const k in src) lv[k] = Math.max(lv[k] || 0, Math.min(3, +src[k] || 0));
  const newer = (+b.ts || 0) > (+a.ts || 0) ? B : A, older = newer === A ? B : A;
  const okEq = (e) => Array.isArray(e) && e.length === 4;
  const ark = { lv, spent: Math.max(+A.spent || 0, +B.spent || 0) };
  if (okEq(newer.equip)) ark.equip = newer.equip; else if (okEq(older.equip)) ark.equip = older.equip;
  const ca = a.camp || {}, cb = b.camp || {};
  const camp = { cleared: Math.max(+ca.cleared || 0, +cb.cleared || 0), boss: !!(ca.boss || cb.boss) };
  const ma = normMeta(a.meta), mb = normMeta(b.meta);
  const meta = normMeta({});
  for (const m of [ma, mb]) {
    for (const k in m.bests) meta.bests[k] = Math.max(meta.bests[k] || 0, m.bests[k]);
    for (const k in m.col) meta.col[k] = meta.col[k] ? Math.min(meta.col[k], m.col[k]) : m.col[k];
    for (const k in m.gifts.g) if (!meta.gifts.g[k]) meta.gifts.g[k] = m.gifts.g[k];
  }
  meta.gifts.u = [...new Set([...ma.gifts.u, ...mb.gifts.u])].filter((id) => meta.gifts.g[id]);
  meta.att = ma.att.last > mb.att.last ? ma.att : mb.att.last > ma.att.last ? mb.att : (ma.att.streak >= mb.att.streak ? ma.att : mb.att);
  meta.ts = Math.max(ma.ts, mb.ts);
  return { v: 1, best: Math.max(+a.best || 0, +b.best || 0), total: Math.max(+a.total || 0, +b.total || 0), ark, camp, meta, ts: meta.ts };
}
function apply(d) {
  wr(K.best, String(Math.round(d.best || 0))); wr(K.total, String(Math.round(d.total || 0)));
  const ark = Object.assign({}, rj(K.ark) || {}, d.ark || {}); wr(K.ark, JSON.stringify(ark));
  wr(K.camp, JSON.stringify(Object.assign({}, rj(K.camp) || {}, d.camp || {})));
  M = normMeta(d.meta); persist();
  try { A && A.reload && A.reload(); } catch (e) { console.warn('reload', e); }
  renderStart();
}

// ---------- 서버
let acct = rj(K.acct);   // { nick, pin }
let saveT = 0, dirty = false, saving = false, acctErr = '';
async function api(action, body) {
  const r = await fetch(`${API}?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) {
    const msg = d.error || (r.status === 423 ? '비밀번호를 여러 번 틀려서 10분 동안 잠겼어요' : r.status === 403 ? '이미 있는 닉네임이에요. 비밀번호가 달라요' : '서버에 연결하지 못했어요');
    const e = new Error(msg); e.status = r.status; throw e;
  }
  return d;
}
export const loggedIn = () => !!(acct && acct.nick && acct.pin);
export const account = () => (loggedIn() ? { nick: acct.nick, pin: acct.pin } : null);
async function login(nick, pin, quiet) {
  const d = await api('load', { nickname: nick, pin });
  const merged = d.data ? merge(snapshot(), d.data) : snapshot();
  acct = { nick, pin }; wr(K.acct, JSON.stringify(acct)); wr(K.nick, nick); acctErr = '';
  apply(merged);
  await doSave();
  if (!quiet) tag(d.created ? '새 닉네임을 만들었어요 ✓' : d.data ? '기록을 불러와 합쳤어요 ✓' : '저장됨 ✓');
  return d;
}
function logout() { acct = null; rm(K.acct); renderStart(); }
export function scheduleSave(ms = 1500) {
  dirty = true;
  if (!loggedIn()) return;
  clearTimeout(saveT); saveT = setTimeout(doSave, ms);
}
async function doSave() {
  if (!loggedIn() || saving) return;
  saving = true; clearTimeout(saveT);
  try {
    let data = snapshot();
    if (JSON.stringify(data).length > 29000) {   // 30KB 넘지 않게: 오래된 쓴 보상부터 덜어냄
      const used = new Set(data.meta.gifts.u);
      for (const id of Object.keys(data.meta.gifts.g)) if (used.has(id) && data.meta.gifts.g[id].t !== 'won') { delete data.meta.gifts.g[id]; used.delete(id); }
      data.meta.gifts.u = [...used];
    }
    await api('save', { nickname: acct.nick, pin: acct.pin, data });
    dirty = false; acctErr = ''; tag('저장됨 ✓');
  } catch (e) {
    acctErr = e.message || '저장 실패'; tag('저장 못 함 · 다음에 다시', true);
    if (e.status === 403 || e.status === 423) renderStart();
  } finally { saving = false; }
}
let tagT = 0;
function tag(t, bad) {
  const el = $('saveTag'); if (!el) return;
  el.textContent = t; el.classList.toggle('bad', !!bad); el.classList.add('on');
  clearTimeout(tagT); tagT = setTimeout(() => el.classList.remove('on'), 1800);
  const ap = $('acctPill'); if (ap && loggedIn()) ap.dataset.st = bad ? '⚠' : '✓';
}

// ---------- 보상 (출석)
const ATT = [
  { g: [{ t: 'won', n: 1e12 }], ic: '💰', tx: '+1조' },
  { g: [{ t: 'won', n: 2e11 }], ic: '💰', tx: '+2천억' },
  { g: [{ t: 'hyunmoo', n: 1 }], ic: '🚀', tx: '현무 1발' },
  { g: [{ t: 'won', n: 3e11 }], ic: '💰', tx: '+3천억' },
  { g: [{ t: 'dome', n: 1 }], ic: '🔰', tx: '철벽 돔' },
  { g: [{ t: 'won', n: 5e11 }], ic: '💰', tx: '+5천억' },
  { g: [{ t: 'won', n: 3e12 }, { t: 'hyunmoo', n: 1 }, { t: 'dome', n: 1 }], ic: '🎁', tx: '+3조·현무·돔' },
];
export function bonus() { let s = 0; for (const id in M.gifts.g) { const x = M.gifts.g[id]; if (x.t === 'won') s += x.n; } return s; }
export function giftCount(t) { const u = new Set(M.gifts.u); let n = 0; for (const id in M.gifts.g) if (M.gifts.g[id].t === t && !u.has(id)) n += 1; return n; }
export function useGift(t) {
  const u = new Set(M.gifts.u);
  const id = Object.keys(M.gifts.g).filter((k) => M.gifts.g[k].t === t && !u.has(k)).sort((a, b) => (M.gifts.g[a].d || '').localeCompare(M.gifts.g[b].d || ''))[0];
  if (!id) return false;
  M.gifts.u.push(id); touch(); scheduleSave(2500);
  return true;
}
const canClaim = () => M.att.last !== kstDate();
function attState() {   // 오늘 받으면 몇째 날인지
  const today = kstDay(), y = dayStr(today - 1);
  if (M.att.last === kstDate()) return { streak: M.att.streak, claimed: true };
  return { streak: M.att.last === y ? M.att.streak + 1 : 1, claimed: false };
}
export function claim() {
  if (!canClaim()) return null;
  const today = kstDate(), st = attState();
  const r = ATT[(st.streak - 1) % 7];
  r.g.forEach((x, i) => { M.gifts.g[`att${today}-${i}`] = { t: x.t, n: x.n, d: today }; });
  M.att = { last: today, streak: st.streak };
  touch(); scheduleSave(300);
  if (st.streak >= 7) collect('a:streak7');
  try { A && A.reload && A.reload(); } catch (e) { /* 무시 */ }
  renderStart();
  return r;
}

// ---------- 도감
let CAT = [];
const CATS = ['랜드마크', '사업장', '반도체 팹', '회사', '참전국', '인물', 'K-무기', '업적'];
const COS = [['005930', '삼성전자'], ['006400', '삼성SDI'], ['009150', '삼성전기'], ['032830', '삼성생명'], ['000810', '삼성화재'], ['006840', 'AK홀딩스'], ['086790', '하나금융지주'],
  ['105560', 'KB금융'], ['055550', '신한지주'], ['316140', '우리금융지주'], ['024110', '기업은행'], ['007070', 'GS리테일'], ['282330', 'BGF리테일'], ['004990', '롯데지주'],
  ['139480', '이마트'], ['079160', 'CJ CGV'], ['036420', '콘텐트리중앙'], ['001040', 'CJ'], ['339770', '교촌에프앤비']];
function buildCat(maps, weapons) {
  const c = [];
  const L = (id, ic, nm, hint) => c.push({ id, cat: '랜드마크', ic, nm, hint });
  L('lm:ak', '🏬', 'AK PLAZA 분당점', '서현역 AK PLAZA 무너뜨리기'); L('lm:obelisk', '🏢', '분당오벨리스크', '서현역 오벨리스크 무너뜨리기');
  L('lm:post', '🏦', '삼성 거점 함락', '서현역 삼성 거점 하나 함락'); L('lm:hq', '👑', '총수 본사 함락', '거점 3곳 → 총수 본사 함락');
  L('lm:bridge', '🌉', '탄천 다리', '탄천 다리 끊기'); L('lm:sibum', '🏘️', '시범단지 아파트', '시범단지 아파트 무너뜨리기'); L('lm:tall', '🏙️', '20층 넘는 건물', '20층 이상 건물 무너뜨리기');
  for (const m of maps) c.push({ id: 'map:' + m.id, cat: '사업장', ic: m.id === 'seohyeon' ? '🚉' : '🏭', nm: m.short || m.id, hint: m.id === 'seohyeon' ? '첫 판 하기' : `${m.short}에서 한 판` });
  for (const m of maps) if (m.fab > 0) c.push({ id: 'fab:' + m.id, cat: '반도체 팹', ic: '🏭', nm: `${m.short} 팹`, hint: `${m.short} 반도체 팹 무너뜨리기` });
  for (const [code, nm] of COS) c.push({ id: 'co:' + code, cat: '회사', ic: '📉', nm, hint: `${nm} 매장 건물 부수기` });
  for (const [k, nm] of [['kp', '북한'], ['cn', '중국'], ['jp', '일본'], ['us', '미국']]) c.push({ id: 'war:' + k, cat: '참전국', flag: k, ic: '🏳️', nm: nm + ' 참전', hint: k === 'kp' || k === 'cn' ? '밀리면 우리 편으로 참전' : '너무 세면 방어군으로 참전' });
  for (const [k, ic, nm, h] of [['manager', '🧑‍💼', '지점장', '삼성 거점을 맞히기'], ['ceo', '👨‍💼', '사장님', '큰 거점·회사 건물 맞히기'], ['boss', '👑', '총수', '총수 본사 등장'], ['chair', '👴', '회장님', '대기업 주가 폭락시키기']])
    c.push({ id: 'p:' + k, cat: '인물', ic, nm: nm + ' (지어낸 인물)', hint: h });
  for (const w of weapons) c.push({ id: 'w:' + w.id, cat: 'K-무기', ic: w.chip || '★', nm: w.nm, hint: w.id === 'jeongjo' ? '장착하고 판에서 요격·타격' : w.kind === 'passive' ? '장착하고 판에서 쓰기' : '무기고에서 사서 써 보기' });
  for (const [k, ic, nm, h] of [['chain5', '🔗', '연쇄 ×5', '한 방에 연쇄 5번'], ['10jo', '💸', '한 판 10조', '한 판에 10조 넘기기'], ['home', '💥', '내 집 날림', '우리 집 정하고 날려 보기'],
    ['dome', '🔰', '철벽 돔 가동', '보복을 철벽 돔으로 막기'], ['daily', '📅', '오늘의 동네 도전', '오늘의 동네 한 판'], ['streak7', '🗓️', '7일 연속 출석', '7일 연속 출석']])
    c.push({ id: 'a:' + k, cat: '업적', ic, nm, hint: h });
  return c;
}
const toastQ = []; let toastT = 0;
export function collect(id) {
  if (!id || M.col[id]) return false;
  M.col[id] = Math.floor(Date.now() / 1000); touch(); scheduleSave(4000);
  const e = CAT.find((x) => x.id === id);
  if (e) { toastQ.push(e); if (!toastT) nextToast(); }
  const cb = $('colBtn'); if (cb) cb.innerHTML = colBtnHtml();
  return true;
}
function icHtml(e, big) { return e.flag ? flagSvg(e.flag, big ? 22 : 14) : esc(e.ic); }
function nextToast() {
  const el = $('colToast'), e = toastQ.shift();
  if (!el || !e) { toastT = 0; return; }
  el.innerHTML = `<b>📖 도감 등록!</b> <span class="ic">${icHtml(e)}</span> ${esc(e.nm)}`;
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  try { A && A.sfx && A.sfx.ding && A.sfx.ding(); } catch (er) { /* 무시 */ }
  toastT = setTimeout(nextToast, 1900);
}
const colN = () => CAT.filter((e) => M.col[e.id]).length;
const colBtnHtml = () => `📖 도감 <small>${colN()}/${CAT.length}</small>`;
function openCol() {
  const p = $('colPanel'); if (!p) return;
  const days = (ts) => { const d = new Date(ts * 1000 + KST); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  let h = `<div class="card colCard"><div class="kicker">📖 도감 <b>${colN()}</b> / ${CAT.length}</div><button class="x" id="colX" aria-label="닫기">✕</button><div class="colList">`;
  for (const cat of CATS) {
    const list = CAT.filter((e) => e.cat === cat); if (!list.length) continue;
    h += `<h4>${cat} <small>${list.filter((e) => M.col[e.id]).length}/${list.length}</small></h4><ul class="grid">`;
    for (const e of list) {
      const got = M.col[e.id];
      h += `<li class="${got ? 'got' : 'lock'}" title="${esc(e.hint)}"><span class="ic">${icHtml(e, true)}</span><b>${got ? esc(e.nm) : '???'}</b><small>${got ? days(got) : esc(e.hint)}</small></li>`;
    }
    h += '</ul>';
  }
  h += '</div><p class="note">처음 부수거나 만난 것만 등록돼요 · 인물은 모두 지어낸 만화 인물</p></div>';
  p.innerHTML = h; p.classList.remove('hidden');
  $('colX').onclick = (e) => { e.stopPropagation(); p.classList.add('hidden'); };
  p.onpointerdown = (e) => { e.stopPropagation(); if (e.target === p) p.classList.add('hidden'); };
}
export { openCol };

// ---------- 시작 화면
let A = null, dailyTop = null, dailyTimer = 0;
function hhmm(ms) { const m = Math.floor(ms / 60000); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function buildDom() {
  const d = document.createElement('div');
  d.innerHTML = `<div id="colToast"></div><div id="saveTag"></div><div id="colPanel" class="overlay hidden"></div>
  <div id="acctPanel" class="overlay hidden"><div class="card"><div class="kicker">👤 로그인 · 기록 저장</div>
    <p class="how small">순위 등록과 같은 <b>닉네임 + 비밀번호</b>예요. 처음 쓰는 닉네임이면 새로 만들어져요.<br>무기·캠페인·도감·출석이 폰과 PC에서 이어져요.</p>
    <div id="acctForm"><input id="acNick" maxlength="12" placeholder="닉네임 (12자까지)" autocomplete="username">
    <input id="acPin" type="password" maxlength="20" placeholder="비밀번호 (4자 이상)" autocomplete="current-password">
    <button id="acGo" class="big">로그인</button></div>
    <div id="acctIn" class="hidden"><p class="acWho"></p><button id="acSync" class="mid">지금 저장</button> <button id="acOut" class="mid ghost">로그아웃</button></div>
    <p class="note" id="acMsg">다른 곳에 쓰는 비밀번호는 쓰지 마세요. 로그인 안 해도 이 기기에는 저장돼요.</p>
    <button id="acX" class="big ghost">닫기</button></div></div>`;
  while (d.firstElementChild) document.body.appendChild(d.firstElementChild);
  for (const id of ['acctPanel']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
  $('acX').onclick = () => $('acctPanel').classList.add('hidden');
  $('acGo').onclick = async () => {
    const nick = $('acNick').value.trim().slice(0, 12), pin = $('acPin').value;
    if (!nick) { $('acMsg').textContent = '닉네임을 적어 주세요'; return; }
    if ([...pin].length < 4) { $('acMsg').textContent = '비밀번호를 4자 이상 적어 주세요'; return; }
    $('acGo').disabled = true; $('acMsg').textContent = '불러오는 중…';
    try { const r = await login(nick, pin); $('acMsg').textContent = r.created ? `「${nick}」 닉네임을 만들고 이 기기 기록을 저장했어요` : '기록을 불러와 이 기기 기록과 합쳤어요 ✓'; renderAcct(); setTimeout(() => $('acctPanel').classList.add('hidden'), 900); }
    catch (e) { $('acMsg').textContent = e.message; }
    finally { $('acGo').disabled = false; }
  };
  $('acOut').onclick = () => { logout(); renderAcct(); $('acMsg').textContent = '로그아웃했어요. 이 기기 기록은 그대로 있어요'; };
  $('acSync').onclick = async () => { await doSave(); $('acMsg').textContent = acctErr || '저장했어요 ✓'; };
  // 시작 카드
  const card = document.querySelector('#start .card'); if (!card) return;
  const pill = document.createElement('button'); pill.id = 'acctPill'; pill.className = 'acctPill';
  pill.onclick = (e) => { e.stopPropagation(); openAcct(); };
  card.prepend(pill);
  const box = document.createElement('div'); box.id = 'metaBox';
  box.innerHTML = '<div id="attBox" class="att"></div><div id="dailyCard" class="dly"></div>';
  const h1 = card.querySelector('h1'); h1.after(box);
  const hr = card.querySelector('.homeRow');
  if (hr) { const b = document.createElement('button'); b.id = 'colBtn'; b.className = 'mid'; b.onclick = (e) => { e.stopPropagation(); openCol(); }; hr.querySelector('#homeBtn').after(b); }
}
function openAcct() {
  renderAcct(); $('acctPanel').classList.remove('hidden');
  if (!loggedIn()) { $('acNick').value = rd(K.nick) || ''; setTimeout(() => (($('acNick').value ? $('acPin') : $('acNick')).focus()), 50); }
}
function renderAcct() {
  const inn = loggedIn();
  $('acctForm').classList.toggle('hidden', inn); $('acctIn').classList.toggle('hidden', !inn);
  const who = document.querySelector('#acctIn .acWho'); if (who) who.innerHTML = inn ? `<b>${esc(acct.nick)}</b> 으로 로그인됨${acctErr ? `<br><small class="err">${esc(acctErr)}</small>` : ''}` : '';
  renderPill();
}
function renderPill() {
  const p = $('acctPill'); if (!p) return;
  p.textContent = loggedIn() ? `👤 ${acct.nick} ${acctErr ? '⚠' : '✓'}` : '👤 로그인';
  p.classList.toggle('in', loggedIn());
}
function renderAtt() {
  const el = $('attBox'); if (!el) return;
  const st = attState(), cyc = ((st.streak - 1) % 7) + 1;
  const cells = ATT.map((r, i) => {
    const k = i + 1, cls = k < cyc || (k === cyc && st.claimed) ? 'done' : k === cyc ? 'today' : '';
    return `<i class="${cls}"><small>${k}일</small><span>${r.ic}</span><em>${r.tx}</em></i>`;
  }).join('');
  const inv = [giftCount('hyunmoo') ? `🚀 현무 ${giftCount('hyunmoo')}` : '', giftCount('dome') ? `🔰 돔 ${giftCount('dome')}` : '', bonus() ? `💰 잔고 +${A ? A.wonShort(bonus()) : bonus()}` : ''].filter(Boolean).join(' · ');
  el.innerHTML = `<div class="ah"><b>🗓️ 출석 <em>${st.claimed ? st.streak : Math.max(0, st.streak - 1)}</em>일 연속</b>${st.claimed ? '<span class="ok">오늘 받음 ✓</span>' : `<button id="attClaim">🎁 ${cyc}일째 보상 받기</button>`}</div>
    <div class="days">${cells}</div>${inv ? `<div class="ainv">보유: ${inv} <small>(무기고 잔고·판 시작 때 자동)</small></div>` : ''}`;
  const b = $('attClaim');
  if (b) b.onclick = (e) => { e.stopPropagation(); const r = claim(); if (r && A) { A.banner(`${r.ic} 출석 보상 ${r.tx}!`); try { A.sfx.init(); A.sfx.ding(); } catch (er) { /* 무시 */ } } };
}
function renderDaily() {
  const el = $('dailyCard'); if (!el || !A) return;
  const di = A.dailyInfo(); if (!di) { el.classList.add('hidden'); return; }
  const mine = M.bests['daily-' + di.date];
  const top = (dailyTop || []).slice(0, 5);
  const me = loggedIn() ? acct.nick : '';
  const rows = top.length ? top.map((r, i) => `<li class="${r.nickname === me ? 'me' : ''}"><i>${i + 1}</i><span>${esc(r.nickname)}</span><b>${A.wonShort(r.score)}</b></li>`).join('')
    : `<li class="none">${dailyTop ? '아직 아무도 없어요. 1등 해 보세요!' : '순위 불러오는 중…'}</li>`;
  el.innerHTML = `<div class="dh"><b>📅 오늘의 동네: ${esc(di.short)}</b><span id="dlLeft">남은 시간 ${hhmm(msToMidnight())}</span></div>
    <ol class="dtop">${rows}</ol>
    <div class="df"><small>모두 같은 미션 3개 · 최고 기록으로 순위${mine ? ` · 내 최고 <b>${A.wonShort(mine)}</b>` : ''}</small><button id="dailyGo">${di.here && A.isDaily() ? '선택됨 ✓' : '도전 ▶'}</button></div>`;
  $('dailyGo').onclick = (e) => { e.stopPropagation(); A.goDaily(); };
}
async function loadDailyTop() {
  if (!A) return;
  const di = A.dailyInfo(); if (!di) return;
  try { const r = await fetch(`${API}?game=daily-${di.date}&score=0`, { cache: 'no-store' }); if (!r.ok) throw 0; const d = await r.json(); dailyTop = d.top || []; }
  catch (e) { dailyTop = dailyTop || []; }
  renderDaily();
}
export function renderStart() {
  renderPill(); renderAtt(); renderDaily();
  const cb = $('colBtn'); if (cb) cb.innerHTML = colBtnHtml();
}

// ---------- 판 결과
export function roundEnd({ gameId, price, daily }) {
  if (price > 0) M.bests[gameId] = Math.max(M.bests[gameId] || 0, Math.round(price));
  if (price >= 1e13) collect('a:10jo');
  if (daily) collect('a:daily');
  touch(); scheduleSave(400);
  if (daily) setTimeout(loadDailyTop, 1500);
  renderStart();
}

// ---------- 시작
export function init(api) {
  A = api;
  CAT = buildCat(api.maps || [], api.weapons || []);
  buildDom();
  on('collect', collect);
  on('save', () => { touch(); scheduleSave(); });
  on('gift-used', (t) => { useGift(t); renderAtt(); });
  renderStart();
  loadDailyTop();
  clearInterval(dailyTimer);
  dailyTimer = setInterval(() => { const e = $('dlLeft'); if (e) e.textContent = `남은 시간 ${hhmm(msToMidnight())}`; }, 20000);
  if (loggedIn()) login(acct.nick, acct.pin, true).catch((e) => { acctErr = e.message; renderStart(); });
  window.__meta = { M: () => M, merge, snapshot, claim, collect, bonus, giftCount, useGift, loggedIn, kstDate, seeded, dailyMap, CAT: () => CAT, openCol, login, logout, doSave };
}
