import {OPTIONS,label,roomProducts,aggregateExperiences,createExperienceStore,normalizeExperience} from './room-experiences.js';
import {fetchExperiences,saveExperience,deleteExperience} from './room-experience-api.js';
import {esc} from './util.js';
import {locale} from './i18n.js';

// Isolated controller: never rerenders the composer or injects questions into the chat stream.
export function mountRoomExperiences(host,{room,messages,author,secret,storage,seed=[],blocked=[],toast=()=>{},onChange=()=>{}}) {
  const ko=locale().startsWith('ko'), text=(k,e)=>ko?k:e, store=createExperienceStore(storage);
  let products=roomProducts(room,messages);
  const skipKey=`sb-experience-skip:${room.demo?'offline':'online'}:${room.id}`;
  let rows=[],loading=!room.demo,failed=false,expanded=false,editing=false,busy=false,error='',selected=products[0]?.key??'',draft={},skipped=false;
  try{skipped=storage?.getItem(skipKey)==='1';}catch{}
  const active=()=>host.isConnected;
  const mine=()=>rows.find(r=>r.author_tag===author&&r.product_key===selected);
  const skip=()=>{skipped=true;try{storage?.setItem(skipKey,'1');}catch{}};
  const latestRows=list=>{const unique=new Map();for(const r of list){const key=JSON.stringify([r.author_tag,r.product_key]);const old=unique.get(key);if(!old||String(old.updated_at)<=String(r.updated_at))unique.set(key,r);}return [...unique.values()];};
  const count=(n)=>ko?`${n}명`:`${n} people`;
  const counts=(field,obj)=>Object.entries(obj).map(([key,n])=>`${label(field,key,ko)} ${count(n)}`).join(' · ');
  const button=(action,title,extra='')=>`<button type="button" data-exp-action="${action}" ${extra}>${esc(title)}</button>`;
  function choices(field,title,multiple=false){
    return `<fieldset><legend>${esc(title)}</legend><div class="experience-choices">${Object.keys(OPTIONS[field]).map(value=>{const on=multiple?(draft[field]??[]).includes(value):draft[field]===value;return `<button type="button" data-exp-field="${field}" data-exp-value="${value}" aria-pressed="${on}">${esc(label(field,value,ko))}</button>`;}).join('')}</div></fieldset>`;
  }
  function form(){
    return `<div class="experience-editor"><label>${text('제품','Product')}<select data-exp-product aria-label="${text('경험을 나눌 제품','Product for your experience')}">${products.map(p=>`<option value="${esc(p.key)}" ${p.key===selected?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>${choices('status',text('사용해보셨나요?','Have you used it?'))}${draft.status&&draft.status!=='curious'?choices('period',text('사용 기간 · 선택','Usage period · optional'))+choices('repeat',text('구매 경험 · 선택','Purchase experience · optional'))+choices('opinion',text('사용해보니 어땠나요? · 선택','How was it? · optional'))+choices('reasons',text('사용감 · 복수 선택','Experience · choose any'),true):''}${choices('skin',text('공개할 피부 타입 · 선택','Skin type to share · optional'))}${choices('concerns',text('공개할 고민 · 복수 선택','Concerns to share · optional'),true)}<p class="experience-note">${text('저장하면 선택한 정보가 이 방에 공개돼요. 언제든 수정하거나 삭제할 수 있어요.','Saving shares these choices in this room. You can edit or delete them anytime.')}</p>${error?`<p role="alert">${esc(error)}</p>`:''}<div class="experience-actions">${button('save',busy?text('저장 중…','Saving…'):text('경험 저장','Save experience'),busy?'disabled':'')}${button('cancel',text('취소','Cancel'),busy?'disabled':'')}${mine()?button('delete',text('내 응답 삭제','Delete my response'),busy?'disabled':''):''}</div></div>`;
  }
  function draw(){
    if(!active())return;
    onChange(rows);
    const stats=aggregateExperiences(rows,room.id,blocked),hasMine=rows.some(r=>r.author_tag===author),p=stats.products[0];
    const headline=loading?text('불러오는 중','Loading'):failed?text('지금은 집계를 불러올 수 없어요','Experiences unavailable'):stats.respondents?`${text('응답','Responses')} ${count(stats.respondents)} · ${text('제품','Products')} ${stats.products.length}`:text('아직 나눈 경험이 없어요','No experiences yet');
    host.innerHTML=`<div class="experience-heading">${button('toggle',text('이 방의 사용 경험','Experiences in this room')+' · '+headline,`aria-expanded="${expanded}" aria-controls="room-experience-content"`)}<span aria-hidden="true">${expanded?'⌃':'⌄'}</span></div>${room.demo?`<small class="experience-demo">${text('offline · 가상 응답 · 이 기기에만 저장','offline · Synthetic responses · Saved on this device')}</small>`:''}<div id="room-experience-content" ${expanded?'':'hidden'}>${!failed&&!loading&&!room.demo?button('retry',text('새로고침','Refresh')):''}${failed?`<p>${text('연결을 확인한 뒤 다시 시도해주세요.','Check your connection and try again.')}</p>${button('retry',text('다시 시도','Retry'))}`:loading?'':`<p class="experience-note">${text('이 방에서 직접 응답한 사람 기준 · 누적','All-time, self-reported responses in this room')}</p><h3>${text('어떤 사람들이 있나요?','Who shared their experience?')}</h3><p>${stats.disclosed?`${text('피부 타입 공개','Skin type shared')} ${count(stats.disclosed)} · ${esc(counts('skin',stats.skins))}`:text('공개한 피부 정보가 아직 없어요.','No skin types shared yet.')}</p>${Object.keys(stats.concerns).length?`<p>${esc(counts('concerns',stats.concerns))}</p><small>${text('고민은 중복 선택','Concerns may overlap')}</small>`:''}${stats.products.map(p=>{const product=products.find(x=>x.key===p.key);return `<section class="experience-product"><b>${esc(product?.name??text('대화에 나온 제품','Product in this conversation'))}</b><p>${text('사용 경험','Used')} ${count(p.used)} · ${text('구매 고민','Considering')} ${count(p.curious)}</p>${p.used?`<small>${Object.entries(p.periods).map(([k,n])=>`${k==='unknown'?text('기간 미공개','Period not shared'):label('period',k,ko)} ${count(n)}`).join(' · ')} · ${text('재구매','Repurchased')} ${count(p.repurchased)}</small>`:''}<p>${text('추천','Recommend')} ${count(p.recommend)} · ${text('좋지만 아쉬움','Mixed')} ${count(p.mixed)} · ${text('아쉬움','Disappointed')} ${count(p.regret)}</p>${Object.keys(p.reasons).length?`<small>${esc(counts('reasons',p.reasons))}</small>`:''}${[...p.sources].filter(id=>messages.some(m=>m.id===id&&!blocked.includes(m.author_tag))).slice(0,3).map(id=>button('source',text('관련 대화 보기','View conversation'),`data-exp-source="${Number(id)}"`)).join('')}</section>`;}).join('')}<p class="experience-note">${text('같은 사람은 제품별 1회 집계 · 단순 언급과 하트는 추천에 포함하지 않아요.','One response per person per product. Mentions and hearts are not recommendations.')}</p>`}</div>${!failed&&!loading&&products.length&&!editing?`<div class="experience-entry">${!hasMine&&!skipped?`<span>${text('사용해보셨나요? 경험을 알려주세요.','Used it? Share your experience.')}</span>`:''}${button('edit',hasMine?text('내 경험 수정','Edit my experience'):text('내 경험 남기기','Share my experience'))}${!hasMine&&!skipped?button('skip',text('건너뛰기','Skip')):''}</div>`:''}${editing?form():''}`;
  }
  async function load(){
    loading=true;failed=false;draw();
    try{rows=latestRows(room.demo?store.rows(room.id,seed):await fetchExperiences(room.id));}catch{failed=true;}finally{loading=false;draw();}
  }
  host.onchange=e=>{if(e.target.matches('[data-exp-product]')){selected=e.target.value;draft={...(mine()??{})};error='';draw();}};
  host.onclick=async e=>{
    const b=e.target.closest('button');if(!b||busy)return;
    if(b.dataset.expField){const f=b.dataset.expField,v=b.dataset.expValue;if(['reasons','concerns'].includes(f)){const a=draft[f]??[];draft[f]=a.includes(v)?a.filter(x=>x!==v):[...a,v];}else draft[f]=draft[f]===v?'':v;error='';draw();return;}
    const a=b.dataset.expAction;
    if(a==='toggle'){expanded=!expanded;draw();}
    if(a==='skip'){skip();draw();}
    if(a==='edit'){selected=rows.find(r=>r.author_tag===author)?.product_key??products[0]?.key;if(!products.some(p=>p.key===selected))selected=products[0]?.key;draft={...(mine()??{})};editing=true;error='';draw();}
    if(a==='cancel'){editing=false;error='';draw();}
    if(a==='retry')await load();
    if(a==='source'){const target=document.querySelector(`#chat-log [data-id="${Number(b.dataset.expSource)}"]`);if(target){expanded=false;draw();target.scrollIntoView({block:'center',behavior:'smooth'});target.focus({preventScroll:true});}}
    if(a==='save'||a==='delete'){
      if(a==='save'&&!draft.status){error=text('사용 경험을 하나 선택해주세요.','Choose your usage status.');draw();return;}
      busy=true;error='';draw();
      try{
        let persisted=true;
        if(a==='delete'){if(room.demo)persisted=store.remove(room.id,author,selected);else await deleteExperience(secret,room.id,selected);rows=rows.filter(r=>r.author_tag!==author||r.product_key!==selected);}
        else{
          const source=messages.findLast(m=>m.author_tag===author&&(m.item?.family_key===selected||room.topic_product?.id===selected));
          const input={...normalizeExperience(draft),source_message:source?.id??null};let row;
          if(room.demo)({row,persisted}=store.save(room.id,author,selected,input));else row=await saveExperience(secret,room.id,selected,input);
          rows=[...rows.filter(r=>r.author_tag!==author||r.product_key!==selected),row];
        }
        editing=false;expanded=true;skip();
        if(!persisted)toast(text('기기에 저장하지 못했어요. 이번 실행 중에만 유지돼요.','Storage unavailable. Changes last for this session only.'));
      }catch{error=text('저장하지 못했어요. 선택한 내용은 유지됩니다. 다시 시도해주세요.','Could not save. Your choices are kept; please retry.');}
      finally{busy=false;draw();}
    }
  };
  if(room.demo){rows=latestRows(store.rows(room.id,seed));loading=false;draw();}else load();
  return {refresh:load,updateMessages(next){
    messages=next;
    const updated=roomProducts(room,messages);
    if(JSON.stringify(updated)!==JSON.stringify(products)){products=updated;selected||=products[0]?.key??'';draw();}
  }};
}
