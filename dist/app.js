import {renderProductInfo} from './product-info.js';
import {readCatalogSaves,saveCatalogSnapshot,mergeCatalogSaves} from './saved-catalog.js';
import {track} from './events.js';
import {GoogleAuth} from './auth.js';
import {openChat,leaveChat,renderProductTalk,openPostNext,readSavedPosts,openRoomNext,renderMyConversations} from './chat.js';
import {t,lang,locale,categoryLabel} from './i18n.js';
import {buyUrl,loadProducts,searchCatalog,fetchFamiliesPage,fetchBrands,brandInitials,brandColor,twoRowOrder,fetchFamily,unitName,CATEGORIES,brandLabel,search,usd,readState,writeState,toggleFavorite} from './live.js';
import {$,esc} from './util.js';
let storage;try{storage=localStorage}catch{}
let state=readState(storage),products=[],selected=null,category='전체',timer,detailOpen=false;
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

const catalogItems=new Map();
const catalogKey=c=>[c.retailer,c.market,c.sku].join('|');
const remember=c=>{catalogItems.set(catalogKey(c),c);return catalogKey(c)};
const card=p=>`<article class="card"><button class="product-open" data-product="${esc(p.id)}"><div class="visual">${art(p)}</div><div class="brand">${esc(brandLabel(p))}</div><div class="product-name">${esc(p.name)}</div><div class="price-line"><strong>${usd(p.price)}</strong></div><small class="meta">${esc(categoryLabel(p.category))}</small><div class="delivery">${esc(p.retailer)} · ${stock(p)}</div></button><button class="heart" data-favorite="${esc(p.id)}" aria-label="${esc(t('favorites'))}" aria-pressed="${state.favorites.includes(p.id)}">${state.favorites.includes(p.id)?'♥':'♡'}</button></article>`;
const catalogCard=c=>`<article class="card"><div class="visual">${c.image_url?`<img src="${esc(c.image_url)}" alt="${esc(brandLabel(c)+' '+c.name)}" loading="lazy">`:`<div class="no-photo">${esc(t('noPhoto'))}</div>`}</div><div class="brand">${esc(brandLabel(c))}</div><div class="product-name">${esc(c.name)}</div><div class="price-line"><strong>${usd(c.price)}</strong></div><small class="meta">${esc(categoryLabel(c.category??'기타'))} · ${esc(t('todayPrice'))}</small><button class="heart" data-catalog-save="${esc(remember(c))}" data-retailer="${esc(c.retailer)}" data-market="${esc(c.market)}" aria-label="${esc(t('save.action'))}">♡</button></article>`;
const familyCard=f=>`<article class="card"><button class="product-open" data-family="${esc(f.family_key)}"><div class="visual">${f.image_url?`<img src="${esc(f.image_url)}" alt="${esc(brandLabel(f)+' '+f.base_name)}" loading="lazy">`:`<div class="no-photo">${esc(t('noPhoto'))}</div>`}</div><div class="brand">${esc(brandLabel(f))}</div><div class="product-name">${esc(f.base_name)}</div><div class="price-line"><strong>${f.variants>1&&f.minPrice!==f.maxPrice?esc(t('family.from',{v:usd(f.minPrice)})):usd(f.minPrice)}</strong></div><small class="meta">${esc(categoryLabel(f.category??'기타'))}${f.variants>1?' · '+esc(t('family.options',{n:f.variants})):''}</small></button></article>`;
// Variant list of one family: size / option, price, unit price, best-value badge and a heart per variant.
function variantRows(list,ref=null){
  const tracked=new Map(products.map(p=>[p.sku,p.id]));
  return list.map(v=>{const id=tracked.get(v.sku),href=buyUrl(v,ref);return `<article class="variant-row"><div><strong>${esc([v.size_label,v.option_label].filter(Boolean).join(' · ')||t('family.default'))}</strong>${v.bestValue?`<span class="best-tag">${esc(t('badge.bestValue'))}</span>`:''}<small>${v.unitPrice!=null?esc(t('unit.price',{v:usd(v.unitPrice),u:unitName(v.unit)})):''}</small></div><b>${usd(v.price)}</b>${href?`<a class="variant-buy observed-buy" href="${esc(href)}" target="_blank" rel="sponsored noopener noreferrer" data-sku="${esc(v.sku)}" data-ref="${esc(ref??'')}">${esc(t('variant.buy'))}</a>`:''}${id?`<button class="variant-heart" data-favorite="${esc(id)}" aria-pressed="${state.favorites.includes(id)}" aria-label="${esc(t('favorites'))}">${state.favorites.includes(id)?'♥':'♡'}</button>`:`<button class="variant-heart" data-catalog-save="${esc(remember(v))}" data-retailer="${esc(v.retailer)}" data-market="${esc(v.market)}" aria-label="${esc(t('save.action'))}">♡</button>`}</article>`}).join('');
}
async function openFamily(key,ref=null){
  const dlg=$('#family-dialog');$('#family-body').innerHTML=`<p class="empty">${esc(t('loading'))}</p>`;$('#family-talk').innerHTML='';dlg.showModal();
  try{const list=await fetchFamily(key);const head=list[0];$('#family-title').textContent=head?brandLabel(head):'';
    $('#family-name').textContent=head?.name?.split(' - ')[0]??'';$('#family-body').innerHTML='<div id="family-description"></div>'+variantRows(list,ref);if(head)renderProductInfo($('#family-description'),head);track('product_view',null,{family:key,variants:list.length,...(ref?{from:ref}:{})});renderProductTalk($('#family-talk'),key)}
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
const TABS=['saved','search','chat'];
let screen='chat',lastTab='chat',detailReturn='chat';
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
  if(n==='chat')openChat({toast,onClose:()=>show('chat')});
}
// Popular-brand strip: round badges like a delivery app's brand grid; tapping one opens that brand's page.
let brands=[];
const brandBadge=b=>`<span style="background:${brandColor(b.brand)}">${esc(brandInitials(b.brand))}</span>${b.logo_url?`<img src="${esc(b.logo_url)}" alt="" loading="lazy">`:''}`;
// Keep initials visible under a logo while loading and after an image/network failure.
document.addEventListener('error',e=>{if(e.target.matches?.('.brand-item img,.brand-badge-lg img'))e.target.remove()},true);
function renderBrands(){const box=$('#brands');if(!brands.length){box.hidden=true;return}box.hidden=false;
  box.innerHTML=`<h2>${esc(t('brands.title'))}</h2><div class="brand-grid">${twoRowOrder(brands).map(b=>`<button class="brand-item" data-brand="${esc(b.brand)}"><i>${brandBadge(b)}</i><small>${esc(brandLabel(b))}</small></button>`).join('')}</div>`}
