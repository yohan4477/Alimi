import {compatibilityTarget} from './public-routes.js';
import {resolveVisitorContext} from './language-preference.js';
const target=compatibilityTarget(location.href);
// Keep callback/hash material on the same origin. Never log it or send it to sample modules.
if(target)location.replace(target.href);
else {
 const {language}=await resolveVisitorContext();
 document.documentElement.lang=language;
 import('./sample-app.js').catch(()=>{
  document.querySelector('#sample-failure').textContent=language==='ko'?'가상 대화 미리보기를 불러오지 못했어요. 새로고침해 주세요.':'Could not load the fictional conversation preview. Please reload.';
  document.documentElement.setAttribute('data-sample-failed','');
  document.documentElement.removeAttribute('data-locale-pending');
 });
}
