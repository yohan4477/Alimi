import {rememberMarket} from './market-preference.js';
import {rememberLanguage} from './language-preference.js';
import {region, regionURL, languageURL} from './region.js';
import {t, lang} from './i18n.js';
export const regionButton = () => `<button class="service-region-button" data-service-region aria-label="${t('region.open')}">${t('region.' + region)} ▾</button>`;
export function installRegionPicker() {
  const dialog = document.createElement('dialog'); dialog.id = 'service-region-picker';
  dialog.innerHTML = `<form method="dialog"><button class="close-dialog" aria-label="${t('close')}">×</button></form><h2>${t('region.title')}</h2><p>${t('region.hint')}</p><div class="service-choices">${['kr','us'].map(r=>`<button data-select-region="${r}" aria-pressed="${r===region}">${t('region.'+r)}</button>`).join('')}</div><h3>${t('settings.language')}</h3><div class="service-choices">${['ko','en'].map(l=>`<button data-select-language="${l}" aria-pressed="${l===lang}">${l==='ko'?'한국어':'English'}</button>`).join('')}</div><p>${t('region.languageHint')}</p>`;
  document.body.append(dialog);
  document.addEventListener('click', e => {
    if(e.target.closest('[data-service-region]')) dialog.showModal();
    const r=e.target.closest('[data-select-region]')?.dataset.selectRegion;
    const l=e.target.closest('[data-select-language]')?.dataset.selectLanguage;
    if(r){rememberMarket(r);if(r!==region)location.href=regionURL(r).href;}
    if(l){rememberLanguage(l);location.href=languageURL(l).href;}
  });
}
