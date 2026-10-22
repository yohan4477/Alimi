import {products,ownership,followups,comparison,shareText} from './model.js';
const app=document.querySelector('#app'),status=document.querySelector('#status'),dialog=document.querySelector('dialog');
const params=new URLSearchParams(location.search);
let product=products.find(p=>p.id===params.get('product'))||products[0],friend=null,state=null,busy=false,images={},shareId=null;
let secret;
try{secret=localStorage.getItem('sb-you-too-secret');if(!/^[a-f0-9]{64}$/.test(secret||'')){secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');localStorage.setItem('sb-you-too-secret',secret);}}
catch{status.textContent='브라우저 저장 공간을 사용할 수 없어요. 저장을 허용한 뒤 새로고침해 주세요.';}
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(action,extra={}){
 const r=await fetch('/api/you-too',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,product:product.id,secret,...extra}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error(r.status===404?'이 공유 링크는 만료되었거나 사용할 수 없어요.':'지금 응답을 불러오거나 저장할 수 없어요. 잠시 후 다시 시도해 주세요.');
 return r.json();
}
function bars(labels,counts={},selected){
 const total=Object.values(counts).reduce((a,b)=>a+b,0);
 return `<p class="note">이 질문에 응답한 ${total}명 기준${total===0?' · 아직 응답이 없어요.':''}</p>`+Object.entries(labels).map(([key,label])=>{const count=counts[key]||0,percent=total?Math.round(count/total*100):0;return `<div class="${key===selected?'mine':''}"><div class="row"><span>${key===selected?'✓ ':''}${label}${key===selected?' · 내 선택':''}</span><span>${count}명${total>=10?' · '+percent+'%':''}</span></div><div class="bar"><i style="width:${percent}%"></i></div></div>`;}).join('');
}
function render(){
 const mine=state?.mine,at=products.indexOf(product),next=products[at+1];
 app.setAttribute('aria-busy',String(busy));
 app.innerHTML=`<p class="eyebrow">${friend?'친구가 물어봤어요':'우리 화장대의 공통점'}</p><h1>너도 이거 있어?</h1><section class="product">${images[product.id]?`<img src="${esc(images[product.id])}" alt="${esc(product.name)}">`:''}<p class="brand">${esc(product.brand)}</p><h2>${esc(product.name)}</h2><p class="note">${esc(product.scope)}</p></section><div class="choices">${Object.entries(ownership).map(([k,v])=>`<button data-choice="${k}" aria-pressed="${mine?.choice===k}" ${busy||!state||!secret?'disabled':''}>${mine?.choice===k?'✓ ':''}${v}</button>`).join('')}</div><p class="note">‘없어’는 지금도, 전에도 갖고 있지 않았다는 뜻이에요.<br>가입 없이 참여 · 이전 응답은 같은 브라우저에서 유지돼요.</p>${state?`<section id="results" ${!mine&&!state.show?'hidden':''}><h2>다른 사람들은?</h2>${bars(ownership,state.counts,mine?.choice)}<p class="note">이 페이지의 응답자 기준이에요.</p></section>${!mine&&!state.show?'<button class="text" data-show>결과만 보기</button>':''}`:'<p class="note">응답을 불러오지 못했어요.</p><button data-retry>다시 불러오기</button>'}${friend&&mine?`<section class="friend"><h2>${comparison(friend.choice,mine.choice)}</h2><div class="versus"><div><span>보낸 친구 · 공유 당시</span><strong>${ownership[friend.choice]}</strong>${friend.detail?`<p>${followups[friend.choice].answers[friend.detail]}</p>`:''}</div><div><span>나 · 지금</span><strong>${ownership[mine.choice]}</strong>${mine.detail?`<p>${followups[mine.choice].answers[mine.detail]}</p>`:''}</div></div><p class="note">다른 수신자의 개별 답은 표시하지 않아요.</p></section>`:''}${mine?`<button class="primary" data-share>친구도 갖고 있을까? ↗</button><section><h2>${followups[mine.choice].question}</h2><div class="choices">${Object.entries(followups[mine.choice].answers).map(([k,v])=>`<button data-detail="${k}" aria-pressed="${mine.detail===k}" ${busy?'disabled':''}>${mine.detail===k?'✓ ':''}${v}</button>`).join('')}</div>${mine.detail?bars(followups[mine.choice].answers,state.details?.[mine.choice]||{},mine.detail)+`<p class="note">‘${ownership[mine.choice]}’를 선택하고 이 질문에 답한 사람 기준이에요.</p>`:'<p class="note">답하지 않고 다음 제품으로 넘어가도 돼요.</p>'}</section>`:''}<section class="next">${next?`<h2>그럼 이것도 있어?</h2><button data-next><small>${esc(next.brand)}</small>${esc(next.name)} →</button>`:'<h2>준비된 제품을 모두 봤어요.</h2><p class="note">친구에게 하나 물어볼까요?</p><button data-restart>제품 다시 구경하기</button>'}</section>`;
 app.querySelector('img')?.addEventListener('error',e=>{e.target.hidden=true;});
}
async function load(){busy=true;render();try{state=await api('read');status.textContent='';}catch(e){status.textContent=e.message;}finally{busy=false;render();}}
async function vote(choice,detail){
 if(busy)return;busy=true;render();
 try{state=await api('vote',{choice,detail,invite:friend?.id||null});shareId=null;status.textContent='응답을 저장했어요.';}
 catch(e){status.textContent=e.message;}finally{busy=false;render();}
}
app.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy||sharing)return;
 if(b.dataset.choice)void vote(b.dataset.choice,state?.mine?.choice===b.dataset.choice?state.mine.detail:null);
 if(b.dataset.detail)void vote(state.mine.choice,b.dataset.detail);
 if(b.hasAttribute('data-show')){state.show=true;render();}
 if(b.hasAttribute('data-retry'))void load();
 if(b.hasAttribute('data-share'))openShare();
 if(b.hasAttribute('data-next')||b.hasAttribute('data-restart')){
  product=b.hasAttribute('data-restart')?products[0]:products[products.indexOf(product)+1];friend=null;state=null;shareId=null;
  history.replaceState(null,'',`?product=${encodeURIComponent(product.id)}`);window.scrollTo(0,0);void load();
 }
});
const include=document.querySelector('#include-detail');
function preview(){document.querySelector('#share-preview').textContent=shareText(product,{...state.mine,detail:include.checked?state.mine.detail:null});shareId=null;document.querySelector('#share-link').hidden=true;document.querySelector('#share-status').textContent='';}
function openShare(){include.checked=false;document.querySelector('#detail-control').hidden=!state.mine.detail;preview();dialog.showModal();}
include.addEventListener('change',preview);
let sharing=false;
async function share(copy){
 if(sharing)return;sharing=true;
 const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);include.disabled=true;
 const feedback=document.querySelector('#share-status');
 try{
  if(!shareId)shareId=(await api('share',{includeDetail:include.checked})).id;
  const url=new URL('/you-too/index.html',location.origin);url.searchParams.set('invite',shareId);
  const text=document.querySelector('#share-preview').textContent;
  if(!copy&&navigator.share){await navigator.share({title:'너도 이거 있어?',text,url:url.href});feedback.textContent='공유 창을 닫았어요.';}
  else {try{await navigator.clipboard.writeText(`${text}\n${url.href}`);feedback.textContent='링크를 복사했어요. 친구에게 붙여 넣어 주세요.';}catch{const input=document.querySelector('#share-link');input.value=url.href;input.hidden=false;input.select();feedback.textContent='아래 링크를 직접 복사해 주세요.';}}
 }catch(e){feedback.textContent=e.name==='AbortError'?'공유를 취소했어요.':e.message;}
 finally{sharing=false;buttons.forEach(b=>b.disabled=false);include.disabled=false;}
}
document.querySelector('#native-share').addEventListener('click',()=>void share(false));
document.querySelector('#copy-share').addEventListener('click',()=>void share(true));
async function init(){
 try{images=await(await fetch('/demo-product-images.json')).json();}catch{}
 if(params.has('invite')){try{const invite=await api('invite',{invite:params.get('invite')});friend=invite;product=products.find(p=>p.id===invite.product)||product;}catch(e){status.textContent=e.message;app.innerHTML='<h1>친구의 질문을 불러오지 못했어요.</h1><p>잠시 후 다시 열어 주세요.</p><a href="/you-too/index.html">제품 구경하기</a>';return;}}
 await load();
}
void init();
