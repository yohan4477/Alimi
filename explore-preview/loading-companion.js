// Lightweight inline loading status for navigation and data requests.
// Brand imagery belongs to the initial app launch, not intermediate screens.
import {esc} from './util.js';

export const loadingMarkup = label => `<div class="sb-loading-status" role="status" aria-live="polite"><span class="sb-loading-label"><span class="sb-loading-spinner" aria-hidden="true"></span>${esc(label)}</span></div>`;