const brandPage={brand:null,items:[],done:false,loading:false,failed:false,seq:0};let brandObserver;
function openBrand(name){Object.assign(brandPage,{brand:name,items:[],done:false,failed:false,seq:brandPage.seq+1});show('brand');renderBrandPage();track('search',null,{brand:name})}
function renderBrandPage(){
  const b=brands.find(x=>x.brand===brandPage.brand)??{brand:brandPage.brand,brand_ko:null};
  $('#brand').innerHTML=`<div class="page-bar"><button class="icon-btn" data-screen="home" aria-label="${esc(t('back'))}">${icon.back}</button></div><div class="brand-hero"><i class="brand-badge-lg">${brandBadge(b)}</i><div><h1>${esc(brandLabel(b))}</h1>${b.families?`<p>${esc(t('count',{n:b.families}))}</p>`:''}</div></div><div class="catalog-grid">${brandPage.items.map(familyCard).join('')}</div>${brandPage.failed?`<p class="empty" role="status">${esc(t('loadFailed'))} <button data-brand-retry>${esc(t('retry'))}</button></p>`:brandPage.done?(brandPage.items.length?'':`<p class="empty">${esc(t('brand.empty'))}</p>`):`<p class="empty" id="brand-more">${esc(t('loading'))}</p>`}`;
  brandObserver?.disconnect();const more=$('#brand-more');if(!more)return;
  if(!brandPage.items.length){loadBrandPage();return}
  brandObserver=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))loadBrandPage()},{rootMargin:'600px'});brandObserver.observe(more);
}
async function loadBrandPage(){
  if(brandPage.loading||brandPage.done)return;brandPage.loading=true;const seq=brandPage.seq;
  try{const page=await fetchFamiliesPage('전체',brandPage.items.length,24,fetch,brandPage.brand);if(seq===brandPage.seq){brandPage.items.push(...page);if(page.length<24)brandPage.done=true}}
  catch{if(seq===brandPage.seq)brandPage.failed=true}
  finally{brandPage.loading=false}
  if(seq!==brandPage.seq){if(screen==='brand')loadBrandPage();return}
  if(screen==='brand')renderBrandPage();
}
// Saved (관심상품): favorites in a 3-column grid, padded with "+ Add" slots until there are three.
const savedCard=p=>`<article class="saved-card"><button class="product-open" data-product="${esc(p.id)}"><div class="visual">${art(p)}</div><div class="brand">${esc(brandLabel(p))}</div><div class="product-name">${esc(p.name)}</div><strong>${usd(p.price)}</strong></button><button class="heart" data-favorite="${esc(p.id)}" aria-label="${esc(t('favorites'))}" aria-pressed="true">♥</button></article>`;
function renderSaved(){
  const list=products.filter(p=>state.favorites.includes(p.id)),n=list.length;
  const hint=n===0?t('saved.hint'):n<3?t('saved.hintMore',{n:3-n}):t('saved.count',{n});
  $('#saved').innerHTML=`<div class="page-head"><h1>${esc(t('nav.activity'))}</h1><button class="icon-btn" data-screen="settings" aria-label="${esc(t('settings.open'))}">${icon.gear}</button></div><section id="activity-conversations"></section><h2>${esc(t('activity.saved'))}</h2><p class="page-sub">${esc(hint)}</p><div class="saved-grid">${list.map(savedCard).join('')}${Array.from({length:Math.max(0,3-n)},(_,i)=>`<button class="add-slot${i===0?' first':''}" data-screen="search">${icon.plus}<span>${esc(t('saved.add'))}</span></button>`).join('')}</div>${readSavedPosts().length?`<h3 class="chat-section">${esc(t('saved.posts'))}</h3>${readSavedPosts().map(p=>`<button class="post-row" data-post="${p.id}"><span class="post-main"><span class="post-kind k-${esc(p.kind)}">${esc(t('community.kind.'+p.kind))}</span><b>${esc(p.title)}</b></span></button>`).join('')}`:''}`;
  renderMyConversations($('#activity-conversations'));
}
// Settings, laid out like the competitor's: grouped rows with line icons and gray hint boxes.
const row=(ic,label,attrs='',tail=icon.chevron)=>`<button class="set-row" ${attrs}><span class="set-ico">${ic}</span><span class="set-label">${esc(label)}</span><span class="set-tail">${tail}</span></button>`;
// Optional Google account; saved items and settings stay on this device either way.
const auth=new GoogleAuth();
async function authAction(a){
  try{
    if(a==='google'){await auth.startGoogleLogin();return}
    await auth.signOut();renderSettings();toast(t('account.signedOut'));
  }catch(error){toast(error?.message||t('account.failed'))}
}
function renderSettings(){
  $('#settings').innerHTML=`<div class="page-bar"><button class="icon-btn" data-screen="saved" aria-label="${esc(t('back'))}">${icon.back}</button><h1>${esc(t('settings.title'))}</h1></div>
<section class="set-group"><h3>${esc(t('account.title'))}</h3>${auth.user?`<div class="account-card"><span class="account-avatar">${esc((auth.user.email||'?').slice(0,1).toUpperCase())}</span><span><b>${esc(auth.user.email||'')}</b><em>${esc(t('account.signedIn'))}</em></span></div><button class="auth-button secondary" data-auth="signout">${esc(t('account.signout'))}</button>`:`<button class="auth-button" data-auth="google"><span class="google-mark">G</span>${esc(t('account.google'))}</button><p class="set-hint">${esc(t('account.localDataHint'))}</p>`}</section>
<section class="set-group"><h3>${esc(t('settings.service'))}</h3>
<div class="set-row static"><span class="set-ico">${icon.globe}</span><span class="set-label">${esc(t('settings.language'))}</span><span class="seg"><button data-lang="ko" class="${lang==='ko'?'on':''}">한국어</button><button data-lang="en" class="${lang==='en'?'on':''}">English</button></span></div><p class="set-hint">${esc(t('settings.languageHint'))}</p></section>
<section class="set-group"><h3>${esc(t('settings.data'))}</h3>${row(icon.tray,t('settings.clearSaved'),'data-set="clear-saved"')}${row(icon.trash,t('settings.clearCache'),'data-set="clear-cache"')}</section>
<section class="set-group"><h3>${esc(t('settings.support'))}</h3><button class="feedback-card" data-set="soon"><span class="set-ico">${icon.chat}</span><span><b>${esc(t('settings.feedback'))}</b><em>${esc(t('settings.feedbackSub'))}</em></span></button>${row(icon.doc,t('settings.terms'),'data-set="soon"')}${row(icon.lock,t('settings.privacy'),'data-set="soon"')}<div class="set-row static"><span class="set-ico">${icon.info}</span><span class="set-label">${esc(t('settings.version',{v:'web 1.0'}))}</span></div></section>`;
}
async function settingsAction(a){
  if(a==='soon'){toast(t('settings.soon'));return}
  if(a==='clear-saved'){if(!confirm(t('settings.clearSavedConfirm')))return;state={favorites:[],targets:{}};save();renderList();toast(t('settings.cleared'));return}
  if(a==='clear-cache'){try{for(const k of await caches.keys())await caches.delete(k)}catch{}try{sessionStorage.clear()}catch{}toast(t('settings.cacheCleared'));setTimeout(()=>location.reload(),700)}
}
// Search has its own screen: available products that match, then the whole catalog.
function renderSearch(){
  const q=$('#search').value.trim(),box=$('#search-results');
  if(!q){box.innerHTML=`<button class="explore-link" data-screen="home">${esc(t('section.products'))} ${icon.chevron}</button><p class="empty search-empty">${esc(t('search.recentEmpty'))}</p>`;return}
  const items=search(products,q,'전체');
  box.innerHTML=(items.length?`<div class="heading"><div><h2>${esc(t('section.products'))}</h2></div><span>${esc(t('count',{n:items.length}))}</span></div><div class="product-grid">${items.map(card).join('')}</div>`:'')+'<div id="search-catalog" class="catalog-results"></div>';
  if(q.length>=2)renderCatalogSearch(q);
}
function updateCount(){const n=state.favorites.length;$('#count').textContent=n;$('#count').hidden=!n}
// Home: available products, then the Korean-brand catalog by category.
function renderList(){
  const items=search(products,'',category);
  updateCount();
  $('#list-title').textContent=t('section.products');
  $('#result-count').textContent=t('count',{n:items.length});
  $('#products').innerHTML=(items.length?items.map(card).join(''):`<p class="empty">${esc(t('empty.category'))}</p>`)+'<div id="catalog-results" class="catalog-results"></div>';
  renderCatalogBrowse(true);
  if(screen==='saved')renderSaved();
}
// Whole-catalog search: save the catalog snapshot locally, without enrolling price tracking.
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
function saveCatalogSelection(b){
  try{const item=catalogItems.get(b.dataset.catalogSave);if(!item)throw Error('missing item');
    const p=saveCatalogSnapshot(item,storage);products=mergeCatalogSaves(products,readCatalogSaves(storage));
    if(!state.favorites.includes(p.id))toggleFavorite(state,p.id);save();track('wishlist_add',p.id,{from:'catalog'});
    b.outerHTML=`<button class="variant-heart" data-favorite="${esc(p.id)}" aria-label="${esc(t('favorites'))}" aria-pressed="true">♥</button>`;
    renderList();if(screen==='search')renderSearch();toast(t('toast.saved'));
  }catch{toast(t('toast.saveFailed'))}
}

