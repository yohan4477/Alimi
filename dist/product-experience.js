// Product-specific, non-blocking experience discovery. No inferred skin attributes.
// This prototype keeps answers only on the current device; it does not publish reviews.
import {esc} from './util.js';
const memory = new Map();
const statuses = [{id:'before',label:'아직 안 써봤어요'},{id:'current',label:'사용 중이에요'},{id:'past',label:'써봤어요'}];
const topics = {
 before:['피부에 잘 맞을지','효과가 있을지','사용감','가격·다른 제품 비교'],
 current:['보습·효과','발림성·사용감','자극·트러블','가격 대비 만족'],
 past:['좋았던 점','아쉬웠던 점','재구매·대체 제품','피부 적합성']
};
const key=id=>'sb-experience-v1:'+id;
function read(id){
 if(memory.has(id))return memory.get(id);
 let value={};
 try {value=JSON.parse(localStorage.getItem(key(id))||'{}')||{}}catch{}
 memory.set(id,value);return value;
}
function persist(id,value){
 memory.set(id,value);
 try{localStorage.setItem(key(id),JSON.stringify(value))}catch{}
}
function choice(attr,value,label,active){
 return `<button type="button" class="experience-choice ${active?'selected':''}" ${attr}="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
}
export function preferredExperienceReviews(reviews,id,profile){
 const selected=read(id),skin=profile?.skin_type;
 if(!skin)return reviews;
 // Only sort actual self-reported skin-type matches, never fabricate a match.
 return [...reviews].sort((a,b)=>Number(b.skin_type===skin)-Number(a.skin_type===skin));
}
export function experienceMarkup(id,reviewCount,profile){
 const selected=read(id),status=selected.status,topic=selected.topic;
 const skin=profile?.skin_type;
 return `<section class="experience-discovery" aria-label="제품 경험 탐색">
   <div class="experience-head"><strong>나와 비슷한 사람들은 어땠을까?</strong><small>선택 없이도 후기를 볼 수 있어요</small></div>
   <p class="experience-description">${reviewCount ? `현재 등록된 실제 후기 ${reviewCount}개를 살펴보세요.` : '아직 등록된 후기가 없어요. 첫 경험을 나눠주세요.'}</p>
   <p class="experience-prompt">이 제품 사용해 보셨나요?</p>
   <div class="experience-options" role="group" aria-label="사용 여부">
     ${statuses.map(s=>choice('data-experience-status',s.id,s.label,status===s.id)).join('')}
   </div>
   ${status?`<div class="experience-followup"><p class="experience-prompt">${status==='before'?'어떤 점이 궁금하세요?':'어떤 경험이 궁금하세요?'}</p>
   <div class="experience-options" role="group" aria-label="궁금한 점">
   ${topics[status].map(t=>choice('data-experience-topic',t,t,topic===t)).join('')}</div></div>`:''}
   ${topic?`<p class="experience-result" role="status">${skin?'기존 피부 프로필과 ':'선택한 관심사를 기준으로 '}실제 후기를 확인해 보세요. ${!reviewCount?'아직 매칭 가능한 후기가 없습니다.':''}</p>`:''}
   <p class="experience-note">응답은 이 기기에만 저장되며, 다른 사람에게 공개되지 않아요. 기존 후기 열람과 채팅은 제한하지 않습니다.</p>
 </section>`;
}
export function installExperienceChoices(box,id,redraw){
 if(box.experienceInstalledFor===id)return;
 if(box.experienceClickHandler)box.removeEventListener('click',box.experienceClickHandler);
 box.experienceInstalledFor=id;
 box.experienceClickHandler=e=>{
  const control=e.target.closest('[data-experience-status],[data-experience-topic]');
  if(!control||!box.contains(control))return;
  const current=read(id);
  if(control.dataset.experienceStatus){
   current.status=control.dataset.experienceStatus;
   current.topic='';
  }else if(current.status){
   current.topic=control.dataset.experienceTopic;
  }
  persist(id,current);redraw();
 };
 box.addEventListener('click',box.experienceClickHandler);
}
