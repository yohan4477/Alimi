// UI text lookup shared with iOS (strings.json). Korean when the browser language is Korean, English
// otherwise. `?lang=ko|en` overrides and is remembered, so the Korean operator can check either language.
import strings from './strings.json' with {type: 'json'};

function detect() {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('lang');
    if (q === 'ko' || q === 'en') { globalThis.localStorage?.setItem('alimi-lang', q); return q; }
    const saved = globalThis.localStorage?.getItem('alimi-lang');
    if (saved === 'ko' || saved === 'en') return saved;
  } catch {}
  return String(globalThis.navigator?.language ?? 'en').toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export let lang = detect();
export const setLang = l => { lang = l === 'ko' ? 'ko' : 'en'; };
export const locale = () => (lang === 'ko' ? 'ko-KR' : 'en-US');

export function t(key, vars = {}) {
  const entry = strings[key];
  const text = entry ? entry[lang] ?? entry.en : key;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
export const categoryLabel = c => (strings['category.' + c] ? t('category.' + c) : c);