function renderDetail(){
  const p=product(selected),fav=state.favorites.includes(p.id);
  const shipping=p.delivery==null?t('unknown'):usd(p.delivery);
  $('#detail').innerHTML=`<div class="detail-nav"><button id="back" aria-label="${esc(t('back'))}">←</button><strong>${esc(t('detail.title'))}</strong><button data-favorite="${esc(p.id)}" aria-label="${esc(t('favorites'))}">${fav?'♥':'♡'}</button></div><div class="detail-product"><div class="detail-art">${art(p)}</div><div class="price-summary"><small>${esc(t('detail.usPrice',{retailer:p.retailer}))}</small><div class="current"><strong>${usd(p.price)}</strong></div><p class="price-baseline">${esc(p.checkedAt?t('detail.checked',{checked:kstDate(p.checkedAt)}):t('catalog.savedSnapshot'))}</p><h1>${esc(p.name)}</h1><p class="product-meta">${esc(brandLabel(p))}${p.size?' · '+esc(p.size):''} · ${esc(categoryLabel(p.category))}</p><div class="info-chips"><span>${stock(p)}</span><span>${esc(t('detail.shippingChip',{v:shipping}))}</span></div></div></div><section id="detail-description" class="offer-section"></section><section class="offer-section other-sizes" id="other-sizes" hidden></section><section class="offer-section"><div class="offer-heading"><h2>${esc(t('detail.retailer'))}</h2><small>${esc(t('detail.officialFeed'))}</small></div><article class="seller-row"><div class="seller-info"><strong>${esc(p.retailer)}</strong><small>${esc(t('detail.feedShipping',{v:shipping}))}</small></div><div class="seller-price"><strong>${usd(p.price)}</strong><small>${stock(p)}</small></div><a class="observed-buy" href="${esc(buyUrl(p)??p.url)}" target="_blank" rel="sponsored noopener noreferrer">${esc(t('buy.at',{retailer:p.retailer}))}</a></article><p class="chart-note">${esc(t('detail.disclaimer'))}</p></section><section class="offer-section product-talk" id="detail-talk"></section><div class="detail-actions"><button data-favorite="${esc(p.id)}" class="save-action">${fav?'♥':'♡'}<small>${esc(t('save.short'))}</small></button><a class="primary buy-cta observed-buy" href="${esc(buyUrl(p)??p.url)}" target="_blank" rel="sponsored noopener noreferrer">${esc(t('buy.at',{retailer:p.retailer}))}</a></div>`;
  loadOtherSizes(p);renderProductInfo($('#detail-description'),p);renderProductTalk($('#detail-talk'),p.familyKey);
  $('#back').onclick=closeDetail;
}
function closeDetail(){detailOpen=false;show(detailReturn)}
function openDetail(id){selected=id;track('product_view',id);detailOpen=true;detailReturn=screen;renderDetail();show('detail')}

