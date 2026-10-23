// Only a known presentation tab may survive login. No return URL or credentials are read.
const adminTabIds = new Set(['sb-dashboard', 'sb-users', 'sb-community', 'sb-products', 'sb-game', 'sb-revenue', 'sb-system', 'sb-ui-library', 'sb-quality', 'sb-dev', 'sb-roadmap', 'sb-strategy', 'sb-plan', 'sb-design']);
const loginForm = document.querySelector('form[action="/api/admin?action=login"]');
function preserveAdminTab() {
  if (!loginForm) return;
  const tab = location.hash.slice(1);
  loginForm.action = '/api/admin?action=login' + (adminTabIds.has(tab) ? '&tab=' + encodeURIComponent(tab) + '#' + tab : '');
}
preserveAdminTab();
addEventListener('hashchange', preserveAdminTab);
