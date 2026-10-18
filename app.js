import {track} from './events.js';
import {openChat,leaveChat} from './chat.js';
import {t,lang,locale,categoryLabel} from './i18n.js';
import {loadProducts,searchCatalog,fetchFamiliesPage,fetchBrands,brandInitials,brandColor,twoRowOrder,fetchFamily,unitName,requestTracking,CATEGORIES,brandLabel,watchSummary,search,dailySeries,stats,usd,alertState,parseTarget,readState,writeState,toggleFavorite} from './live.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storage;try{storage=localStorage}catch{}
let state=readState(storage),products=[],selected=null,category='전체',days=30,timer,detailOpen=false;
const product=id=>products.find(p=>p.id===id);
const kstDate=iso=>new Intl.DateTimeFormat(locale(),{timeZone:'Asia/Seoul',month:lang==='ko'?'long':'short',day:'numeric'}).format(new Date(iso));
const stock=p=>t(p.availability==='in_stock'?'stock.in':p.availability==='out_of_stock'?'stock.out':'stock.unknown');
function toast(m){$('#toast').textContent=m;$('#toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('show'),2500)}
function save(){try{writeState(storage,state)}catch{toast(t('saveLocalOnly'))}}
const art=p=>`<img src="${esc(p.imageUrl)}" alt="${esc(brandLabel(p)+' '+p.name)}" loading="lazy">`;

// Static page text comes from strings.json via data-i18n / data-i18n-attr attributes.
function localizePage(){
  document.documentElement.lang=lang;
  document.title=t('html.title');
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});
  document.querySelectorAll('[data-i18n-attr]').forEach(el=>{for(const pair of el.dataset.i18nAttr.split(';')){const [attr,key]=pair.split(':');el.setAttribute(attr,t(key))}});
}