localizePage();
show('chat');
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.openRoom){openRoomNext(b.dataset.openRoom);show('chat');return}
  if(b.dataset.catalogSave){saveCatalogSelection(b);return}
  if(b.dataset.family){if(b.dataset.ref)track('product_card_click',null,{family:b.dataset.family,from:b.dataset.ref});openFamily(b.dataset.family,b.dataset.ref||null);return}
  if(b.dataset.post&&screen!=='chat'){$('#family-dialog').open&&$('#family-dialog').close();openPostNext(+b.dataset.post);show('chat');return}
  if(b.dataset.brand){openBrand(b.dataset.brand);return}
  if('brandsRetry' in b.dataset){loadBrandStrip();return}
  if('brandRetry' in b.dataset){brandPage.failed=false;renderBrandPage();return}
  if(b.dataset.auth){authAction(b.dataset.auth);return}
  if(b.dataset.screen){show(b.dataset.screen);return}
  if(b.dataset.set){settingsAction(b.dataset.set);return}
  if(b.dataset.lang){try{localStorage.setItem('alimi-lang',b.dataset.lang)}catch{}location.href='?lang='+b.dataset.lang;return}
  if(b.dataset.product)openDetail(b.dataset.product);
  if(b.dataset.favorite){toggleFavorite(state,b.dataset.favorite);track(state.favorites.includes(b.dataset.favorite)?'wishlist_add':'wishlist_remove',b.dataset.favorite);save();renderList();if(screen==='search')renderSearch();if(detailOpen)renderDetail()}
  if(b.dataset.category){category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x.dataset.category===category));renderList()}});
