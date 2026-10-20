// Progressive disclosure using the existing product, brand and chat card renderers.
import {t,lang,categoryLabel} from './i18n.js';
import {esc} from './util.js';
import {fetchFamiliesPage,CATEGORIES} from './live.js';
const copy=(ko,en)=>lang==='ko'?ko:en;
const counts={talk:2,brands:4};
let sort="default";
let mount,ui,category='전체',items=[],done=false,busy=false,failed=false,version=0,mentions=null,mentionFailed=false,mentionsLoading=false;
const initial=k=>k==='brands'?4:2;
const toggle=(k,total)=>total>initial(k)||counts[k]>initial(k)?`<button class="text-link" data-explore-toggle="${k}" aria-controls="explore-${k}-list" aria-expanded="${counts[k]>initial(k)}">${counts[k]>initial(k)?copy('접기','Show less'):copy('더보기','Show more')} ${counts[k]>initial(k)?'−':'＋'}</button>`:'';
const heading=(k,title,total)=>`<div class="section-head"><h2 class="chat-section">${esc(title)}</h2>${toggle(k,total)}</div>`;
function draw(){if(!mount?.isConnected||document.getElementById('search')?.value.trim())return;
 const bs=ui.brands();
 const available=[...(items.length?items:ui.products().filter(p=>category==='전체'||p.category===category))];
 const signals=new Map();
 for(const g of mentions??[]){const key=g.item.family_key;if(!key)continue;const value=signals.get(key)??{mentions:0,likes:0};value.mentions+=g.entries.length;value.likes+=g.entries.reduce((n,e)=>n+Math.max(0,Number(e.likes)||0),0);signals.set(key,value);}
 if(sort!=='default')available.sort((a,b)=>(signals.get(b.family_key)?.[sort]??0)-(signals.get(a.family_key)?.[sort]??0));
 mount.innerHTML=`<section class="explore-section" id="explore-talk">${heading('talk',copy('대화에 나온 상품','Products in conversations'),mentions?.length??0)}<div id="explore-talk-list">${mentions?.length?mentions.slice(0,counts.talk).map(g=>`<article class="explore-mention">${ui.itemCard(g.item,g.entries[0].source+'-'+g.entries[0].id)}<button class="text-link conversation-link" ${g.entries[0].source==='post'?`data-post="${esc(g.entries[0].id)}"`:`data-open-room="${esc(g.entries[0].room_id)}"`}>${esc(t('home.viewConversation'))} ›</button></article>`).join(''):`<p class="home-note">${esc(mentionFailed?t('loadFailed'):mentions===null?t('loading'):t('home.noProducts'))}${mentionFailed?` <button class="text-link" data-explore-retry="talk">${esc(t('retry'))}</button>`:''}</p>`}</div></section>
 <section class="explore-section" id="explore-brands">${heading('brands',t('brands.title'),bs.length)}<div class="brand-grid" id="explore-brands-list">${bs.slice(0,counts.brands).map(ui.brandCard).join('')}</div>${!bs.length?`<p class="home-note">${esc(ui.brandsFailed()?t('loadFailed'):t('loading'))}${ui.brandsFailed()?` <button class="text-link" data-brands-retry>${esc(t('retry'))}</button>`:''}</p>`:''}</section>
 <section class="explore-section" id="explore-all"><div class="section-head"><h2 class="chat-section">${esc(t('section.all'))}</h2></div><div class="explore-categories" aria-label="${copy('상품 정렬','Product order')}">${[['default',copy('기본순','Default')],['mentions',copy('언급순','Most mentioned')],['likes',copy('좋아요순','Most liked')]].map(([key,label])=>`<button class="chip ${sort===key?'active':''}" data-explore-sort="${key}" aria-pressed="${sort===key}">${label}</button>`).join('')}</div>${sort!=='default'?`<p class="home-note">${esc(copy('불러온 상품 중 최근 24시간 확인된 글·대화 기준입니다. 좋아요는 상품 언급 글·메시지의 합계입니다.','Loaded products ranked using sampled conversations from the last 24 hours. Likes are summed from product mentions.'))}${mentionsLoading?` ${esc(t('loading'))}`:mentionFailed?` ${esc(t('loadFailed'))}`:''}</p>`:''}<div class="explore-categories">${['전체',...CATEGORIES].map(c=>`<button class="chip ${c===category?'active':''}" data-explore-category="${esc(c)}" aria-pressed="${c===category}">${esc(categoryLabel(c))}</button>`).join('')}</div><div class="catalog-grid" id="explore-all-list">${available.map(items.length?ui.familyCard:ui.card).join('')}</div>${!available.length?`<p class="home-note">${esc(busy?t('loading'):failed?t('loadFailed'):t('empty.products'))}</p>`:''}${failed?`<button class="text-link" data-explore-retry="all">${esc(t('retry'))}</button>`:''}${!done&&!failed?`<div class="explore-end"><button class="text-link" data-explore-next="all" ${busy?'disabled':''}>${esc(busy?t('loading'):copy('상품 더 불러오기','Load more products'))} ＋</button></div>`:''}</section>`;
}
async function load(){if(busy||done)return;busy=true;failed=false;const v=version;draw();try{const page=await fetchFamiliesPage(category,items.length,24);if(v===version){items.push(...page);done=page.length<24;}}catch{if(v===version)failed=true;}finally{busy=false;if(v===version)draw();else load();}}
async function loadMentions(){if(mentionsLoading)return;mentionsLoading=true;mentionFailed=false;try{mentions=await ui.loadMentions();}catch{mentionFailed=true;}finally{mentionsLoading=false;draw();}}
export function renderExplore(box,renderers){mount=box;ui=renderers;draw();if(mentions===null&&!mentionFailed)loadMentions();if(!items.length&&!done&&!busy&&!failed)load();}
export function refreshExplore(){draw();}
export function handleExplore(button){const k=button.dataset.exploreToggle;
 if(k==='talk'||k==='brands'){const section=document.getElementById('explore-'+k),above=section.getBoundingClientRect().top<0;counts[k]=counts[k]>initial(k)?initial(k):k==='brands'?ui.brands().length:k==='talk'?(mentions?.length??2):4;draw();if(above)document.getElementById('explore-'+k).scrollIntoView({block:'start'});return true;}
 if(button.dataset.exploreSort){if(['default','mentions','likes'].includes(button.dataset.exploreSort)){sort=button.dataset.exploreSort;draw();}return true;}
 if(button.dataset.exploreNext){load();return true;}
 if(button.dataset.exploreCategory){category=button.dataset.exploreCategory;items=[];done=false;failed=false;version++;load();draw();return true;}
 if(button.dataset.exploreRetry){button.dataset.exploreRetry==='talk'?loadMentions():load();return true;}return false;
}