function change(p){const s=stats(dailySeries(p,30));if(!s||s.days<2||s.max===s.min)return null;return Math.round((p.price/s.avg-1)*100)}
const card=p=>{const c=change(p);return `<article class="card"><button class="product-open" data-product="${esc(p.id)}"><div class="visual">${art(p)}</div><div class="brand">${esc(brandLabel(p))}</div><div class="product-name">${esc(p.name)}</div><div class="price-line">${c===null?'':`<span class="${c<=0?'down':'up'}">${c<=0?'▼':'▲'} ${Math.abs(c)}%</span> `}<strong>${usd(p.price)}</strong></div><small class="meta">${esc(watchSummary(p).text)}</small><div class="delivery">${esc(p.retailer)} · ${stock(p)}</div></button><button class="heart" data-favorite="${esc(p.id)}" aria-label="${esc(t('favorites'))}" aria-pressed="${state.favorites.includes(p.id)}">${state.favorites.includes(p.id)?'♥':'♡'}</button></article>`};
const catalogCard=c=>`<article class="card"><div class="visual">${c.image_url?`<img src="${esc(c.image_url)}" alt="${esc(brandLabel(c)+' '+c.name)}" loading="lazy">`:`<div class="no-photo">${esc(t('noPhoto'))}</div>`}</div><div class="brand">${esc(brandLabel(c))}</div><div class="product-name">${esc(c.name)}</div><div class="price-line"><strong>${usd(c.price)}</strong></div><small class="meta">${esc(categoryLabel(c.category??'기타'))} · ${esc(t('todayPrice'))}</small><button class="heart" data-track="${esc(c.sku)}" data-retailer="${esc(c.retailer)}" data-market="${esc(c.market)}" aria-label="${esc(t('save.action'))}">♡</button></article>`;
const familyCard=f=>`<article class="card"><button class="product-open" data-family="${esc(f.family_key)}"><div class="visual">${f.image_url?`<img src="${esc(f.image_url)}" alt="${esc(brandLabel(f)+' '+f.base_name)}" loading="lazy">`:`<div class="no-photo">${esc(t('noPhoto'))}</div>`}</div><div class="brand">${esc(brandLabel(f))}</div><div class="product-name">${esc(f.base_name)}</div><div class="price-line"><strong>${f.variants>1&&f.minPrice!==f.maxPrice?esc(t('family.from',{v:usd(f.minPrice)})):usd(f.minPrice)}</strong></div><small class="meta">${esc(categoryLabel(f.category??'기타'))}${f.variants>1?' · '+esc(t('family.options',{n:f.variants})):''}</small></button></article>`;
// Variant list of one family: size / option, price, unit price, best-value badge and a heart per variant.
function variantRows(list){
  const tracked=new Map(products.map(p=>[p.sku,p.id]));
  return list.map(v=>{const id=tracked.get(v.sku);return `<article class="variant-row"><div><strong>${esc([v.size_label,v.option_label].filter(Boolean).join(' · ')||t('family.default'))}</strong>${v.bestValue?`<span class="best-tag">${esc(t('badge.bestValue'))}</span>`:''}<small>${v.unitPrice!=null?esc(t('unit.price',{v:usd(v.unitPrice),u:unitName(v.unit)})):''}${id?' · '+esc(t('family.watching')):''}</small></div><b>${usd(v.price)}</b>${id?`<button class="variant-heart" data-favorite="${esc(id)}" aria-pressed="${state.favorites.includes(id)}" aria-label="${esc(t('favorites'))}">${state.favorites.includes(id)?'♥':'♡'}</button>`:`<button class="variant-heart" data-track="${esc(v.sku)}" data-retailer="${esc(v.retailer)}" data-market="${esc(v.market)}" aria-label="${esc(t('save.action'))}">♡</button>`}</article>`}).join('');
}
async function openFamily(key){
  const dlg=$('#family-dialog');$('#family-body').innerHTML=`<p class="empty">${esc(t('loading'))}</p>`;dlg.showModal();
  try{const list=await fetchFamily(key);const head=list[0];$('#family-title').textContent=head?brandLabel(head):'';
    $('#family-name').textContent=head?.name?.split(' - ')[0]??'';$('#family-body').innerHTML=variantRows(list);track('product_view',null,{family:key,variants:list.length})}
  catch{$('#family-body').innerHTML=`<p class="empty">${esc(t('catalogFailed'))}</p>`}
}
async function loadOtherSizes(p){
  const box=$('#other-sizes');if(!box||!p.familyKey)return;
  try{const list=(await fetchFamily(p.familyKey));if(list.length<2||selected!==p.id)return;box.innerHTML=`<h2>${esc(t('family.otherSizes'))}</h2>${variantRows(list)}`;box.hidden=false}catch{}
}
const icon={
  gear:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg>',
  globe:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>',
  tray:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13l2-8h12l2 8v6H4zM4 13h5l1 2h4l1-2h5"/></svg>',
  trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  doc:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM9 12h7M9 16h7"/></svg>',
  lock:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>'
};
// Screens: home / saved / search / brand / settings / detail / chat. The bottom tab bar stays on every
// screen except product detail (which has its own bottom action bar).
const TABS=['home','saved','search','chat'];
let screen='home',lastTab='home',detailReturn='home';
const screenEl=n=>n==='home'?$('#browse'):n==='search'?$('#search-screen'):$('#'+n);
function show(n){
  if(screen==='chat'&&n!=='chat')leaveChat();
  for(const s of ['home','saved','search','brand','settings','detail','chat'])screenEl(s).hidden=s!==n;
  screen=n;if(TABS.includes(n))lastTab=n;
  $('#tabbar').hidden=n==='detail';
  document.querySelectorAll('#tabbar [data-screen]').forEach(x=>x.classList.toggle('active',x.dataset.screen===lastTab));
  window.scrollTo(0,0);
  if(n==='saved')renderSaved();
  if(n==='settings')renderSettings();
  if(n==='search'){renderSearch();setTimeout(()=>$('#search').focus(),0)}
  if(n==='chat')openChat({toast,onClose:()=>show('home')});
}
// Popular-brand strip: round badges like a delivery app's brand grid; tapping one opens that brand's page.
let brands=[];
const brandBadge=b=>b.logo_url?`<img src="${esc(b.logo_url)}" alt="" loading="lazy">`:`<span style="background:${brandColor(b.brand)}">${esc(brandInitials(b.brand))}</span>`;
function renderBrands(){const box=$('#brands');if(!brands.length){box.hidden=true;return}box.hidden=false;
  box.innerHTML=`<h2>${esc(t('brands.title'))}</h2><div class="brand-grid">${twoRowOrder(brands).map(b=>`<button class="brand-item" data-brand="${esc(b.brand)}"><i>${brandBadge(b)}</i><small>${esc(brandLabel(b))}</small></button>`).join('')}</div>`}
