import {rankProducts,productSortControls,setProductSort,loadProductStats} from './product-sort.js';
import {loadingMarkup} from './loading-companion.js';
import {renderProductInfo} from './product-info.js';
import {readCatalogSaves,saveCatalogSnapshot,mergeCatalogSaves} from './saved-catalog.js';
import {track} from './events.js';
import {GoogleAuth} from './auth.js';
import {openProfile,refreshProfile,cachedProfile,optOutOfSale} from './profile.js';
import {openProductRoomsNext,openRoomListNext,openChat,leaveChat,renderProductTalk,openPostNext,readSavedPosts,openRoomNext,renderMyConversations,canAttachToChat,attachToChat,onboardingData} from './chat.js';
import {renderMyRooms,renderAlerts,renderShareHub,addRecent,readRecent,loadRevisit,unreadCount} from './revisit.js';
import {t,lang,locale,categoryLabel} from './i18n.js';
import {readInterests,openOnboarding} from './onboarding.js';
import {share,shareUrl,sharedTarget} from './share.js';
import {buyUrl,loadProducts,searchCatalog,fetchFamiliesPage,fetchBrands,brandInitials,brandColor,twoRowOrder,fetchFamily,unitName,CATEGORIES,brandLabel,search,usd,readState,writeState,toggleFavorite} from './live.js';
import {$,esc} from './util.js';
let storage;try{storage=localStorage}catch{}
let state=readState(storage),products=[],selected=null,category='전체',timer,detailOpen=false;
const product=id=>products.find(p=>p.id===id);
const kstDate=iso=>new Intl.DateTimeFormat(locale(),{timeZone:'Asia/Seoul',month:lang==='ko'?'long':'short',day:'numeric'}).format(new Date(iso));
const stock=p=>t(p.availability==='in_stock'?'stock.in':p.availability==='out_of_stock'?'stock.out':'stock.unknown');
function toast(m){$('#toast').textContent=m;$('#toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('show'),2500)}
function save(){try{writeState(storage,state)}catch{toast(t('saveLocalOnly'))}}
const bookmark = on => `<svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" style="fill:${on?'currentColor':'none'};stroke:currentColor;stroke-width:1.8"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`;
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
const card=p=>`<article class="card"><button class="product-open" data-product="${esc(p.id)}"><div class="visual">${art(p)}</div><div class="brand">${esc(brandLabel(p))}</div><div class="product-name">${esc(p.name)}</div><div class="price-line"><strong>${usd(p.price)}</strong></div><small class="meta">${esc(categoryLabel(p.category))}</small><div class="delivery">${esc(p.retailer)} · ${stock(p)}</div></button><button class="heart" data-favorite="${esc(p.id)}" aria-label="${esc(t('favorites'))}" aria-pressed="${state.favorites.includes(p.id)}">${bookmark(state.favorites.includes(p.id))}</button></article>`;
const catalogCard=c=>`<article class="card"><div class="visual">${c.image_url?`<img src="${esc(c.image_url)}" alt="${esc(brandLabel(c)+' '+c.name)}" loading="lazy">`:`<div class="no-photo">${esc(t('noPhoto'))}</div>`}</div><div class="brand">${esc(brandLabel(c))}</div><div class="product-name">${esc(c.name)}</div><div class="price-line"><strong>${usd(c.price)}</strong></div><small class="meta">${esc(categoryLabel(c.category??'기타'))} · ${esc(t('todayPrice'))}</small><button class="heart" data-catalog-save="${esc(remember(c))}" data-retailer="${esc(c.retailer)}" data-market="${esc(c.market)}" aria-label="${esc(t('save.action'))}">${bookmark(false)}</button></article>`;
const familyCard=f=>`<article class="card"><button class="product-open" data-family="${esc(f.family_key)}" data-sku="${esc(f.sku??'')}" data-retailer="${esc(f.retailer??'')}" data-market="${esc(f.market??'')}" data-ref="${esc(f.ref??'recent')}"><div class="visual">${f.image_url?`<img src="${esc(f.image_url)}" alt="${esc(brandLabel(f)+' '+f.base_name)}" loading="lazy">`:`<div class="no-photo">${esc(t('noPhoto'))}</div>`}</div><div class="brand">${esc(brandLabel(f))}</div><div class="product-name">${esc(f.base_name)}</div><div class="price-line"><strong>${f.variants>1&&f.minPrice!==f.maxPrice?esc(t('family.from',{v:usd(f.minPrice)})):usd(f.minPrice)}</strong></div><small class="meta">${esc(categoryLabel(f.category??'기타'))}${f.variants>1?' · '+esc(t('family.options',{n:f.variants})):''}</small></button></article>`;
// Variant list of one family: size / option, price, unit price, best-value badge and a heart per variant.
function variantRows(list,ref=null){
  const tracked=new Map(products.map(p=>[p.sku,p.id]));
  return list.map(v=>{const id=tracked.get(v.sku),href=buyUrl(v,ref);return `<article class="variant-row"><div><strong>${esc([v.size_label,v.option_label].filter(Boolean).join(' · ')||t('family.default'))}</strong>${v.bestValue?`<span class="best-tag">${esc(t('badge.bestValue'))}</span>`:''}<small>${v.unitPrice!=null?esc(t('unit.price',{v:usd(v.unitPrice),u:unitName(v.unit)})):''}</small></div><b>${usd(v.price)}</b>${href?`<a class="variant-buy observed-buy" href="${esc(href)}" target="_blank" rel="sponsored noopener noreferrer" data-sku="${esc(v.sku)}" data-ref="${esc(ref??'')}">${esc(t('variant.buy'))}</a>`:''}${id?`<button class="variant-heart" data-favorite="${esc(id)}" aria-pressed="${state.favorites.includes(id)}" aria-label="${esc(t('favorites'))}">${state.favorites.includes(id)?'♥':'♡'}</button>`:`<button class="variant-heart" data-catalog-save="${esc(remember(v))}" data-retailer="${esc(v.retailer)}" data-market="${esc(v.market)}" aria-label="${esc(t('save.action'))}">${bookmark(false)}</button>`}</article>`}).join('');
}
// Product page (journey 2): a photo per option with counter and strip, brand / name / save / price, facts the
// catalog really has (options, sellers, best unit price, category), 대화에 첨부 from a live room or the seller link.
let familyHead=null,familyList=[],familyPhoto=0,familySelection=0,familyRef=null,familyVersion=0;
const familyPhotos=()=>[...new Set(familyList.map(v=>v.image_url).filter(Boolean))];
const familyCurrent=()=>familyList[familySelection];
const savedOption=v=>products.find(p=>p.sku===v.sku&&p.retailer===v.retailer&&(!p.market||p.market===v.market));
function drawFamilyHero(){
  const photos=familyPhotos(),cur=familyCurrent();
  $('#family-hero').innerHTML=cur?.image_url?`<div class="fh-main"><img src="${esc(cur.image_url)}" alt="${esc(cur.name)}"></div>${photos.length>1?`<div class="fh-thumbs">${photos.map((u,i)=>`<button class="${u===cur.image_url?'on':''}" data-family-photo="${i}" aria-label="${i+1}/${photos.length}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>`:''}`:'';
}
function drawFamilySelection(){
  const cur=familyCurrent();if(!cur)return;
  drawFamilyHero();
  $('#family-price').textContent=usd(cur.price);
  $('#family-option').textContent=[cur.size_label,cur.option_label].filter(Boolean).join(' · ')||t('family.default');
  const id=savedOption(cur)?.id,on=Boolean(id&&state.favorites.includes(id));
  document.querySelectorAll('[data-family-option]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.familyOption===familySelection)));
  const href=cur.availability==='out_of_stock'?null:buyUrl(cur,familyRef);
  $('#family-actions').innerHTML=`<button class="family-save heart" data-family-save aria-label="${esc(t('save.action'))}"></button>`+(canAttachToChat()||brandChat?`<button class="primary family-attach" data-family-attach>${esc(t('family.attach'))}</button>`:'')+(href?`<a class="primary family-buy variant-buy observed-buy" href="${esc(href)}" target="_blank" rel="sponsored noopener noreferrer" data-sku="${esc(cur.sku)}" data-retailer="${esc(cur.retailer)}" data-market="${esc(cur.market)}" data-ref="${esc(familyRef??'')}">${esc(t('product.buy',{seller:cur.retailer}))}</a>`:`<p role="status">${esc(t(cur.availability==='out_of_stock'?'stock.out':'catalogFailed'))}</p>`);
  const button=$('[data-family-save]');button.innerHTML=bookmark(on);button.setAttribute('aria-pressed',String(on));
  renderProductInfo($('#family-description'),cur);
  addRecent({family_key:cur.family_key,sku:cur.sku,retailer:cur.retailer,market:cur.market,ref:familyRef,brand:cur.brand,brand_ko:cur.brand_ko,name:cur.name,category:cur.category,image_url:cur.image_url,min_price_minor:cur.price_minor});
}
async function openFamily(key,ref=null,option={}){
  const version=++familyVersion,dlg=$('#family-dialog');familyList=[];familyHead=null;familyRef=ref;familySelection=0;
  $('#family-hero').innerHTML='';$('#family-title').textContent='';$('#family-name').textContent='';$('#family-body').innerHTML=loadingMarkup(t('loading'));$('#family-talk').innerHTML='';if(!dlg.open)dlg.showModal();
  try{const list=await fetchFamily(key);if(version!==familyVersion||!dlg.open)return;
    if(!list.length){$('#family-body').innerHTML=`<p class="empty">${esc(t('empty.products'))}</p>`;return;}
    familyList=list;familySelection=Math.max(0,list.findIndex(v=>v.sku===option.sku&&(!option.retailer||v.retailer===option.retailer)&&(!option.market||v.market===option.market)));const head=familyCurrent();familyHead=head;
    $('#family-title').innerHTML=`<button class="text-link" data-family-brand="${esc(head.brand)}">${esc(brandLabel(head))} ›</button>`;$('#family-name').textContent=head.name?.split(' - ')[0]??'';
    const sellers=new Set(list.map(v=>v.retailer)).size,unit=list.filter(v=>v.unitPrice!=null).sort((a,b)=>a.unitPrice-b.unitPrice)[0];
    const facts=[['options',t('product.fact.options'),t('product.fact.count',{n:list.length})],['sellers',t('product.fact.sellers'),t('product.fact.places',{n:sellers})],['unit',t('product.fact.unit'),unit?usd(unit.unitPrice)+'/'+unitName(unit.unit):'—'],['category',t('product.fact.category'),head.category?categoryLabel(head.category):'—']];
    $('#family-body').innerHTML=`<div class="family-price-row"><b id="family-price"></b><button class="family-share" data-family-share="${esc(key)}" aria-label="${esc(t('share.product'))}">${esc(t('share.product'))}</button></div><p id="family-option"></p>${list.length>1?`<div class="family-options">${list.map((v,i)=>`<button class="variant-row" data-family-option="${i}" aria-pressed="false"><strong>${esc([v.size_label,v.option_label].filter(Boolean).join(' · ')||t('family.default'))}</strong><small>${esc(v.retailer)}</small><b>${usd(v.price)}</b></button>`).join('')}</div>`:''}<div class="family-facts" data-product-facts>${facts.map(f=>`<div><i class="ff-${f[0]}" aria-hidden="true"></i><small>${esc(f[1])}</small><b>${esc(f[2])}</b></div>`).join('')}</div><button class="text-link product-room-entry" data-product-rooms="${esc(head.name)}">${esc(t('rooms.productTalk'))} ›</button><div id="family-description"></div><p class="chart-note">${esc(t('detail.disclaimer'))}</p><div id="family-actions"></div>`;
    drawFamilySelection();track('product_view',null,{family:key,sku:head.sku,from:ref??'catalog'});renderProductTalk($('#family-talk'),key);
  }catch{if(version===familyVersion&&dlg.open)$('#family-body').innerHTML=`<p class="empty">${esc(t('catalogFailed'))}</p>`;}
}
async function loadOtherSizes(p){
  const box=$('#other-sizes');if(!box||!p.familyKey)return;
  try{const list=(await fetchFamily(p.familyKey));if(list.length<2||selected!==p.id)return;box.innerHTML=`<h2>${esc(t('family.otherSizes'))}</h2><button class="text-link" data-family="${esc(p.familyKey)}" data-sku="${esc(p.sku)}" data-ref="${esc(p.sourceRef??'saved')}">${esc(t('family.options',{n:list.length}))}</button>`;box.hidden=false}catch{}
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
const TABS=['chat','search','saved'];
let screen='chat',lastTab='chat',detailReturn='chat';
const screenEl=n=>n==='home'?$('#browse'):n==='search'?$('#search-screen'):$('#'+n);
let brandChat = false, detailChat=false;
function show(n){
  const resumeChat = (brandChat||detailChat) && n === 'chat';
  if(detailChat&&!['detail','chat'].includes(n)){leaveChat();detailChat=false;}
  if (brandChat && !['brand','chat'].includes(n)) { leaveChat(); brandChat = false; }
  if(n==='rooms'){activityTab='rooms';n='saved'}
  if(screen==='chat'&&n!=='chat'&&!brandChat&&!detailChat)leaveChat();
  for(const s of ['home','saved','search','brand','settings','detail','chat','rooms','alerts','share'])screenEl(s).hidden=s!==n;
  screen=n;if(TABS.includes(n))lastTab=n;
  $('#tabbar').hidden=n==='detail';
  document.querySelectorAll('#tabbar [data-screen]').forEach(x=>x.classList.toggle('active',x.dataset.screen===lastTab));
  window.scrollTo(0,0);
  if(n==='saved')renderSaved();
  if(n==='settings')renderSettings();
  if(n==='search'){renderSearch();setTimeout(()=>$('#search').focus(),0)}
  if(n==='chat'&&!resumeChat)openChat({toast,onClose:()=>show('chat')});
  if(n==='rooms')renderMyRooms($('#rooms'),{savedFamilies:savedFamilies()});
  if(n==='alerts'){renderAlerts($('#alerts'),{savedFamilies:savedFamilies(),returnScreen:lastTab}).then(()=>setAlertBadge(0))}
  if (resumeChat) {brandChat = false;detailChat=false;}
  if(n==='share'){renderShareHub($('#share'),{saved:savedFamilies()});loadRevisit({}).then(d=>{if(screen==='share')renderShareHub($('#share'),{rooms:d.activity.map(a=>a.room),saved:savedFamilies()})},()=>{})}
}
// Popular-brand strip: round badges like a delivery app's brand grid; tapping one opens that brand's page.
let brands=[];
const brandBadge=b=>`<span style="background:${brandColor(b.brand)}">${esc(brandInitials(b.brand))}</span>${b.logo_url?`<img src="${esc(b.logo_url)}" alt="" loading="lazy">`:''}`;
// Keep initials visible under a logo while loading and after an image/network failure.
document.addEventListener('error',e=>{if(e.target.matches?.('.brand-item img,.brand-badge-lg img'))e.target.remove()},true);
function renderBrands(){const box=$('#brands');if(!brands.length){box.hidden=true;return}box.hidden=false;
  box.innerHTML=`<h2>${esc(t('brands.title'))}</h2><div class="brand-grid">${twoRowOrder(brands).map(b=>`<button class="brand-item" data-brand="${esc(b.brand)}"><i>${brandBadge(b)}</i><small>${esc(brandLabel(b))}</small></button>`).join('')}</div>`}
const brandPage={brand:null,items:[],done:false,loading:false,failed:false,seq:0};let brandObserver;
// Followed brands live on this device only.
const followedBrands=()=>{try{const v=JSON.parse(localStorage.getItem('seoulbeauty-brands-followed-v1'));return Array.isArray(v)?v:[]}catch{return[]}};
function toggleFollow(name){const list=followedBrands(),next=list.includes(name)?list.filter(x=>x!==name):[...list,name];try{localStorage.setItem('seoulbeauty-brands-followed-v1',JSON.stringify(next))}catch{}renderBrandPage()}
function openBrand(name){Object.assign(brandPage,{brand:name,items:[],done:false,failed:false,seq:brandPage.seq+1});show('brand');renderBrandPage();track('search',null,{brand:name})}
function renderBrandPage(){
  const b=brands.find(x=>x.brand===brandPage.brand)??{brand:brandPage.brand,brand_ko:null};
  const banner=brandPage.items[0]?.image_url,cats=[...new Set(brandPage.items.map(f=>f.category).filter(Boolean))].slice(0,4),following=followedBrands().includes(b.brand);
  $('#brand').innerHTML=`<div class="brand-banner">${banner?`<img src="${esc(banner)}" alt="">`:''}<button class="icon-btn round" data-screen="${brandChat?'chat':'home'}" aria-label="${esc(t('back'))}">${icon.back}</button><button class="icon-btn round right" data-brand-share aria-label="${esc(t('share.hubNav'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6h14v-6"/></svg></button></div><div class="brand-hero"><i class="brand-badge-lg">${brandBadge(b)}</i><div><h1>${esc(brandLabel(b))}</h1>${b.families?`<p>${esc(t('count',{n:b.families}))}</p>`:''}</div><button class="brand-follow${following?' on':''}" data-follow-brand="${esc(b.brand)}" aria-pressed="${following}">${esc(following?t('brand.following'):'+ '+t('brand.follow'))}</button></div><p class="brand-headline">${esc(t('brand.headline',{brand:brandLabel(b)}))}</p><p class="page-sub">${esc(t('brand.followNote'))}</p>${cats.length?`<div class="brand-tags">${cats.map(c=>`<span>#${esc(categoryLabel(c).replace(/\s+/g,''))}</span>`).join('')}</div>`:''}<div class="home-tabs brand-tabs"><button class="on" aria-selected="true">${esc(t('brand.tab.products'))}</button></div>${productSortControls()}<div class="catalog-grid">${rankProducts(brandPage.items).map(familyCard).join('')}</div>${brandPage.failed?`<p class="empty" role="status">${esc(t('loadFailed'))} <button data-brand-retry>${esc(t('retry'))}</button></p>`:brandPage.done?(brandPage.items.length?'':`<p class="empty">${esc(t('brand.empty'))}</p>`):`<p class="empty" id="brand-more">${esc(t('loading'))}</p>`}`;
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
// Interests chosen in the community guide; tapping reopens the guide there to change or clear them.
function interestRow(){
  const p=readInterests(),skin=cachedProfile()?.skin_type??p?.skinType;
  const list=[skin&&t('skin.'+skin),...(p?.concerns??[]).map(c=>t('onb.c.'+c))].filter(Boolean).slice(0,3);
  return `<button class="interest-row" data-activity-profile><span><b>${esc(t('activity.profile'))}</b><small>${esc(list.length?list.join(' · '):t('activity.profileHint'))}</small></span><span aria-hidden="true">›</span></button>`;
}
function openActivityProfile(){
  let dlg=$('#activity-profile-dialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='activity-profile-dialog';document.body.append(dlg)}
  dlg.innerHTML=`<form method="dialog"><button class="close-dialog" aria-label="${esc(t('close'))}">×</button></form><h2>${esc(t('activity.profile'))}</h2><button class="interest-row" data-activity-skin><span><b>${esc(t('profile.title'))}</b><small>${esc(t('activity.skinHint'))}</small></span><span aria-hidden="true">›</span></button><button class="interest-row" data-activity-interests><span><b>${esc(t('activity.interests'))}</b><small>${esc(t('activity.interestsHint'))}</small></span><span aria-hidden="true">›</span></button>`;dlg.showModal();
}
const activityEmpty=(message,kind)=>`<div class="activity-empty"><p>${esc(message)}</p><button class="text-link" data-activity-browse="${kind}">${esc(t(kind==='rooms'?'activity.browseRooms':'activity.browseProducts'))} ›</button></div>`;
let activityTab='saved';
// Recently viewed products on this device (revisit.js).
const recentList=()=>{const list=readRecent();return list.length?`${productSortControls()}<div class="recent-list">${rankProducts(list).map(f=>`<button class="recent-row" data-family="${esc(f.family_key)}" data-sku="${esc(f.sku??'')}" data-retailer="${esc(f.retailer??'')}" data-market="${esc(f.market??'')}" data-ref="${esc(f.ref??'recent')}">${f.image_url?`<img src="${esc(f.image_url)}" alt="" loading="lazy">`:'<span class="no-photo"></span>'}<span><b>${esc(brandLabel({brand:f.brand,brandKo:f.brand_ko}))} ${esc(f.base_name)}</b>${f.category?`<small>${esc(categoryLabel(f.category))}</small>`:''}${f.min_price_minor?`<strong>${usd(f.min_price_minor/100)}</strong>`:''}</span></button>`).join('')}</div>`:activityEmpty(t('activity.recentEmpty'),'products')};
// Products saved on this device that have a family key (for 알림 and 상품 공유).
const savedFamilies=()=>products.filter(p=>state.favorites.includes(p.id)&&p.familyKey).map(p=>({familyKey:p.familyKey,name:p.name}));
const setAlertBadge=n=>{document.documentElement.dataset.unreadAlerts=String(n>0)};
function renderSaved(){
  const list=rankProducts(products.filter(p=>state.favorites.includes(p.id))),n=list.length;
  const hint=n===0?t('saved.hint'):t('saved.count',{n});
  $('#saved').innerHTML=`<div class="logo-head activity-head"><h1 class="page-title">${esc(t('nav.activity'))}</h1><span><button class="icon-btn" data-screen="search" aria-label="${esc(t('search.title'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button><button class="icon-btn" data-screen="alerts" aria-label="${esc(t('alerts.title'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></button><button class="icon-btn" data-screen="settings" aria-label="${esc(t('settings.open'))}">${icon.gear}</button></span></div><div class="home-tabs activity-tabs" role="tablist" aria-label="${esc(t('nav.activity'))}">${['saved','rooms','recent'].map(k=>`<button role="tab" id="activity-tab-${k}" data-activity-tab="${k}" aria-selected="${activityTab===k}" class="${activityTab===k?'on':''}">${esc(t('activity.tab.'+k))}</button>`).join('')}</div><div role="tabpanel" aria-labelledby="activity-tab-${activityTab}">${activityTab==='rooms'?'<section id="activity-conversations"></section>':activityTab==='recent'?recentList():`${n===0?activityEmpty(t('activity.savedEmpty'),'products'):productSortControls()+`<div class="saved-grid">${list.map(savedCard).join('')}</div>`}${readSavedPosts().length?`<h3 class="chat-section">${esc(t('saved.posts'))}</h3>${readSavedPosts().map(p=>`<button class="post-row" data-post="${p.id}"><span class="post-main"><span class="post-kind k-${esc(p.kind)}">${esc(t('community.kind.'+p.kind))}</span><b>${esc(p.title)}</b></span></button>`).join('')}`:''}`}</div>${interestRow()}`;
  if(activityTab==='rooms')renderMyConversations($('#activity-conversations'));
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
<section class="set-group"><h3>${esc(t('account.title'))}</h3>${auth.user?`<div class="account-card"><span><b>${esc(auth.user.email||'')}</b><em>${esc(t('account.signedIn'))}</em></span></div><button class="auth-button secondary" data-auth="signout">${esc(t('account.signout'))}</button>`:`<button class="auth-button" data-auth="google"><span class="google-mark">G</span>${esc(t('account.google'))}</button><p class="set-hint">${esc(t('account.localDataHint'))}</p>`}</section>
<section class="set-group"><h3>${esc(t('settings.service'))}</h3>
<div class="set-row static"><span class="set-ico">${icon.globe}</span><span class="set-label">${esc(t('settings.language'))}</span><span class="seg"><button data-lang="ko" class="${lang==='ko'?'on':''}">한국어</button><button data-lang="en" class="${lang==='en'?'on':''}">English</button></span></div><p class="set-hint">${esc(t('settings.languageHint'))}</p></section>
<section class="set-group"><h3>${esc(t('settings.data'))}</h3>${row(icon.lock,t('profile.title'),'data-profile-open')}${row(icon.lock,t('profile.doNotSell'),'data-set="do-not-sell"')}${row(icon.tray,t('settings.clearSaved'),'data-set="clear-saved"')}${row(icon.trash,t('settings.clearCache'),'data-set="clear-cache"')}</section>
<section class="set-group"><h3>${esc(t('settings.support'))}</h3><button class="feedback-card" data-set="soon"><span class="set-ico">${icon.chat}</span><span><b>${esc(t('settings.feedback'))}</b><em>${esc(t('settings.feedbackSub'))}</em></span></button>${row(icon.doc,t('settings.terms'),'data-set="soon"')}${row(icon.lock,t('settings.privacy'),'data-set="soon"')}<div class="set-row static"><span class="set-ico">${icon.info}</span><span class="set-label">${esc(t('settings.version',{v:'web 1.0'}))}</span></div></section>`;
}
async function settingsAction(a){
  if(a==='soon'){toast(t('settings.soon'));return}
  if(a==='do-not-sell'){try{await optOutOfSale();toast(t('profile.doNotSellDone'))}catch{toast(t('profile.failed'))}return}
  if(a==='clear-saved'){if(!confirm(t('settings.clearSavedConfirm')))return;state={favorites:[],targets:{}};save();renderList();toast(t('settings.cleared'));return}
  if(a==='clear-cache'){try{for(const k of await caches.keys())await caches.delete(k)}catch{}try{sessionStorage.clear()}catch{}toast(t('settings.cacheCleared'));setTimeout(()=>location.reload(),700)}
}
// Search has its own screen: available products that match, then the whole catalog.
function renderSearch(){
  const q=$('#search').value.trim(),box=$('#search-results');
  if(!q){box.innerHTML=`<button class="explore-link" data-screen="home">${esc(t('section.products'))} ${icon.chevron}</button><p class="empty search-empty">${esc(t('search.recentEmpty'))}</p>`;return}
  const items=rankProducts(search(products,q,'전체'));
  box.innerHTML=productSortControls()+(items.length?`<div class="heading"><div><h2>${esc(t('section.products'))}</h2></div><span>${esc(t('count',{n:items.length}))}</span></div><div class="product-grid">${items.map(card).join('')}</div>`:'')+'<div id="search-catalog" class="catalog-results"></div>';
  if(q.length>=2)renderCatalogSearch(q);
}
function updateCount(){const n=state.favorites.length;$('#count').textContent=n;$('#count').hidden=!n}
// Home: available products, then the Korean-brand catalog by category.
function renderList(){
  const items=rankProducts(search(products,'',category));
  updateCount();
  $('#list-title').textContent=t('section.products');
  $('#result-count').textContent=t('count',{n:items.length});
  $('#products').innerHTML=productSortControls()+(items.length?items.map(card).join(''):`<p class="empty">${esc(t('empty.category'))}</p>`)+'<div id="catalog-results" class="catalog-results"></div>';
  renderCatalogBrowse(true);
  if(screen==='saved')renderSaved();
}
// Whole-catalog search: save the catalog snapshot locally, without enrolling price tracking.
let catalogTimer,catalogSeq=0;
let searchSeq=0;
function renderCatalogSearch(q){clearTimeout(catalogTimer);const seq=++searchSeq;
  catalogTimer=setTimeout(async()=>{let list;try{list=await searchCatalog(q)}catch{list=null}if(seq!==searchSeq||!$('#search-catalog'))return;const tracked=new Set(products.map(p=>p.sku));list=(list||[]).filter(c=>!tracked.has(c.sku));
    $('#search-catalog').innerHTML=list===null?'':`<div class="heading"><div><h2>${esc(t('section.more'))}</h2><p>${esc(t('section.moreHint'))}</p></div><span>${esc(t('count',{n:list.length}))}</span></div>`+(list.length?`<div class="catalog-grid">${rankProducts(list).map(catalogCard).join('')}</div>`:`<p class="empty">${esc(t('empty.catalogSearch'))}</p>`);
  },350)}
// Home browsing of the Korean-brand catalog by category, loaded page by page as the user scrolls.
const browse={category:null,items:[],done:false,loading:false};let observer;
function renderCatalogBrowse(reset){
  const box=$('#catalog-results');if(!box)return;
  if(reset&&browse.category!==category){Object.assign(browse,{category,items:[],done:false});catalogSeq++}
  const tracked=new Set(products.map(p=>p.sku));
  box.innerHTML=`<div class="heading"><div><h2>${esc(t('section.all'))}</h2><p>${esc(t('family.pick'))}</p></div></div><div class="catalog-grid">${rankProducts(browse.items).map(familyCard).join('')}</div>${browse.done?(browse.items.length?'':`<p class="empty">${esc(t('empty.products'))}</p>`):`<p class="empty" id="catalog-more">${esc(t('loading'))}</p>`}`;
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
  const href=p.availability==='out_of_stock'?null:buyUrl(p,p.sourceRef);
  $('#detail').innerHTML=`<div class="detail-nav"><button id="back" aria-label="${esc(t('back'))}">←</button><strong>${esc(t('detail.title'))}</strong></div><div class="detail-product"><div class="detail-art">${art(p)}</div><div class="price-summary"><small>${esc(t('detail.usPrice',{retailer:p.retailer}))}</small><div class="current"><strong>${usd(p.price)}</strong></div><p class="price-baseline">${esc(p.checkedAt?t('detail.checked',{checked:kstDate(p.checkedAt)}):t('catalog.savedSnapshot'))}</p><h1>${esc(p.name)}</h1><p class="product-meta">${esc(brandLabel(p))}${p.size?' · '+esc(p.size):''} · ${esc(categoryLabel(p.category))}</p><div class="info-chips"><span>${stock(p)}</span><span>${esc(t('detail.shippingChip',{v:shipping}))}</span></div></div></div><button class="text-link product-room-entry" data-product-rooms="${esc(p.name)}">${esc(t('rooms.productTalk'))} ›</button><section id="detail-description" class="offer-section"></section><section class="offer-section other-sizes" id="other-sizes" hidden></section><section class="offer-section"><div class="offer-heading"><h2>${esc(t('detail.retailer'))}</h2><small>${esc(t('detail.officialFeed'))}</small></div><article class="seller-row"><div class="seller-info"><strong>${esc(p.retailer)}</strong><small>${esc(t('detail.feedShipping',{v:shipping}))}</small></div><div class="seller-price"><strong>${usd(p.price)}</strong><small>${stock(p)}</small></div></article><p class="chart-note">${esc(t('detail.disclaimer'))}</p></section><section class="offer-section product-talk" id="detail-talk"></section><div class="detail-actions"><button data-favorite="${esc(p.id)}" class="save-action">${bookmark(fav)}<small>${esc(t('save.short'))}</small></button>${href?`<a class="primary buy-cta observed-buy" href="${esc(href)}" target="_blank" rel="sponsored noopener noreferrer" data-sku="${esc(p.sku)}" data-ref="${esc(p.sourceRef??'')}" data-retailer="${esc(p.retailer)}">${esc(t('buy.at',{retailer:p.retailer}))}</a>`:`<p role="status">${esc(t(p.availability==='out_of_stock'?'stock.out':'catalogFailed'))}</p>`}</div>`;
  loadOtherSizes(p);renderProductInfo($('#detail-description'),p);renderProductTalk($('#detail-talk'),p.familyKey);
  $('#back').onclick=closeDetail;
}
function closeDetail(){detailOpen=false;show(detailReturn)}
function openDetail(id){detailChat=screen==='chat';selected=id;track('product_view',id);detailOpen=true;detailReturn=screen;renderDetail();show('detail')}

localizePage();
// A shared link opens its room or product on arrival.
const arrival=sharedTarget();if(arrival){const appLink=document.createElement('a');appLink.className='text-link';appLink.textContent=t('share.openApp');appLink.href='seoulbeauty://open?'+new URLSearchParams(arrival);document.body.prepend(appLink);}if(arrival?.room)openRoomNext(arrival.room);
show('chat');
if(arrival?.product)openFamily(arrival.product);
const startGuide=(step,returnToChat=false,returnToActivity=false)=>openOnboarding({step,returnToChat:returnToChat||returnToActivity,load:onboardingData,onClose:target=>{if(returnToActivity){renderSaved();return;}if(returnToChat){document.getElementById('setup-nudge')?.remove();return;}if(target && 'productQuery' in target)openProductRoomsNext(target.productQuery);else openRoomListNext();show('chat')}});
loadRevisit({savedFamilies:savedFamilies()}).then(d=>setAlertBadge(unreadCount(d.alerts)),()=>{});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if('productRooms' in b.dataset){const name=b.dataset.productRooms;$('#family-dialog').open&&$('#family-dialog').close();openProductRoomsNext(name);show('chat');return}
  if(b.dataset.openRoom){openRoomNext(b.dataset.openRoom);show('chat');return}
  if(b.dataset.familyShare){share({title:$('#family-name').textContent,url:shareUrl({product:b.dataset.familyShare})},toast);return}
  if('familyAttach' in b.dataset){$('#family-dialog').close();if(brandChat)show('chat');if(attachToChat(familyCurrent()??familyHead))toast(t('family.attached'));return}
  if(b.dataset.activityTab){activityTab=b.dataset.activityTab;renderSaved();$(`#activity-tab-${activityTab}`).focus();return}
  if('activityProfile' in b.dataset){openActivityProfile();return}
  if('activitySkin' in b.dataset){$('#activity-profile-dialog').close();openProfile();return}
  if('activityInterests' in b.dataset){$('#activity-profile-dialog').close();startGuide('choose',false,true);return}
  if('activityBrowse' in b.dataset){if(b.dataset.activityBrowse==='rooms'){openRoomListNext();show('chat')}else show('home');return}
  if('onbManage' in b.dataset){startGuide('choose',b.dataset.onbContext==='chat');return}
  if('familyPhoto' in b.dataset){const url=familyPhotos()[+b.dataset.familyPhoto];familySelection=Math.max(0,familyList.findIndex(v=>v.image_url===url));drawFamilySelection();return}
  if('familyOption' in b.dataset){familySelection=+b.dataset.familyOption;drawFamilySelection();return}
  if('familySave' in b.dataset){const cur=familyCurrent();if(!cur)return;let id=savedOption(cur)?.id;if(!id){try{id=saveCatalogSnapshot({...cur,sourceRef:familyRef},storage).id;products=mergeCatalogSaves(products,readCatalogSaves(storage))}catch{toast(t('loadFailed'));return}}toggleFavorite(state,id);save();const on=state.favorites.includes(id);b.innerHTML=bookmark(on);b.setAttribute('aria-pressed',on);track(on?'wishlist_add':'wishlist_remove',id,{sku:cur.sku,from:familyRef??'catalog'});updateCount();return}
  if(b.dataset.followBrand){toggleFollow(b.dataset.followBrand);return}
  if('brandShare' in b.dataset){share({title:$('#brand h1')?.textContent??'',url:shareUrl({})},toast);return}
  if(b.dataset.catalogSave){saveCatalogSelection(b);return}
  if(b.dataset.family){if(b.dataset.ref)track('product_card_click',null,{family:b.dataset.family,from:b.dataset.ref});openFamily(b.dataset.family,b.dataset.ref||null,{sku:b.dataset.sku,retailer:b.dataset.retailer,market:b.dataset.market});return}
  if(b.dataset.post&&screen!=='chat'){$('#family-dialog').open&&$('#family-dialog').close();openPostNext(+b.dataset.post);show('chat');return}
  if(b.dataset.familyBrand){brandChat = canAttachToChat();$('#family-dialog').close();openBrand(b.dataset.familyBrand);return}
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
document.addEventListener('click',e=>{const a=e.target.closest('a.observed-buy');if(!a)return;if(a.dataset.sku)track('merchant_click',null,{sku:a.dataset.sku,retailer:a.dataset.retailer??'',market:a.dataset.market??'',from:a.dataset.ref||'options'});else if(selected)track('merchant_click',selected,{retailer:product(selected)?.retailer,from:a.classList.contains('buy-cta')?'detail_cta':'detail_retailer'})});
document.addEventListener('error',e=>{if(e.target.matches?.('.room-ico img')){e.target.remove();return}if(e.target.tagName==='IMG'&&!e.target.matches('.brand-item img,.brand-badge-lg img')){const box=document.createElement('div');box.className='no-photo';box.textContent=t('photoFailed');e.target.replaceWith(box)}},true);

async function loadBrandStrip(){
  const box=$('#brands');box.hidden=false;box.setAttribute('aria-busy','true');
  box.innerHTML=`<h2>${esc(t('brands.title'))}</h2>${loadingMarkup(t('loading'))}`;
  try{brands=await fetchBrands();renderBrands()}
  catch{box.innerHTML=`<h2>${esc(t('brands.title'))}</h2><p role="status">${esc(t('loadFailed'))} <button data-brands-retry>${esc(t('retry'))}</button></p>`}
  finally{box.setAttribute('aria-busy','false')}
}
loadBrandStrip();
$('#products').innerHTML=`${loadingMarkup(t('loadingPrices'))}`;
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
document.addEventListener('profile-change',()=>{if(screen==='saved')renderSaved()});
if(cachedProfile())refreshProfile();

function redrawProductLists(){
  if(screen==='brand')renderBrandPage();
  else if(screen==='search')renderSearch();
  else if(screen==='saved')renderSaved();
  else if(screen==='home')renderList();
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-product-sort]');if(b)setProductSort(b.dataset.productSort)});
document.addEventListener('product-sort-change',redrawProductLists);
document.addEventListener('product-stats-ready',redrawProductLists);
loadProductStats();
