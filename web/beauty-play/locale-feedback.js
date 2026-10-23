// Format the complete label so React does not split a number from its unit.
export const responseCount = (count, language) => language === 'en' ? `${count} responses` : `${count}건`;
export const itemCount = (count, language) => language === 'en' ? `${count} items` : `${count}개`;
// Keep an app-owned message key in state, rather than exposing a server/browser error.
export const SAVE_ERROR = '선택을 저장하지 못했어요. 다시 시도해 주세요.';
export function gameEntryUrl(character, language, search = '') {
  const params = new URLSearchParams({pilot: '1', character, lang: language === 'en' ? 'en' : 'ko'});
  if (new URLSearchParams(search).get('test') === '1') params.set('test', '1');
  return '/beauty-play/?' + params.toString();
}