const brandPage={brand:null,items:[],done:false,loading:false,seq:0};let brandObserver;
function openBrand(name){Object.assign(brandPage,{brand:name,items:[],done:false,seq:brandPage.seq+1});show('brand');renderBrandPage();track('search',null,{brand:name})}
function renderBrandPage(){
  const b=brands.find(x=>x.brand===brandPage.brand)??{brand:brandPage.brand,brand_ko:null};
  $('#brand').innerHTML=`<div class="page-bar"><button class="icon-btn" data-screen="home" aria-label="${esc(t('back'))}">${icon.back}</button></div><div class="brand-hero"><i class="brand-badge-lg">${brandBadge(b)}</i><div><h1>${esc(brandLabel(b))}</h1>${b.families?`<p>${esc(t('count',{n:b.families}))}</p>`:''}</div></div><div class="catalog-grid">${brandPage.items.map(familyCard).join('')}</div>${brandPage.done?(brandPage.items.length?'':`<p class="empty">${esc(t('brand.empty'))}</p>`):`<p class="empty" id="brand-more">${esc(t('loading'))}</p>`}`;
  brandObserver?.disconnect();const more=$('#brand-more');if(!more)return;
  if(!brandPage.items.length){loadBrandPage();return}
  brandObserver=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))loadBrandPage()},{rootMargin:'600px'});brandObserver.observe(more);
}
async function loadBrandPage(){
  if(brandPage.loading||brandPage.done)return;brandPage.loading=true;const seq=brandPage.seq;
  try{const page=await fetchFamiliesPage('전체',brandPage.items.length,24,fetch,brandPage.brand);if(seq!==brandPage.seq)return;brandPage.items.push(...page);if(page.length<24)brandPage.done=true}
  catch{if(seq===brandPage.seq)brandPage.done=true}
  finally{brandPage.loading=false}
  if(seq===brandPage.seq&&screen==='brand')renderBrandPage();
}
// Saved (관심상품): favorites in a 3-column grid, padded with "+ Add" slots until there are three.
const savedCard=p=>`<article class="saved-card"><button class="product-open" data-product="${esc(p.id)}"><div class="visual">${art(p)}</div><div class="brand">${esc(brandLabel(p))}</div><div class="product-name">${esc(p.name)}</div><strong>${usd(p.price)}</strong></button><button class="heart" data-favorite="${esc(p.id)}" aria-label="${esc(t('favorites'))}" aria-pressed="true">♥</button></article>`;
function renderSaved(){
  const list=products.filter(p=>state.favorites.includes(p.id)),n=list.length;
  const hint=n===0?t('saved.hint'):n<3?t('saved.hintMore',{n:3-n}):t('saved.count',{n});
  $('#saved').innerHTML=`<div class="page-head"><h1>${esc(t('saved.title'))}</h1><button class="icon-btn" data-screen="settings" aria-label="${esc(t('settings.open'))}">${icon.gear}</button></div><p class="page-sub">${esc(hint)}</p><div class="saved-grid">${list.map(savedCard).join('')}${Array.from({length:Math.max(0,3-n)},(_,i)=>`<button class="add-slot${i===0?' first':''}" data-screen="search">${icon.plus}<span>${esc(t('saved.add'))}</span></button>`).join('')}</div>`;
}
// Settings, laid out like the competitor's: grouped rows with line icons and gray hint boxes.
const row=(ic,label,attrs='',tail=icon.chevron)=>`<button class="set-row" ${attrs}><span class="set-ico">${ic}</span><span class="set-label">${esc(label)}</span><span class="set-tail">${tail}</span></button>`;
function renderSettings(){
  $('#settings').innerHTML=`<div class="page-bar"><button class="icon-btn" data-screen="saved" aria-label="${esc(t('back'))}">${icon.back}</button><h1>${esc(t('settings.title'))}</h1></div>
<section class="set-group"><h3>${esc(t('settings.service'))}</h3>${row(icon.bell,t('settings.alerts'),'data-set="soon"')}<p class="set-hint">${esc(t('settings.alertsHint'))}</p>
<div class="set-row static"><span class="set-ico">${icon.globe}</span><span class="set-label">${esc(t('settings.language'))}</span><span class="seg"><button data-lang="ko" class="${lang==='ko'?'on':''}">한국어</button><button data-lang="en" class="${lang==='en'?'on':''}">English</button></span></div><p class="set-hint">${esc(t('settings.languageHint'))}</p></section>
<section class="set-group"><h3>${esc(t('settings.data'))}</h3>${row(icon.tray,t('settings.clearSaved'),'data-set="clear-saved"')}${row(icon.trash,t('settings.clearCache'),'data-set="clear-cache"')}</section>
<section class="set-group"><h3>${esc(t('settings.support'))}</h3><button class="feedback-card" data-set="soon"><span class="set-ico">${icon.chat}</span><span><b>${esc(t('settings.feedback'))}</b><em>${esc(t('settings.feedbackSub'))}</em></span></button>${row(icon.doc,t('settings.terms'),'data-set="soon"')}${row(icon.lock,t('settings.privacy'),'data-set="soon"')}<div class="set-row static"><span class="set-ico">${icon.info}</span><span class="set-label">${esc(t('settings.version',{v:'web 1.0'}))}</span></div></section>`;
}
async function settingsAction(a){
  if(a==='soon'){toast(t('settings.soon'));return}
  if(a==='clear-saved'){if(!confirm(t('settings.clearSavedConfirm')))return;state={favorites:[],targets:{}};save();renderList();toast(t('settings.cleared'));return}
  if(a==='clear-cache'){try{for(const k of await caches.keys())await caches.delete(k)}catch{}try{sessionStorage.clear()}catch{}toast(t('settings.cacheCleared'));setTimeout(()=>location.reload(),700)}
}
// Search has its own screen: watched products that match, then the whole catalog.
function renderSearch(){
  const q=$('#search').value.trim(),box=$('#search-results');
  if(!q){box.innerHTML=`<p class="empty search-empty">${esc(t('search.recentEmpty'))}</p>`;return}
  const items=search(products,q,'전체');
  box.innerHTML=(items.length?`<div class="heading"><div><h2>${esc(t('section.watching'))}</h2></div><span>${esc(t('count',{n:items.length}))}</span></div><div class="product-grid">${items.map(card).join('')}</div>`:'')+'<div id="search-catalog" class="catalog-results"></div>';
  if(q.length>=2)renderCatalogSearch(q);
}
function updateCount(){const n=state.favorites.length;$('#count').textContent=n;$('#count').hidden=!n}
// Home: watched products, then the Korean-brand catalog by category.
function renderList(){
  const items=search(products,'',category);
  updateCount();
  $('#list-title').textContent=t('section.watching');
  $('#result-count').textContent=t('count',{n:items.length});
  $('#products').innerHTML=(items.length?items.map(card).join(''):`<p class="empty">${esc(t('empty.watchingCategory'))}</p>`)+'<div id="catalog-results" class="catalog-results"></div>';
  renderCatalogBrowse(true);
  if(screen==='saved')renderSaved();
}
// Whole-catalog search: tapping the heart saves the item and starts watching that exact SKU.
let catalogTimer,catalogSeq=0;
let searchSeq=0;
function renderCatalogSearch(q){clearTimeout(catalogTimer);const seq=++searchSeq;
  catalogTimer=setTimeout(async()=>{let list;try{list=await searchCatalog(q)}catch{list=null}if(seq!==searchSeq||!$('#search-catalog'))return;const tracked=new Set(products.map(p=>p.sku));list=(list||[]).filter(c=>!tracked.has(c.sku));
    $('#search-catalog').innerHTML=list===null?'':`<div class="heading"><div><h2>${esc(t('section.more'))}</h2><p>${esc(t('section.moreHint'))}</p></div><span>${esc(t('count',{n:list.length}))}</span></div>`+(list.length?`<div class="catalog-grid">${list.map(catalogCard).join('')}</div>`:`<p class="empty">${esc(t('empty.catalogSearch'))}</p>`);
  },350)}
