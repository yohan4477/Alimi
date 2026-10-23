// This entry must never import the actual app, auth, account sync, or telemetry.
import {sampleRooms,sampleMessages,isSampleRoom} from './sample-data.js';
import {sampleURL} from './public-routes.js';
import {resolveVisitorContext,currentVisitorContext,rememberLanguage} from './language-preference.js';
import {marketDecision} from './market-preference.js';
import {copy,disclosureMarkup,roomMarkup,messageMarkup} from './sample-view.js';
import {gameEntranceMarkup,mountGameEntranceCarousel} from './game-entrance-carousel.js';
import {$,esc} from './util.js';
const context=currentVisitorContext()||await resolveVisitorContext();
let language=context.language,storage;try{storage=globalThis.localStorage;}catch{}
const initialMarket=marketDecision({pathname:'/',search:location.search,storage,suggestedRegion:context.suggestedRegion}).region;
let market=initialMarket;
const liked=new Set(),saved=new Set();let stopCarousel=()=>{};
const backIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
function actualHref(){const u=new URL('/live',location.origin);u.searchParams.set('lang',language);if(market)u.searchParams.set('region',market);return u.pathname+u.search;}
function header(){const c=copy(language);return `<div class="logo-head sb-head"><a href="${esc(sampleURL({href:location.href,room:null,tab:'chat'}).pathname+sampleURL({href:location.href,room:null,tab:'chat'}).search)}"><img class="sb-logo" src="assets/seoul-beauty-logo.webp" alt="Seoul Beauty" width="200" height="60"></a><span class="sb-head-actions"><button class="icon-btn" data-sample-screen="search" aria-label="${esc(c.search)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button></span></div><div class="service-context"><button class="service-region-button" data-sample-market-open aria-label="${esc(c.market)}">${esc(market?c[market]:c.choose)} ▾</button></div>${disclosureMarkup(language)}`;}
const liveLink=()=>`<p class="home-note"><a class="text-link" data-sample-live href="${esc(actualHref())}">${esc(copy(language).live)} ›</a></p>`;
function navigate(values){history.replaceState({scrollY:scrollY},'',location.href);history.pushState({scrollY:0},'',sampleURL({href:location.href,...values}));render();scrollTo(0,0);}
function render(){
 stopCarousel();document.documentElement.lang=language;document.title=language==='ko'?'SeoulBeauty · 가상 대화 미리보기':'SeoulBeauty · Fictional conversation preview';
 const c=copy(language),query=new URLSearchParams(location.search),room=sampleRooms(language).find(r=>r.id===query.get('room')),screen=room?'chat':['search','saved'].includes(query.get('sampleTab'))?query.get('sampleTab'):'chat';
 for(const [id,key] of [['chat','chat'],['search-screen','search'],['saved','saved']]){const section=$('#'+id);section.hidden=screen!==key;if(section.hidden)section.innerHTML='';}
 if(room)document.documentElement.dataset.room='1';else delete document.documentElement.dataset.room;
 $('#service-region-picker').innerHTML=`<form method="dialog"><button class="close-dialog" aria-label="${esc(c.back)}">×</button></form><h2>${esc(c.market)}</h2><p>${esc(language==='ko'?'언어와 카탈로그 범위는 별개예요. 여기서는 가상 대화만 보여요.':'Language and catalog scope are separate. This page shows fictional conversations only.')}</p><div class="service-choices">${['kr','us'].map(r=>`<button data-sample-market="${r}" aria-pressed="${r===market}">${esc(c[r])}</button>`).join('')}</div><h3>${esc(c.language)}</h3><div class="service-choices">${['ko','en'].map(l=>`<button data-sample-language="${l}" aria-pressed="${l===language}">${l==='ko'?(language==='ko'?'한국어':'Korean'):'English'}</button>`).join('')}</div>`;
 for(const b of document.querySelectorAll('#tabbar [data-sample-screen]')){b.classList.toggle('active',b.dataset.sampleScreen===screen);b.querySelector('i').textContent=c[b.dataset.sampleScreen==='chat'?'home':b.dataset.sampleScreen];}
 if(room){
  const messages=sampleMessages(room.id,language);
  $('#chat').innerHTML=`<div class="room-top"><button class="room-back" data-sample-back data-sample-screen="chat" aria-label="${esc(c.back)}">${backIcon}</button><div class="room-top-text"><h1>${esc(room.title)}</h1><small class="room-count">${esc(c.sample)}</small></div><button class="room-more" data-sample-market-open aria-label="${esc(c.market)}">⋯</button></div>${disclosureMarkup(language)}<div id="topic-body"><p class="home-note">${esc(room.intro)}</p><div id="chat-log" class="chat-log">${messages.map(m=>messageMarkup(m,messages,language,{liked,saved})).join('')}</div><div class="chat-composer"><p class="chat-rules">${esc(c.readonly)}</p>${liveLink()}</div></div>`;
 }else if(screen==='chat'){
  $('#chat').innerHTML=`${header()}${gameEntranceMarkup(language)}<p class="home-note">${esc(c.game)}</p><div class="chat-rooms" id="community-home"><section class="home-hero"><div class="home-hero-text"><h1>${esc(c.title)}</h1><p>${esc(c.sub)}</p><a class="hero-cta" data-sample-live href="${esc(actualHref())}">${esc(c.live)} ›</a></div><img src="assets/seoul-beauty-model.webp" alt="" width="1254" height="1254"></section><div class="section-head"><h2 class="chat-section">${esc(c.rooms)}</h2></div>${sampleRooms(language).map(r=>roomMarkup(r,language)).join('')}${liveLink()}</div>`;
  stopCarousel=mountGameEntranceCarousel($('[data-game-entrance]'),{lang:language});
 }else if(screen==='search'){
  $('#search-screen').innerHTML=`${header()}<div class="search-head"><div class="searchbar"><input id="sample-search" type="search" placeholder="${esc(c.find)}" aria-label="${esc(c.find)}"></div></div><div id="sample-results"></div>${liveLink()}`;search('');
 }else{
  const rooms=sampleRooms(language).filter(r=>sampleMessages(r.id,language).some(m=>saved.has(String(m.id))));
  $('#saved').innerHTML=`${header()}<h1>${esc(c.activity)}</h1><p class="home-note">${esc(c.memory)}</p>${rooms.map(r=>roomMarkup(r,language)).join('')||`<p class="empty">${esc(c.none)}</p>`}${liveLink()}`;
 }
 document.documentElement.removeAttribute('data-locale-pending');
}
function search(term){const words=term.toLocaleLowerCase().trim().split(/\s+/);const rooms=sampleRooms(language).filter(r=>words.every(w=>[r.title,r.intro,...sampleMessages(r.id,language).map(m=>m.body)].join(' ').toLocaleLowerCase().includes(w)));$('#sample-results').innerHTML=rooms.map(r=>roomMarkup(r,language)).join('')||`<p class="empty">${esc(copy(language).empty)}</p>`;}
document.addEventListener('input',event=>{if(event.target.id==='sample-search')search(event.target.value);});
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.sampleRoom&&isSampleRoom(button.dataset.sampleRoom))navigate({room:button.dataset.sampleRoom});
 else if(button.dataset.sampleScreen)navigate({room:null,tab:button.dataset.sampleScreen});
 else if(button.hasAttribute('data-sample-market-open'))$('#service-region-picker').showModal();
 else if(button.hasAttribute('data-sample-language')){language=button.dataset.sampleLanguage;$('#service-region-picker').close();rememberLanguage(language);navigate({language,room:new URLSearchParams(location.search).get('room'),tab:new URLSearchParams(location.search).get('sampleTab')});}
 else if(button.dataset.sampleMarket){market=button.dataset.sampleMarket;$('#service-region-picker').close();navigate({market,room:new URLSearchParams(location.search).get('room'),tab:new URLSearchParams(location.search).get('sampleTab')});}
 else if(button.dataset.sampleLike||button.dataset.sampleSave){const set=button.dataset.sampleLike?liked:saved,id=button.dataset.sampleLike||button.dataset.sampleSave;set.has(id)?set.delete(id):set.add(id);button.setAttribute('aria-pressed',String(set.has(id)));button.classList.toggle('selected',set.has(id));if(button.dataset.sampleSave)button.textContent=copy(language)[set.has(id)?'savedLabel':'save'];}
 else if(button.dataset.sampleJump){document.querySelector(`[data-sample-message="${CSS.escape(button.dataset.sampleJump)}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});}
});
addEventListener('popstate',()=>{const q=new URLSearchParams(location.search);if(['ko','en'].includes(q.get('lang')))language=q.get('lang');market=['kr','us'].includes(q.get('region'))?q.get('region'):initialMarket;render();scrollTo(0,history.state?.scrollY||0);});
render();