let searchTimer;$('#search').oninput=()=>{renderSearch();clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const q=$('#search').value.trim();if(q)track('search',null,{length:q.length,results:search(products,q).length})},1200)};$('#clear').onclick=()=>{$('#search').value='';renderSearch();$('#search').focus()};
$('#browse-now').onclick=()=>$('.results').scrollIntoView({behavior:'smooth'});
$('#reset').onclick=()=>{if(confirm(t('reset.confirm'))){state={favorites:[],targets:{}};save();renderList()}};
document.addEventListener('click',e=>{const a=e.target.closest('a.observed-buy');if(!a)return;if(a.dataset.sku)track('merchant_click',null,{sku:a.dataset.sku,from:a.dataset.ref||'options'});else if(selected)track('merchant_click',selected,{retailer:product(selected)?.retailer,from:a.classList.contains('buy-cta')?'detail_cta':'detail_retailer'})});
document.addEventListener('error',e=>{if(e.target.matches?.('.room-ico img')){e.target.remove();return}if(e.target.tagName==='IMG'&&!e.target.matches('.brand-item img,.brand-badge-lg img')){const box=document.createElement('div');box.className='no-photo';box.textContent=t('photoFailed');e.target.replaceWith(box)}},true);

async function loadBrandStrip(){
  const box=$('#brands');box.hidden=false;box.setAttribute('aria-busy','true');
  box.innerHTML=`<h2>${esc(t('brands.title'))}</h2><p role="status">${esc(t('loading'))}</p>`;
  try{brands=await fetchBrands();renderBrands()}
  catch{box.innerHTML=`<h2>${esc(t('brands.title'))}</h2><p role="status">${esc(t('loadFailed'))} <button data-brands-retry>${esc(t('retry'))}</button></p>`}
  finally{box.setAttribute('aria-busy','false')}
}
loadBrandStrip();
$('#products').innerHTML=`<p class="empty">${esc(t('loadingPrices'))}</p>`;
loadProducts().then(({products:list,source,exportedAt})=>{
  products=mergeCatalogSaves(list,readCatalogSaves(storage));
  $('#categories').innerHTML=['전체',...CATEGORIES].map(c=>`<button class="chip ${c==='전체'?'active':''}" data-category="${c}">${esc(categoryLabel(c))}</button>`).join('');
  if(products[0])$('#hero-art').innerHTML=art(products.find(p=>p.sku==='10759')??products[0]);
  const latest=products.map(p=>p.checkedAt).filter(Boolean).sort().at(-1);
  $('.notice').textContent=source==='live'?t('notice.live',{date:latest?kstDate(latest):''}):t('notice.offline',{date:exportedAt?kstDate(exportedAt):''});
  renderList();
  track('home_view',null,{source,lang});

}).catch(()=>{$('#products').innerHTML=`<p class="empty">${esc(t('loadFailed'))}</p>`});
auth.handleCallback().catch(error=>{const clean=new URL(location.href);for(const key of ['code','state','error','error_description'])clean.searchParams.delete(key);history.replaceState({},'',clean.toString());toast(error?.message||t('account.failed'))}).finally(()=>auth.restore().then(()=>{if(screen==='settings')renderSettings()}));
