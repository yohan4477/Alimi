// Preserve the list's viewport and keyboard origin across product detail. No saved-price flow.
export function captureDetailReturn(view, origin = view.document?.activeElement) {
  return {x: view.scrollX || 0, y: view.scrollY || 0, origin,
    identity: origin ? {id: origin.id, dataset: {...origin.dataset}} : null};
}
export function restoreDetailReturn(state, root, view) {
  if (!state || !root) return;
  let target = root.contains(state.origin) ? state.origin : null;
  if (!target && state.identity) {
    const {id, dataset} = state.identity;
    const keys = Object.keys(dataset).filter(k => ['product', 'catalogOpen', 'chatProduct'].includes(k));
    target = [...root.querySelectorAll('button')].find(b =>
      (id && b.id === id) || (keys.length && keys.every(k => b.dataset[k] === dataset[k])));
  }
  // The item may have been removed from saved products while its detail was open.
  target ??= root.querySelector('button, input, [tabindex="0"]');
  target?.focus({preventScroll: true});
  view.scrollTo(state.x, state.y);
}
