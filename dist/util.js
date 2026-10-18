// DOM helpers shared by the web screens.
export const $ = s => document.querySelector(s);
// HTML-escape any value before it goes into a template string.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
