// Applies only to explicitly synthetic content, never to real community messages.
export function isDemoArtifact(body) {
  const text = String(body ?? '');
  if (/\[(?:가상\s*(?:긴\s*글|UX)|QA|테스트)|(?:UX|UI|QA)\s*(?:검증|테스트)|lorem ipsum|테스트 메시지/i.test(text)) return true;
  const units = text.split(/\n+|(?<=[.!?。])\s+/).map(s => s.trim()).filter(s => s.length >= 15);
  const counts = new Map();
  return units.some(s => { const n = (counts.get(s) ?? 0) + 1; counts.set(s, n); return n >= 3; });
}

export function cleanDemoMessages(messages) {
  const removed = new Set(messages.filter(m => m?.demo === true && isDemoArtifact(m.body)).map(m => m.id));
  return messages.filter(m => !removed.has(m?.id)).map(m => removed.has(m?.reply_to) ? {...m, reply_to: null} : m);
}
