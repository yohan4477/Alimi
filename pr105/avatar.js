// Cosmetic, per-device settings only. Never infer demographic or skin attributes from this choice.
import {t} from './i18n.js';
import {esc} from './util.js';
export const AVATARS = [1,2,3,4,5];
// Kept only so choices saved by the first pilot (with a ring colour) still load; the ring is no longer shown.
export const COLORS = ['#eaf3ff','#eeeaff','#ffede5','#e7f4ee','#f3f4f6'];
const KEY = 'seoulbeauty-avatar-v1';
let memory = null;
export function readAvatar(storage) {
  try { const p = JSON.parse(storage?.getItem(KEY)); return normalize(p); } catch { return memory; }
}
export function normalize(p) {
  if (!p || p.version !== 1 || ![null,...AVATARS].includes(p.id) || !COLORS.includes(p.color)) return null;
  return {version:1,id:p.id,color:p.color};
}
function deviceStorage(){try{return globalThis.localStorage}catch{return undefined}}
export function avatarMarkup(p = readAvatar(deviceStorage()), extra = '') {
  const safe = normalize(p);
  return `<span class="sb-avatar${safe?.id ? ' has-photo' : ''} ${esc(extra)}">${safe?.id ? `<img src="avatars/avatar-${safe.id}.webp" alt="" width="256" height="256">` : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>'}</span>`;
}
export function profileButton() {return `<button class="avatar-profile" data-avatar-edit>${avatarMarkup()}<span><b>${esc(t('avatar.profile'))}</b><small>${esc(t('avatar.local'))}</small></span><span aria-hidden="true">›</span></button>`}
let pending = null;
export function chooseAvatar({onboarding = false} = {}) {
  if (pending) return pending;
  const storage = deviceStorage(), current = readAvatar(storage);
  if (onboarding && current) return Promise.resolve();
  pending = new Promise(resolve => {
    let draft = current || {version:1,id:null,color:COLORS[0]};
    const dlg = document.createElement('dialog'); dlg.className='avatar-dialog';
    dlg.setAttribute('aria-labelledby','avatar-title');document.body.append(dlg);
    function render() {
      dlg.innerHTML=`<button type="button" class="avatar-close" data-avatar-close aria-label="${esc(t('close'))}">×</button><small class="avatar-brand">SeoulBeauty</small><h2 id="avatar-title">${esc(t('avatar.title'))}</h2><p>${esc(t('avatar.subtitle'))}</p><div class="avatar-preview">${avatarMarkup(draft)}</div><h3>${esc(t('avatar.character'))}</h3><div class="avatar-options" role="group" aria-label="${esc(t('avatar.character'))}">${AVATARS.map(id=>`<button type="button" data-avatar-id="${id}" aria-label="${esc(t('avatar.option',{n:id}))}" aria-pressed="${draft.id===id}">${avatarMarkup({...draft,id})}${draft.id===id?'<i aria-hidden="true">✓</i>':''}</button>`).join('')}</div><p class="avatar-note">${esc(t('avatar.note'))}</p><p class="avatar-local">${esc(t('avatar.local'))}</p><p id="avatar-error" role="status"></p><button class="avatar-save" data-avatar-save ${draft.id===null?'disabled':''}>${esc(t('avatar.save'))}</button><button class="avatar-skip" data-avatar-skip>${esc(t(onboarding?'avatar.skip':'cancel'))}</button>`;
    }
    function finish(value) {
      if(value){
        memory=value;
        try{if(!storage)throw Error();storage.setItem(KEY,JSON.stringify(value));}
        catch{dlg.querySelector('#avatar-error').textContent=t('avatar.failed');return;}
        document.dispatchEvent(new CustomEvent('avatar-change'));
      }
      dlg.close();dlg.remove();pending=null;resolve();
    }
    dlg.addEventListener('cancel',e=>{e.preventDefault();finish(null)});
    dlg.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-avatar-id')){draft={...draft,id:Number(b.dataset.avatarId)};render();dlg.querySelector(`[data-avatar-id="${draft.id}"]`).focus();}
      else if(b.hasAttribute('data-avatar-save')&&draft.id!==null)finish(draft);
      else if(b.hasAttribute('data-avatar-skip'))finish(onboarding?{version:1,id:null,color:COLORS[0]}:null);
      else if(b.hasAttribute('data-avatar-close'))finish(null);
    });
    render();dlg.showModal();
  });
  return pending;
}
document.addEventListener('click',e=>{if(e.target.closest('[data-avatar-edit]'))chooseAvatar()});