// Home browsing of the Korean-brand catalog by category, loaded page by page as the user scrolls.
const browse={category:null,items:[],done:false,loading:false};let observer;
function renderCatalogBrowse(reset){
  const box=$('#catalog-results');if(!box)return;
  if(reset&&browse.category!==category){Object.assign(browse,{category,items:[],done:false});catalogSeq++}
  const tracked=new Set(products.map(p=>p.sku));
  box.innerHTML=`<div class="heading"><div><h2>${esc(t('section.all'))}</h2><p>${esc(t('family.pick'))}</p></div></div><div class="catalog-grid">${browse.items.map(familyCard).join('')}</div>${browse.done?(browse.items.length?'':`<p class="empty">${esc(t('empty.products'))}</p>`):`<p class="empty" id="catalog-more">${esc(t('loading'))}</p>`}`;
  observer?.disconnect();
  const more=$('#catalog-more');if(!more)return;
  // First page loads right away; later pages load when the sentinel comes near the viewport.
  if(!browse.items.length){loadMoreCatalog();return}
  observer=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))loadMoreCatalog()},{rootMargin:'600px'});observer.observe(more);
}
async function loadMoreCatalog(){
  if(browse.loading||browse.done)return;browse.loading=true;const seq=catalogSeq;
  let stale=false;
  try{const page=await fetchFamiliesPage(browse.category,browse.items.length);stale=seq!==catalogSeq;if(!stale){browse.items.push(...page);if(page.length<24)browse.done=true}}
  catch{stale=seq!==catalogSeq;if(!stale)browse.done=true}
  finally{browse.loading=false}
  // Category changed while this page was loading: load the first page of the new selection.
  if(stale){loadMoreCatalog();return}
  if(seq===catalogSeq)renderCatalogBrowse(false);
}
async function startTracking(b){b.disabled=true;try{const slug=await requestTracking({retailer:b.dataset.retailer,market:b.dataset.market,sku:b.dataset.track});const r=await loadProducts();products=r.products;if(!state.favorites.includes(slug))toggleFavorite(state,slug);save();track('wishlist_add',slug,{from:'catalog'});renderList();if(detailOpen)renderDetail();if(screen==='search')renderSearch();b.outerHTML=`<button class="variant-heart" data-favorite="${esc(slug)}" aria-pressed="true">♥</button>`;toast(t('toast.saved'))}catch{b.disabled=false;toast(t('toast.saveFailed'))}}

