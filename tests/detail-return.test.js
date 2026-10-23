import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureDetailReturn, restoreDetailReturn} from '../dist/detail-return.js';
function button(dataset) { return {dataset, focus(options) { this.focusOptions = options; }}; }
test('returns to the original product and scroll position without scrolling focus', () => {
  const origin = button({product: 'sku"unsafe'}), view = {scrollX: 0, scrollY: 840, scrollTo(...args) { this.scrolled = args; }};
  const state = captureDetailReturn(view, origin);
  const replacement = button({...origin.dataset});
  restoreDetailReturn(state, {contains: () => false, querySelectorAll: () => [replacement], querySelector: () => null}, view);
  assert.deepEqual(replacement.focusOptions, {preventScroll: true});
  assert.deepEqual(view.scrolled, [0, 840]);
});
test('preserves catalog origins and safely falls back when a saved item is removed', () => {
  const origin = button({catalogOpen: '쿠팡|KR|sku'}), fallback = button({}), view = {scrollTo() {}};
  const state = captureDetailReturn(view, origin);
  restoreDetailReturn(state, {contains: x => x === origin, querySelector: () => fallback}, view);
  assert.ok(origin.focusOptions);
  restoreDetailReturn(state, {contains: () => false, querySelectorAll: () => [], querySelector: () => fallback}, view);
  assert.ok(fallback.focusOptions);
});
test('detail back preserves the loaded search instead of refetching and replacing its origin', async () => {
  const app = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  assert.match(app, /show\(detailReturn,\{preserveSearch:true\}\)/);
  assert.match(app, /if\(n==='search'&&!preserveSearch\)renderSearch\(\)/);
  assert.match(app, /if\(screen!=='detail'\)\{detailOrigin=captureDetailReturn/);
  assert.match(app, /openDetail\(b\.dataset\.product,b\)/);
  assert.match(app, /root.querySelectorAll\('\[data-favorite\]'\).*state.favorites.includes/);
});
