const KEY = 'seoulbeauty-setup-snoozed-until';
export function shouldSuggestSetup(interests, storage, now = Date.now()) {
  if (interests?.done) return false;
  try { return !(Number(storage?.getItem(KEY)) > now); } catch { return true; }
}
export function snoozeSetup(storage, now = Date.now()) {
  try { storage?.setItem(KEY, String(now + 86400000)); } catch {}
}
