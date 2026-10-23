// Shared UI language: explicit link, manual preference, then server country/browser fallback.
import strings from './strings.json' with {type: 'json'};
import {initialLanguage,resolveVisitorLanguage,browserLanguage} from './language-preference.js';

// Await before importing consumers render. Node fixtures do not make network requests.
export let lang = typeof window !== 'undefined' && typeof document !== 'undefined'
  ? await resolveVisitorLanguage()
  : initialLanguage() || browserLanguage(globalThis.navigator?.language);
export const setLang = l => { lang = l === 'ko' ? 'ko' : 'en'; };
export const locale = () => (lang === 'ko' ? 'ko-KR' : 'en-US');

export function t(key, vars = {}) {
  const entry = strings[key];
  const text = entry ? entry[lang] ?? entry.en : key;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
export const categoryLabel = c => (strings['category.' + c] ? t('category.' + c) : c);