function chart(p){
  const series=dailySeries(p,days),s=stats(series);
  let graph=`<div class="chart-wrap history-pending"><strong>${esc(watchSummary(p).text)}</strong><p>${esc(t('chart.pendingHint'))}</p><small>${esc(t('chart.cadence'))}</small></div>`;
  const pts=series.map((d,i)=>({...d,i})).filter(d=>d.price!=null);
  if(s&&pts.length>=2){
    const pad=Math.max(.5,(s.max-s.min)*.25),lo=s.min-pad,hi=s.max+pad,y=v=>190-(v-lo)/(hi-lo)*150,x=i=>12+i*326/(days-1);
    graph=`<div class="chart-wrap"><svg viewBox="0 0 350 240" role="img" aria-label="${esc(t('chart.aria',{days}))}"><title>${esc(t('chart.title'))}</title>${s.max!==s.min?`<text x="335" y="${y(s.max)-12}" text-anchor="end" fill="#16ab51">${esc(t('chart.high',{v:usd(s.max)}))}</text><text x="335" y="${y(s.min)+23}" text-anchor="end" fill="#f25b55">${esc(t('chart.low',{v:usd(s.min)}))}</text>`:''}<polyline points="${pts.map(d=>x(d.i)+','+y(d.price)).join(' ')}" fill="none" stroke="#f25b55" stroke-width="2.6" stroke-linejoin="round"/><circle cx="${x(pts.at(-1).i)}" cy="${y(pts.at(-1).price)}" r="3.5" fill="#f25b55"/><text x="12" y="233">${esc(t('chart.daysAgo',{n:days-1}))}</text><text x="338" y="233" text-anchor="end">${esc(t('chart.today'))}</text></svg></div>`;
  }
  return graph+`<div class="stats">${[['stat.high',s?.max,'up','▲'],['stat.avg',s?.avg,'','−'],['stat.low',s?.min,'down','▼']].map(([k,v,c,icon])=>`<div><span><i class="${c}">${icon}</i>${esc(t(k))}</span><strong class="${v==null?'':c}">${v==null?'—':usd(v)}</strong></div>`).join('')}</div><p class="chart-note">${esc(t('chart.note',{date:p.history.length?kstDate(p.history[0].at):'—'}))}</p>`;
}

