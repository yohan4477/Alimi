// Do not display a full-screen artwork overlay during community navigation.
// Preserve the API used by chat.js; native/web initial launch assets are separate.
export function beginStartupLoading() {
  return () => {};
}
