// UI text lookup shared with iOS (strings.json). Explicit link language overrides
// saved manual preference, then trusted country/browser fallback. Links are not saved.
import strings from './strings.json' with {type: 'json'};
import {initialLanguage,resolveVisitorLanguage,browserLanguage,currentVisitorContext,rememberLanguage} from './language-preference.js';
export let lang = initialLanguage() || currentVisitorContext()?.language || (typeof window !== 'undefined' && typeof document !== 'undefined' ? await resolveVisitorLanguage() : browserLanguage(globalThis.navigator?.language));
export const setLang = l => { lang = l === 'ko' ? 'ko' : 'en'; };
export const locale = () => (lang === 'ko' ? 'ko-KR' : 'en-US');

export function t(key, vars = {}) {
  const entry = strings[key];
  const text = entry ? entry[lang] ?? entry.en : key;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
export const categoryLabel = c => (strings['category.' + c] ? t('category.' + c) : c);