function renderDetail(){
  const p=product(selected),target=state.targets[p.id]??null,fav=state.favorites.includes(p.id);
  const shipping=p.delivery==null?t('unknown'):usd(p.delivery);
  $('#detail').innerHTML=`<div class="detail-nav"><button id="back" aria-label="${esc(t('back'))}">←</button><strong>${esc(t('detail.title'))}</strong><button data-favorite="${esc(p.id)}" aria-label="${esc(t('favorites'))}">${fav?'♥':'♡'}</button></div><div class="detail-product"><div class="detail-art">${art(p)}</div><div class="price-summary"><small>${esc(t('detail.usPrice',{retailer:p.retailer}))}</small><div class="current"><strong>${usd(p.price)}</strong></div><p class="price-baseline">${esc(t('detail.checked',{checked:kstDate(p.checkedAt),changed:kstDate(p.changedAt)}))}</p><h1>${esc(p.name)}</h1><p class="product-meta">${esc(brandLabel(p))}${p.size?' · '+esc(p.size):''} · ${esc(categoryLabel(p.category))}</p><div class="info-chips"><span>${stock(p)}</span><span>${esc(t('detail.shippingChip',{v:shipping}))}</span></div></div></div><section class="analysis-section"><h2>${esc(t('detail.priceHistory'))}</h2><div class="periods" aria-label="${esc(t('period.aria'))}">${[7,14,30].map(n=>`<button data-days="${n}" aria-pressed="${n===days}" class="${n===days?'active':''}">${esc(t('days',{n}))}</button>`).join('')}</div>${chart(p)}</section><section class="offer-section other-sizes" id="other-sizes" hidden></section><section class="offer-section"><div class="offer-heading"><h2>${esc(t('detail.retailer'))}</h2><small>${esc(t('detail.officialFeed'))}</small></div><article class="seller-row"><div class="seller-info"><strong>${esc(p.retailer)}</strong><small>${esc(t('detail.feedShipping',{v:shipping}))}</small></div><div class="seller-price"><strong>${usd(p.price)}</strong><small>${stock(p)}</small></div><a class="observed-buy" href="${esc(p.affiliateUrl||p.url)}" target="_blank" rel="sponsored noopener noreferrer">${esc(t('detail.buy'))}</a></article><p class="chart-note">${esc(t('detail.disclaimer'))}</p></section><section class="target-section"><h2>${esc(t('target.title'))}</h2><div id="alert-status">${target===null?esc(t('target.empty')):usd(target)+' · '+esc(alertState(target,p.price))}</div><p class="chart-note">${esc(t('target.note'))}</p>${target===null?'':`<button id="remove-target">${esc(t('target.remove'))}</button>`}</section><div class="detail-actions"><button data-favorite="${esc(p.id)}" class="save-action">${fav?'♥':'♡'}<small>${esc(t('save.short'))}</small></button><button id="set-target" class="primary">${esc(t('target.set'))}</button></div>`;
  loadOtherSizes(p);
  $('#back').onclick=closeDetail;
  $('#set-target').onclick=()=>{$('#target').value=state.targets[p.id]??'';$('#target-dialog').showModal()};
  if($('#remove-target'))$('#remove-target').onclick=()=>{delete state.targets[p.id];save();renderDetail()};
}
function closeDetail(){detailOpen=false;show(detailReturn)}
function openDetail(id){selected=id;track('product_view',id);detailOpen=true;detailReturn=screen;renderDetail();show('detail')}

localizePage();
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.track){startTracking(b);return}
  if(b.dataset.family){openFamily(b.dataset.family);return}
  if(b.dataset.brand){openBrand(b.dataset.brand);return}
  if(b.dataset.screen){show(b.dataset.screen);return}
  if(b.dataset.set){settingsAction(b.dataset.set);return}
  if(b.dataset.lang){try{localStorage.setItem('alimi-lang',b.dataset.lang)}catch{}location.href='?lang='+b.dataset.lang;return}
  if(b.dataset.product)openDetail(b.dataset.product);
  if(b.dataset.favorite){toggleFavorite(state,b.dataset.favorite);track(state.favorites.includes(b.dataset.favorite)?'wishlist_add':'wishlist_remove',b.dataset.favorite);save();renderList();if(screen==='search')renderSearch();if(detailOpen)renderDetail()}
  if(b.dataset.days){days=+b.dataset.days;const y=window.scrollY;renderDetail();window.scrollTo(0,y)}
  if(b.dataset.category){category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x.dataset.category===category));renderList()}});
$('#target-form').onsubmit=e=>{e.preventDefault();const v=parseTarget($('#target').value);if(v===null){toast(t('target.invalid'));return}state.targets[selected]=v;save();track('target_price_set',selected);$('#target-dialog').close();renderDetail();toast(t('target.saved'))};
let searchTimer;$('#search').oninput=()=>{renderSearch();clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const q=$('#search').value.trim();if(q)track('search',null,{length:q.length,results:search(products,q).length})},1200)};$('#clear').onclick=()=>{$('#search').value='';renderSearch();$('#search').focus()};
$('#browse-now').onclick=()=>$('.results').scrollIntoView({behavior:'smooth'});
$('#reset').onclick=()=>{if(confirm(t('reset.confirm'))){state={favorites:[],targets:{}};save();renderList()}};
document.addEventListener('click',e=>{const a=e.target.closest('a.observed-buy');if(a&&selected)track('merchant_click',selected,{retailer:product(selected)?.retailer})});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){const box=document.createElement('div');box.className='no-photo';box.textContent=t('photoFailed');e.target.replaceWith(box)}},true);

$('#products').innerHTML=`<p class="empty">${esc(t('loadingPrices'))}</p>`;
loadProducts().then(({products:list,source,exportedAt})=>{
  products=list;
  $('#categories').innerHTML=['전체',...CATEGORIES].map(c=>`<button class="chip ${c==='전체'?'active':''}" data-category="${c}">${esc(categoryLabel(c))}</button>`).join('');
  if(products[0])$('#hero-art').innerHTML=art(products.find(p=>p.sku==='10759')??products[0]);
  const latest=products.map(p=>p.checkedAt).sort().at(-1);
  $('.notice').textContent=source==='live'?t('notice.live',{date:latest?kstDate(latest):''}):t('notice.offline',{date:exportedAt?kstDate(exportedAt):''});
  renderList();
  track('home_view',null,{source,lang});
  fetchBrands().then(list=>{brands=list;renderBrands()}).catch(()=>{});
}).catch(()=>{$('#products').innerHTML=`<p class="empty">${esc(t('loadFailed'))}</p>`});
