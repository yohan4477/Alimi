import {readSavedMessages,toggleSavedMessage} from './saved-messages.js';
import {region, inMarket, languageURL, amount} from './region.js';
import {regionButton,installRegionPicker} from './region-picker.js';
import {rankProducts,productSortControls,setProductSort,loadProductStats} from './product-sort.js';
import {loadingMarkup} from './loading-companion.js';
import {demoProducts, demoRooms, demoActivity} from './demo-fixtures.js';
import {productInfoHTML, renderProductInfo} from './product-info.js';
import {readCatalogSaves,saveCatalogSnapshot,mergeCatalogSaves} from './saved-catalog.js';
import {track} from './events.js';
import {GoogleAuth} from './auth.js';
import {AccountSync} from './account-sync.js';
import {loadAccountActivity} from './account-activity.js';
import {openProfile,refreshProfile,cachedProfile,optOutOfSale} from './profile.js';
import {openProductRoomsNext,openRoomListNext,openChat,leaveChat,renderProductTalk,openPostNext,readSavedPosts,openRoomNext,renderMyConversations,canAttachToChat,attachToChat,onboardingData,relTime} from './chat.js';
import {renderMyRooms,renderAlerts,renderShareHub,addRecent,readRecent,loadRevisit,unreadCount} from './revisit.js';
import {t,lang,locale,categoryLabel} from './i18n.js';
import {readInterests,openOnboarding} from './onboarding.js';
import {share,shareUrl,sharedTarget} from './share.js';
import {buyUrl,coupangUrl,inKorea,oliveYoungUrl,loadProducts,searchCatalog,fetchFamiliesPage,fetchBrands,brandInitials,brandColor,twoRowOrder,fetchFamily,unitName,CATEGORIES,brandLabel,search,usd,readState,writeState,toggleFavorite} from './live.js';
import {$,esc} from './util.js';
import {renderExplore,refreshExplore,searchRooms,exploreRow} from './explore.js';
import {exploreData, isDemo} from './chat.js';
let storage;try{storage=localStorage}catch{}
let state=readState(storage),products=[],selected=null,category='전체',timer,detailOpen=false;
const product=id=>products.find(p=>p.id===id);
const kstDate=iso=>new Intl.DateTimeFormat(locale(),{timeZone:'Asia/Seoul',month:lang==='ko'?'long':'short',day:'numeric'}).format(new Date(iso));
const stock=p=>t(p.availability==='in_stock'?'stock.in':p.availability==='out_of_stock'?'stock.out':'stock.unknown');
function toast(m){$('#toast').textContent=m;$('#toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('show'),2500)}
function save(){try{writeState(storage,state);accountSync.changed()}catch{toast(t('saveLocalOnly'))}}
const bookmark = on => `<svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" style="fill:${on?'currentColor':'none'};stroke:currentColor;stroke-width:1.8"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`;
const art=p=>`<img src="${esc(p.imageUrl)}" alt="${esc(brandLabel(p)+' '+p.name)}" loading="lazy">`;

// Static page text comes from strings.json via data-i18n / data-i18n-attr attributes.
installRegionPicker();
$('#explore-region').innerHTML=regionButton();
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
const catalogCard=c=>`<article class="card"><button class="product-open" data-catalog-open="${esc(remember(c))}"><div class="visual">${c.image_url?`<img src="${esc(c.image_url)}" alt="${esc(brandLabel(c)+' '+c.name)}" loading="lazy">`:`<div class="no-photo">${esc(t('noPhoto'))}</div>`}</div><div class="brand">${esc(brandLabel(c))}</div><div class="product-name">${esc(c.name)}</div><div class="price-line"><strong>${usd(c.price)}</strong></div><small class="meta">${esc(categoryLabel(c.category??'기타'))} · ${esc(t('todayPrice'))}</small></button><button class="heart" data-catalog-save="${esc(remember(c))}" data-retailer="${esc(c.retailer)}" data-market="${esc(c.market)}" aria-label="${esc(t('save.action'))}">${bookmark(false)}</button></article>`;
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

function openDemoProduct(label){
  const item=demoProducts.find(p=>p.label===label||p.id===label);
  if(!item){toast(t('empty.products'));return;}
  ++familyVersion;familyList=[];familyHead=null;$('#family-talk').talkRequest=null;$('#family-similar').innerHTML='';
  const dlg=$('#family-dialog');
  $('#family-title').textContent=item.brand;
  $('#family-name').textContent=item.name;
  $('#family-hero').innerHTML=item.image_url?`<img src="${esc(item.image_url)}" alt="${esc(item.name)}">`:'';
  $('#family-body').innerHTML=`<p class="home-note">${esc(t('rooms.demoProducts'))}</p>${productInfoHTML({...item,category:({ 'torriden-serum':'에센스·세럼','aestura-cream':'크림·로션','roundlab-sun':'선케어','anua-toner':'토너·패드','cosrx-essence':'에센스·세럼','romand-tint':'립','clio-cushion':'베이스메이크업','laneige-lip':'립','medicube-pad':'토너·패드','drg-cream':'크림·로션','goodal-serum':'에센스·세럼','peripera-tint':'립' })[item.id]})}`;
  const rooms=demoRooms.filter(r=>r.topic_product?.id===item.id);
  $('#family-talk').innerHTML=`<h2>${esc(t('rooms.productTalk'))}</h2>${rooms.map(r=>`<button class="post-row" data-open-room="${esc(r.id)}"><span class="post-main"><b>${esc(r.title_ko)}</b><small>${esc(r.intro_ko)}</small></span></button>`).join('')}`;
  if(!dlg.open)dlg.showModal();
}
function openCatalogItem(item,ref=''){
  if(!item){toast(t('empty.products'));return;}
  if(item.family_key){openFamily(item.family_key,ref,item);return;}
  const p={...item,id:['catalog',item.retailer,item.market,item.sku].join('|'),imageUrl:item.image_url,brandKo:item.brand_ko,
    price:item.price??amount(item.price_minor,item.currency),familyKey:null,sourceRef:ref,history:[],delivery:null};
  products=products.filter(x=>x.id!==p.id).concat(p);openDetail(p.id);
}

async function openFamily(key,ref=null,option={}){
  const version=++familyVersion,dlg=$('#family-dialog');$('#family-similar').innerHTML='';familyList=[];familyHead=null;familyRef=ref;familySelection=0;$('#family-talk').talkRequest=null;
  $('#family-hero').innerHTML='';$('#family-title').textContent='';$('#family-name').textContent='';$('#family-body').innerHTML=loadingMarkup(t('loading'));$('#family-talk').innerHTML='';if(!dlg.open)dlg.showModal();
  try{const list=await fetchFamily(key);if(version!==familyVersion||!dlg.open)return;
    if(!list.length){$('#family-body').innerHTML=`<p class="empty">${esc(t('empty.products'))}</p>`;return;}
    familyList=list;familySelection=Math.max(0,list.findIndex(v=>v.sku===option.sku&&(!option.retailer||v.retailer===option.retailer)&&(!option.market||v.market===option.market)));const head=familyCurrent();familyHead=head;
    $('#family-title').innerHTML=`<button class="text-link" data-family-brand="${esc(head.brand)}">${esc(brandLabel(head))} ›</button>`;$('#family-name').textContent=head.name?.split(' - ')[0]??'';
    const sellers=new Set(list.map(v=>v.retailer)).size,unit=list.filter(v=>v.unitPrice!=null).sort((a,b)=>a.unitPrice-b.unitPrice)[0];
    const facts=[['options',t('product.fact.options'),t('product.fact.count',{n:list.length})],['sellers',t('product.fact.sellers'),t('product.fact.places',{n:sellers})],['unit',t('product.fact.unit'),unit?usd(unit.unitPrice)+'/'+unitName(unit.unit):'—'],['category',t('product.fact.category'),head.category?categoryLabel(head.category):'—']];
    $('#family-body').innerHTML=`<nav class="family-tabs" aria-label="${esc(t('product.info'))}">${['summary','talk','sellers','related'].map(k=>`<button data-family-jump="${k}">${esc(t('product.tab.'+k))}</button>`).join('')}</nav><div class="family-price-row"><b id="family-price"></b><button class="family-share" data-family-share="${esc(key)}" aria-label="${esc(t('share.product'))}">${esc(t('share.product'))}</button></div><p id="family-option"></p><div id="family-actions"></div><p class="chart-note">${esc(t('detail.disclaimer'))}</p>${list.length>1?`<div class="family-options">${list.map((v,i)=>`<button class="variant-row" data-family-option="${i}" aria-pressed="false"><strong>${esc([v.size_label,v.option_label].filter(Boolean).join(' · ')||t('family.default'))}</strong><small>${esc(v.retailer)}</small><b>${usd(v.price)}</b></button>`).join('')}</div>`:''}${sellerRows(list,ref)}<div class="family-facts" data-product-facts>${facts.map(f=>`<div><i class="ff-${f[0]}" aria-hidden="true"></i><small>${esc(f[1])}</small><b>${esc(f[2])}</b></div>`).join('')}</div><button class="text-link product-room-entry" data-product-rooms="${esc(head.name)}">${esc(t('rooms.productTalk'))} ›</button><div id="family-description"></div>`;
    drawFamilySelection();track('product_view',null,{family:key,sku:head.sku,from:ref??'catalog'});renderProductTalk($('#family-talk'),key);renderSimilar(head,key,version);
  }catch{if(version===familyVersion&&dlg.open)$('#family-body').innerHTML=`<p class="empty">${esc(t('catalogFailed'))}</p>`;}
}
// Journey 6-4 공유하기: preview card + 링크 복사 / 메시지 / 더보기 (system share sheet). No tracking parameters.
function openShareSheet({title,sub='',image,url}){
  let d=$('#share-sheet');if(!d){d=document.createElement('dialog');d.id='share-sheet';d.className='share-sheet';d.setAttribute('aria-labelledby','share-sheet-title');document.body.append(d)}
  d.dataset.url=url;d.dataset.title=title;const host=new URL(url).host;
  const ico={copy:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',msg:'<path d="M5 5h14v11H11l-4 3v-3H5z"/>',more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'};
  const btn=(k,label,attrs)=>`<${attrs.startsWith('href')?'a':'button'} class="share-opt so-${k}" ${attrs}><span><svg viewBox="0 0 24 24" aria-hidden="true">${ico[k]}</svg></span>${esc(label)}</${attrs.startsWith('href')?'a':'button'}>`;
  d.innerHTML=`<div class="family-bar"><form method="dialog"><button class="close-dialog" aria-label="${esc(t('close'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></form><strong id="share-sheet-title">${esc(t('share.sheet'))}</strong><span></span></div><div class="share-card">${image?`<img src="${esc(image)}" alt="">`:''}<div><small>${esc(sub)}</small><b>${esc(title)}</b><em>${esc(host)}</em></div></div><div class="share-opts">${btn('copy',t('share.copyLink'),'data-share-copy')}${btn('msg',t('share.message'),`href="sms:?&body=${encodeURIComponent(title+' '+url)}"`)}${navigator.share?btn('more',t('share.more'),'data-share-more'):''}</div>`;
  if(!d.open)d.showModal();
}
// Journey 5-5 판매처 선택: the cheapest in-stock option per seller, each with its own (affiliate) link.
function sellerRows(list,ref){
  const best=new Map();for(const v of list){if(v.availability==='out_of_stock'||!buyUrl(v,ref))continue;const k=v.retailer+'|'+v.market;if(!best.has(k)||v.price<best.get(k).price)best.set(k,v)}
  if(!best.size)return'';
  return `<section id="family-sellers" class="family-sellers"><h2>${esc(t('product.sellers'))}</h2>${[...best.values()].sort((a,b)=>a.price-b.price).map(v=>`<div class="seller-pick"><span class="seller-badge" aria-hidden="true">${esc(String(v.retailer??'?').slice(0,1).toUpperCase())}</span><span class="seller-name"><b>${esc(v.retailer)}</b><small>${esc([v.size_label,v.option_label].filter(Boolean).join(' · ')||t('family.default'))}</small></span><strong>${usd(v.price)}</strong><a class="seller-buy observed-buy" href="${esc(buyUrl(v,ref))}" target="_blank" rel="sponsored noopener noreferrer" data-sku="${esc(v.sku)}" data-retailer="${esc(v.retailer)}" data-market="${esc(v.market)}" data-ref="${esc(ref??'')}">${esc(t('product.sellerBuy'))} ↗</a></div>`).join('')}<p class="chart-note">${esc(t('product.sellerNote'))}</p></section>`;
}
const FAMILY_JUMP={summary:'#family-body [data-product-facts]',talk:'#family-talk',sellers:'#family-sellers',related:'#family-similar'};
// Journey 5 "함께 볼 제품": other catalog products of the same category (not a co-view statistic).
async function renderSimilar(head,key,version){
  const box=$('#family-similar');box.innerHTML='';if(!head.category)return;
  try{const list=(await fetchFamiliesPage(head.category,0,8)).filter(f=>f.family_key!==key&&f.image_url).slice(0,3);if(version!==familyVersion||!list.length)return;
    box.innerHTML=`<h2>${esc(t('product.category'))}</h2><div class="similar-grid">${list.map(f=>`<button class="similar-card" data-family="${esc(f.family_key)}" data-sku="${esc(f.sku??'')}" data-retailer="${esc(f.retailer??'')}" data-market="${esc(f.market??'')}" data-ref="similar"><img src="${esc(f.image_url)}" alt="" loading="lazy"><b>${esc(brandLabel(f))}</b><small>${esc(f.base_name)}</small></button>`).join('')}</div>`}catch{}
}
async function loadOtherSizes(p){
  const box=$('#other-sizes');if(!box||!p.familyKey)return;
  try{const list=(await fetchFamily(p.familyKey));if(list.length<2||selected!==p.id)return;box.innerHTML=`<h2>${esc(t('family.otherSizes'))}</h2><button class="text-link" data-family="${esc(p.familyKey)}" data-sku="${esc(p.sku)}" data-ref="${esc(p.sourceRef??'saved')}">${esc(t('family.options',{n:list.length}))}</button>`;box.hidden=false}catch{}
}
const icon={
  kakao:'<svg class="brand-mark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#000" stroke="none" d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.7l-1 3.6c-.1.3.3.6.6.4l4.2-2.8c.5.1 1.1.1 1.6.1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>',
  naver:'<svg class="brand-mark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#fff" stroke="none" d="M4 3h5.6l4.8 7.2V3H20v18h-5.6L9.6 13.8V21H4z"/></svg>',
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
  if(n!=='detail')detailOpen=false;
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
  if(n==='search')renderSearch();
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
const brandGrid=()=>brands.length?`<div class="brand-grid">${twoRowOrder(brands).map(b=>`<button class="brand-item" data-brand="${esc(b.brand)}"><i>${brandBadge(b)}</i><small>${esc(brandLabel(b))}</small></button>`).join('')}</div>`:`<p class="empty">${esc(t('home.noBrands'))}</p>`;
function renderBrands(){const box=$('#brands');if(screen==='search')refreshExplore();if(!brands.length){box.hidden=true;return}box.hidden=false;
  box.innerHTML=`<h2>${esc(t('brands.title'))}</h2>${brandGrid()}`}
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
let activityTab='rooms';
// Recently viewed products on this device (revisit.js).
// Demo mode only: synthetic 내 활동 contents (demo-fixtures.js), opened as demo products.
const demoPicks=ids=>ids.map(id=>demoProducts.find(p=>p.id===id)).filter(Boolean);
const demoRecentRow=p=>`<button class="recent-row" data-demo-product="${esc(p.id)}"><img src="${esc(p.image_url)}" alt="" loading="lazy"><span><b>${esc(p.brand)} ${esc(p.name)}</b><small>${esc(t('rooms.demoProducts'))}</small></span></button>`;
const demoSavedCard=p=>`<article class="saved-card"><button class="product-open" data-demo-product="${esc(p.id)}"><div class="visual"><img src="${esc(p.image_url)}" alt="" loading="lazy"></div><div class="brand">${esc(p.brand)}</div><div class="product-name">${esc(p.name)}</div></button></article>`;
const recentList=()=>{const list=readRecent();if(!list.length&&isDemo())return `<div class="recent-list">${demoPicks(demoActivity.recent).map(demoRecentRow).join('')}</div>`;return list.length?`${productSortControls()}<div class="recent-list">${rankProducts(list).map(f=>`<button class="recent-row" data-family="${esc(f.family_key)}" data-sku="${esc(f.sku??'')}" data-retailer="${esc(f.retailer??'')}" data-market="${esc(f.market??'')}" data-ref="${esc(f.ref??'recent')}">${f.image_url?`<img src="${esc(f.image_url)}" alt="" loading="lazy">`:'<span class="no-photo"></span>'}<span><b>${esc(brandLabel({brand:f.brand,brandKo:f.brand_ko}))} ${esc(f.base_name)}</b>${f.category?`<small>${esc(categoryLabel(f.category))}</small>`:''}${f.min_price_minor?`<strong>${usd(f.min_price_minor/100)}</strong>`:''}</span></button>`).join('')}</div>`:activityEmpty(t('activity.recentEmpty'),'products')};
// Products saved on this device that have a family key (for 알림 and 상품 공유).
const savedFamilies=()=>products.filter(p=>state.favorites.includes(p.id)&&p.familyKey).map(p=>({familyKey:p.familyKey,name:p.name}));
const setAlertBadge=n=>{document.documentElement.dataset.unreadAlerts=String(n>0)};
// 내 활동 (journey 6): 참여한 대화방 / 저장한 글 / 최근 본 상품 tabs, then 저장한 제품 and the latest 알림.
const ACTIVITY_TABS=['rooms','talk','recent'];
const activityTabLabel=k=>t('activity.tab.'+k);
// Saved messages and posts are individual content; room bookmarks live in My rooms.
function drawSavedTalk(){
  const box=$('#activity-talk');if(!box)return;
  const messages=readSavedMessages(),posts=readSavedPosts();
  box.innerHTML=messages.length||posts.length
    ? messages.map(m=>`<article class="post-row"><button class="post-main" data-open-room="${esc(m.room_id)}"><small>${esc(m.room_title||m.room_id)} · ${esc(m.nickname||'')}</small><b>${esc(m.body||m.item?.name||'')}</b></button><button class="text-link" data-unsave-message="${m.id}" data-message-room="${esc(m.room_id)}" aria-label="${esc(t('activity.unsaveMessage'))}">×</button></article>`).join('')+(posts.length?savedPostRows():'')
    :activityEmpty(t('activity.messagesEmpty'),'rooms');
}
const savedPostRows=()=>readSavedPosts().length?readSavedPosts().map(p=>`<button class="post-row" data-post="${p.id}"><span class="post-main"><span class="post-kind k-${esc(p.kind)}">${esc(t('community.kind.'+p.kind))}</span><b>${esc(p.title)}</b></span></button>`).join(''):activityEmpty(t('activity.postsEmpty'),'rooms');
let activityAlerts=null;
const bellIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
function renderSaved(){
  const list=rankProducts(products.filter(p=>state.favorites.includes(p.id))),n=list.length;
  if(activityTab==='saved'){
    $('#saved').innerHTML=`<div class="page-bar"><button class="icon-btn" data-activity-tab="rooms" aria-label="${esc(t('back'))}">${icon.back}</button><h1>${esc(t('activity.savedProducts'))}</h1></div>${n===0?activityEmpty(t('activity.savedEmpty'),'products'):productSortControls()+`<div class="saved-grid">${list.map(savedCard).join('')}</div>`}`;
    return;
  }
  // My Seoul Beauty: one entrypoint. Room and saved-post sections retain their existing device/anonymous ownership semantics.
  const myLabel=lang==='ko'?'마이 서울뷰티':'My Seoul Beauty';
  const userName=auth.user?.user_metadata?.name||auth.user?.user_metadata?.nickname||auth.user?.email||'';
  const identityHint=auth.user?(lang==='ko'?'로그인됨 · 계정 설정 동기화':'Signed in · account preferences sync'):(lang==='ko'?'비회원 · 이 기기의 활동':'Guest · activity on this device');
  const quick=(title,sub,attr)=>`<button class="interest-row" ${attr}><span><b>${esc(title)}</b><small>${esc(sub)}</small></span><span aria-hidden="true">›</span></button>`;
  const myHub=`<section class="activity-section" aria-label="${esc(myLabel)}"><h1 style="font-size:24px;margin:8px 0">${esc(myLabel)}</h1><p class="home-note">${esc(userName?userName+' · '+identityHint:identityHint)}</p><div class="activity-section">
    ${quick(lang==='ko'?'저장한 제품':'Saved products',lang==='ko'?`${n}개 저장됨`:`${n} saved`,'data-hub-tab="saved"')}
    ${quick(lang==='ko'?'내 대화와 참여':'My conversations',lang==='ko'?'이 기기의 대화 참여 내역':'Conversations on this device','data-hub-tab="rooms"')}
    ${quick(lang==='ko'?'저장한 글·메시지':'Saved posts & messages',lang==='ko'?'이 기기에 저장된 항목':'Items saved on this device','data-hub-tab="talk"')}
    ${quick(lang==='ko'?'뷰티 프로필':'Beauty profile',lang==='ko'?'선택한 피부·관심사 수정':'Edit optional skin and interests','data-activity-profile')}
    ${quick(lang==='ko'?'계정·개인정보 관리':'Account & privacy',lang==='ko'?'로그인·설정 내보내기·탈퇴 요청':'Sign in, export preferences, deletion request','data-screen="settings"')}
  </div><p class="set-hint">${esc(lang==='ko'?'투표·작성글 전체는 아직 계정별로 통합되지 않았습니다.':'Votes and authored posts are not yet fully linked to your account.')}</p></section>`;
  const activityRows=accountActivity?[
    ['posts',lang==='ko'?'내 작성 글':'My posts',r=>`<button class="post-row" data-post="${esc(r.id)}"><span class="post-main"><b>${esc(r.title)}</b></span></button>`],
    ['comments',lang==='ko'?'내 댓글':'My comments',r=>`<div class="post-row"><span class="post-main"><small>#${esc(r.post_id)}</small><b>${esc(r.body)}</b></span></div>`],
    ['messages',lang==='ko'?'내 메시지':'My messages',r=>`<button class="post-row" data-open-room="${esc(r.room_id)}"><span class="post-main"><b>${esc(r.body)}</b></span></button>`]
  ].map(([key,label,render])=>`<section class="activity-section"><h2 class="chat-section">${esc(label)} · ${(accountActivity[key]||[]).length}</h2>${(accountActivity[key]||[]).slice(0,10).map(render).join('')||`<p class="home-note">${esc(lang==='ko'?'기록 없음':'No activity yet')}</p>`}</section>`).join(''):'';
  const votesSummary=accountActivity?`<section class="activity-section"><h2 class="chat-section">${esc(lang==='ko'?'내 반응·투표':'My reactions & votes')} · ${(accountActivity.votes||[]).length}</h2><p class="home-note">${esc(lang==='ko'?'커뮤니티 좋아요·선택 내역입니다. 게임 투표는 별도 연동이 필요합니다.':'Community likes and choices only. Game votes require separate integration.')}</p></section>`:'';
  const accountActivityNotice=auth.user?(accountActivityStatus==='failed'?(lang==='ko'?'계정 활동을 불러올 수 없습니다. 서버 마이그레이션·연결 상태를 확인해 주세요.':'Account activity unavailable. Check server migration and connection.'):(lang==='ko'?'계정으로 확인된 활동만 표시합니다.':'Only account-verified activity is shown.')):(lang==='ko'?'로그인하면 이 기기의 활동을 안전하게 계정에 연결할 수 있습니다.':'Sign in to securely link this device’s activity.');
  const more=attrs=>`<button class="text-link" ${attrs}>${esc(t('home.seeAll'))} ›</button>`;
  $('#saved').innerHTML=`<div class="logo-head activity-head sb-head"><img class="sb-logo" src="assets/seoul-beauty-logo.webp" alt="Seoul Beauty" width="230" height="69"><span class="sb-head-actions"><button class="icon-btn" data-screen="alerts" aria-label="${esc(t('alerts.title'))}">${bellIcon}</button><button class="icon-btn" data-screen="settings" aria-label="${esc(t('settings.open'))}">${icon.gear}</button></span></div><div class="service-context">${regionButton()}</div>${myHub}<p class="set-hint">${esc(accountActivityNotice)}</p>${activityRows}${votesSummary}<div class="home-tabs activity-tabs" role="tablist" aria-label="${esc(t('nav.activity'))}">${ACTIVITY_TABS.map(k=>`<button role="tab" id="activity-tab-${k}" data-activity-tab="${k}" aria-selected="${activityTab===k}" class="${activityTab===k?'on':''}">${esc(activityTabLabel(k))}</button>`).join('')}</div><div role="tabpanel" class="activity-panel" aria-labelledby="activity-tab-${activityTab}">${activityTab==='rooms'?'<section id="activity-conversations"></section>':activityTab==='recent'?recentList():`<section id="activity-talk">${loadingMarkup(t('loading'))}</section>`}</div>
<section class="activity-section"><div class="section-head"><h2 class="chat-section">${esc(t('activity.savedProducts'))}</h2>${n?more('data-activity-tab="saved"'):''}</div>${n?`<div class="saved-mini-grid">${list.slice(0,4).map(savedCard).join('')}</div>`:isDemo()?`<div class="saved-mini-grid">${demoPicks(demoActivity.saved).map(demoSavedCard).join('')}</div>`:activityEmpty(t('activity.savedEmpty'),'products')}</section>
<section class="activity-section"><div class="section-head"><h2 class="chat-section">${esc(t('alerts.title'))}</h2>${more('data-screen="alerts"')}</div><div id="activity-alerts">${loadingMarkup(t('loading'))}</div></section>${interestRow()}`;
  if(activityTab==='rooms')renderMyConversations($('#activity-conversations'));
  if(activityTab==='talk')drawSavedTalk();
  if(!activityAlerts||Date.now()-activityAlerts.at>60000)activityAlerts={at:Date.now(),load:loadRevisit({savedFamilies:savedFamilies()})};
  activityAlerts.load.then(d=>{const box=$('#activity-alerts');if(!box)return;const top=isDemo()?demoActivity.alerts.slice(0,2):d.alerts.slice(0,2);
    box.innerHTML=top.length?top.map(a=>`<button class="alert-mini" ${a.room?`data-open-room="${esc(a.room.id)}"`:a.family?`data-family="${esc(a.family)}"`:'data-screen="alerts"'}><span class="alert-mini-ico">${bellIcon}</span><span><b>${esc(a.title)}</b><small>${esc(relTime(a.at))}</small></span><i aria-hidden="true">›</i></button>`).join(''):`<p class="home-note">${esc(t('alerts.empty'))}</p>`},()=>{const box=$('#activity-alerts');if(box)box.innerHTML=`<p class="home-note">${esc(t('home.retry'))}</p>`});
}
// Settings, laid out like the competitor's: grouped rows with line icons and gray hint boxes.
const linkRow=(ic,label,href)=>`<a class="set-row" href="${href}" target="_blank" rel="noopener"><span class="set-ico">${ic}</span><span class="set-label">${esc(label)}</span><span class="set-tail">${icon.chevron}</span></a>`;
const row=(ic,label,attrs='',tail=icon.chevron)=>`<button class="set-row" ${attrs}><span class="set-ico">${ic}</span><span class="set-label">${esc(label)}</span><span class="set-tail">${tail}</span></button>`;
// Optional account with owner-isolated cloud preferences.
const auth=new GoogleAuth();
let syncStatus='local',authBusy=false,accountActivity=null,accountActivityStatus='local';
const accountSync=new AccountSync(auth,{storage,onChange:()=>{
  state=readState(storage);products=mergeCatalogSaves(products.filter(p=>!p.id.startsWith('catalog|')),readCatalogSaves(storage)).filter(p=>inMarket(p));
  updateCount();if(screen==='saved')renderSaved();
},onStatus:value=>{syncStatus=value;if(screen==='settings')renderSettings()}});
for(const event of ['profile-change','interests-change'])document.addEventListener(event,()=>accountSync.changed());
async function restoreAccount(){try{await auth.restore();if(auth.user){await accountSync.start();try{accountActivity=await loadAccountActivity(auth,{storage});accountActivityStatus='ready'}catch{accountActivity=null;accountActivityStatus='failed'}}else if(accountSync.userId||storage.getItem('seoulbeauty-data-owner'))accountSync.stop();accountActivity=null;accountActivityStatus='local';}catch{if(!auth.session&&accountSync.userId)accountSync.stop();syncStatus='failed';}if(screen==='settings')renderSettings();if(screen==='saved')renderSaved();}
setInterval(()=>{if(!document.hidden)restoreAccount()},60000);
window.addEventListener('online',()=>restoreAccount().then(()=>accountSync.flush()));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)restoreAccount()});
window.addEventListener('storage',e=>{if(e.key==='alimi-auth-session-v1')location.reload()});
async function authAction(a){
  if(authBusy)return;authBusy=true;renderSettings();
  try{
    if((a==='google'||region==='kr'&&['kakao','naver'].includes(a))){await auth.startLogin(a);return;}
    if(a==='sync'){await accountSync.flush();accountSync.ready=false;await accountSync.start();return;}
    await accountSync.flush();try{await auth.signOut()}finally{accountSync.stop()}toast(t('account.signedOut'));
  }catch(error){toast(error?.message||t('account.failed'))}
  finally{authBusy=false;renderSettings();}
}
const providerLabel=p=>({'custom:kakao':lang==='ko'?'카카오':'Kakao','custom:naver':lang==='ko'?'네이버':'Naver'})[p]||'Google';
function renderSettings(){
  $('#settings').innerHTML=`<div class="page-bar"><button class="icon-btn" data-screen="saved" aria-label="${esc(t('back'))}">${icon.back}</button><h1>${esc(t('settings.title'))}</h1></div>
<section class="set-group"><h3>${esc(t('account.title'))}</h3>${auth.user?`<div class="account-card"><span><b>${esc(auth.user.email||auth.user.user_metadata?.name||auth.user.user_metadata?.nickname||t('account.signedIn',{provider:providerLabel(auth.user.app_metadata?.provider)}))}</b><em>${esc(t('account.sync.'+syncStatus))}</em></span></div><button class="auth-button secondary" data-auth="sync" ${authBusy?'disabled':''}>${esc(t('account.syncRetry'))}</button><button class="auth-button secondary" data-auth="signout" ${authBusy?'disabled':''}>${esc(t('account.signout'))}</button><button class="auth-button secondary" data-set="account-export" ${authBusy?'disabled':''}>${lang==='ko'?'기기에 저장된 계정 설정 다운로드':'Download saved account preferences'}</button><button class="auth-button secondary" data-set="account-deletion-request" ${authBusy?'disabled':''}>${lang==='ko'?'회원 탈퇴 요청':'Request account deletion'}</button><p class="set-hint">${lang==='ko'?'탈퇴는 현재 운영자 확인 후 처리됩니다. 요청만으로 즉시 삭제되지는 않습니다.':'Account deletion currently requires operator review. Requesting does not delete your account immediately.'}</p>`:`${region==='kr'?`<button class="auth-button auth-kakao" data-auth="kakao" ${authBusy?'disabled':''}>${icon.kakao}${esc(t('account.kakao'))}</button><button class="auth-button auth-naver" data-auth="naver" ${authBusy?'disabled':''}>${icon.naver}${esc(t('account.naver'))}</button>`:''}<button class="auth-button" data-auth="google" ${authBusy?'disabled':''}><span class="google-mark">G</span>${esc(t('account.google'))}</button><p class="set-hint">${esc(t('account.localDataHint'))}</p>`}</section>
<section class="set-group"><h3>${esc(t('settings.service'))}</h3>
<div class="set-row static"><span class="set-label">${esc(t('region.title'))}</span>${regionButton()}</div><div class="set-row static"><span class="set-ico">${icon.globe}</span><span class="set-label">${esc(t('settings.language'))}</span><span class="seg"><button data-lang="ko" class="${lang==='ko'?'on':''}">한국어</button><button data-lang="en" class="${lang==='en'?'on':''}">English</button></span></div><p class="set-hint">${esc(t('settings.languageHint'))}</p></section>
<section class="set-group"><h3>${esc(t('settings.data'))}</h3>${row(icon.lock,t('profile.title'),'data-profile-open')}${row(icon.lock,t('profile.doNotSell'),'data-set="do-not-sell"')}${row(icon.tray,t('settings.clearSaved'),'data-set="clear-saved"')}${row(icon.trash,t('settings.clearCache'),'data-set="clear-cache"')}</section>
<section class="set-group"><h3>${esc(t('settings.support'))}</h3><button class="feedback-card" data-set="soon"><span class="set-ico">${icon.chat}</span><span><b>${esc(t('settings.feedback'))}</b><em>${esc(t('settings.feedbackSub'))}</em></span></button>${linkRow(icon.doc,t('settings.terms'),'/terms')}${linkRow(icon.lock,t('settings.privacy'),'/privacy')}<div class="set-row static"><span class="set-ico">${icon.info}</span><span class="set-label">${esc(t('settings.version',{v:'web 1.0'}))}</span></div></section>`;
}
// Download only the user's own locally held preferences; no auth credentials or tokens.
function exportAccountData(){
  if(!auth.user)throw Error(lang==='ko'?'로그인이 필요합니다.':'Sign in first.');
  const permitted=['alimi-live-v1','seoulbeauty-catalog-saves-v1','seoulbeauty-interests-v1','seoulbeauty-profile-v1'];
  const data={exported_at:new Date().toISOString(),account:{id:auth.user.id,email:auth.user.email??null,provider:auth.user.app_metadata?.provider??null},preferences:{}};
  for(const key of permitted){const value=storage?.getItem(key);if(value!==null&&value!==undefined){try{data.preferences[key]=JSON.parse(value)}catch{data.preferences[key]=value}}}
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='seoulbeauty-my-data.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function requestAccountDeletion(){
  if(!auth.user)return;
  const email=auth.user.email??'';
  const heading=lang==='ko'?'회원 탈퇴 요청':'Account deletion request';
  const body=lang==='ko'
    ?'서울뷰티 회원 탈퇴 및 연결된 개인정보 삭제를 요청합니다. 본인 확인 안내를 보내 주세요.\\n\\n계정 이메일: '+email+'\\n이 요청만으로 탈퇴가 완료되지는 않습니다.'
    :'I request deletion of my Seoul Beauty account and associated personal data. Please send identity verification instructions.\\n\\nAccount email: '+email+'\\nThis request does not immediately delete the account.';
  location.href='mailto:support@seoulbeauty.me?subject='+encodeURIComponent(heading)+'&body='+encodeURIComponent(body);
}
async function settingsAction(a){
  if(a==='account-export'){try{exportAccountData()}catch(e){toast(e.message)}return}
  if(a==='account-deletion-request'){requestAccountDeletion();return}
  if(a==='soon'){toast(t('settings.soon'));return}
  if(a==='do-not-sell'){try{await optOutOfSale();toast(t('profile.doNotSellDone'))}catch{toast(t('profile.failed'))}return}
  if(a==='clear-saved'){if(!confirm(t('settings.clearSavedConfirm')))return;state={favorites:[],targets:{}};save();renderList();toast(t('settings.cleared'));return}
  if(a==='clear-cache'){try{for(const k of await caches.keys())await caches.delete(k)}catch{}try{sessionStorage.clear()}catch{}toast(t('settings.cacheCleared'));setTimeout(()=>location.reload(),700)}
}
// Search has its own screen: available products that match, then the whole catalog.
function renderSearch(){
  const q=$('#search').value.trim(),box=$('#search-results');
  if(!q){renderExplore(box,brandGrid);return}
  const items=rankProducts(search(products,q,'전체'));
  // 2-3: one query, filtered as 전체 / 대화방 / 제품 / 브랜드 (filter only hides sections; nothing refetches).
  const lower=q.toLocaleLowerCase(),brandHits=brands.filter(b=>[b.brand,b.brand_ko,brandLabel(b)].some(v=>String(v??'').toLocaleLowerCase().includes(lower)));
  box.dataset.filter=searchFilter;
  box.innerHTML=`<div class="search-filters" role="group" aria-label="${esc(t('search.title'))}">${SEARCH_FILTERS.map(k=>`<button data-search-filter="${k}" aria-pressed="${searchFilter===k}" class="${searchFilter===k?'on':''}">${esc(t('search.filter.'+k))}</button>`).join('')}</div><section class="search-sec" data-kind="rooms"><h2 class="explore-head-title">${esc(t('search.filter.rooms'))}</h2><div id="search-rooms">${loadingMarkup(t('loading'))}</div></section>${brandHits.length?`<section class="search-sec" data-kind="brands"><h2 class="explore-head-title">${esc(t('search.filter.brands'))}</h2><div class="brand-grid">${brandHits.slice(0,12).map(b=>`<button class="brand-item" data-brand="${esc(b.brand)}"><i>${brandBadge(b)}</i><small>${esc(brandLabel(b))}</small></button>`).join('')}</div></section>`:''}<section class="search-sec" data-kind="products">`+productSortControls()+(items.length?`<div class="heading"><div><h2>${esc(t('section.products'))}</h2></div><span>${esc(t('count',{n:items.length}))}</span></div><div class="product-grid">${items.map(card).join('')}</div>`:'')+'<div id="search-catalog" class="catalog-results"></div></section>';
  if(q.length>=2)renderCatalogSearch(q);
  const seq=++roomSearchSeq;searchRooms(q).then(({rooms,images})=>{const el=$('#search-rooms');if(seq!==roomSearchSeq||!el)return;el.innerHTML=rooms.length?rooms.slice(0,8).map(r=>exploreRow(r,images.get(r.id))).join(''):`<p class="empty">${esc(t('search.roomsEmpty'))}</p>`},()=>{const el=$('#search-rooms');if(seq===roomSearchSeq&&el)el.innerHTML=`<p class="empty">${esc(t('home.retry'))}</p>`});
}
const SEARCH_FILTERS=['all','rooms','products','brands'];let searchFilter='all',roomSearchSeq=0;
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
  const href=p.availability==='out_of_stock'?null:buyUrl(p,p.sourceRef);const coupang=inKorea()?coupangUrl(p,p.sourceRef):null;const oliveYoung=region==='us'?oliveYoungUrl(p,p.sourceRef):null;
  $('#detail').innerHTML=`<div class="detail-nav"><button id="back" aria-label="${esc(t('back'))}">←</button><strong>${esc(t('detail.title'))}</strong></div><div class="detail-product"><div class="detail-art">${art(p)}</div><div class="price-summary"><small>${esc(t('detail.usPrice',{retailer:p.retailer}))}</small><div class="current"><strong>${usd(p.price)}</strong></div><p class="price-baseline">${esc(p.checkedAt?t('detail.checked',{checked:kstDate(p.checkedAt)}):t('catalog.savedSnapshot'))}</p><h1>${esc(p.name)}</h1><p class="product-meta">${esc(brandLabel(p))}${p.size?' · '+esc(p.size):''} · ${esc(categoryLabel(p.category))}</p><div class="info-chips"><span>${stock(p)}</span><span>${esc(t('detail.shippingChip',{v:shipping}))}</span></div><p class="chart-note">${esc(t('detail.disclaimer'))}</p></div></div><button class="text-link product-room-entry" data-product-rooms="${esc(p.name)}">${esc(t('rooms.productTalk'))} ›</button><section id="detail-description" class="offer-section"></section><section class="offer-section other-sizes" id="other-sizes" hidden></section><section class="offer-section"><div class="offer-heading"><h2>${esc(t('detail.retailer'))}</h2><small>${esc(t('detail.officialFeed'))}</small></div><article class="seller-row"><div class="seller-info"><strong>${esc(p.retailer)}</strong><small>${esc(t('detail.feedShipping',{v:shipping}))}</small></div><div class="seller-price"><strong>${usd(p.price)}</strong><small>${stock(p)}</small></div></article>${coupang?`<article class="seller-row"><div class="seller-info"><strong>${esc(t('coupang.name'))}</strong><small>${esc(t('coupang.note'))}</small></div><a class="observed-buy" href="${esc(coupang)}" target="_blank" rel="sponsored noopener noreferrer" data-retailer="Coupang">${esc(t('buy.at',{retailer:t('coupang.name')}))}</a></article>`:''}${oliveYoung?`<article class="seller-row"><div class="seller-info"><strong>${esc(t('oliveyoung.name'))}</strong><small>${esc(t('oliveyoung.note'))}</small></div><a class="observed-buy" href="${esc(oliveYoung)}" target="_blank" rel="sponsored noopener noreferrer" data-retailer="OLIVE YOUNG US">${esc(t('buy.at',{retailer:t('oliveyoung.name')}))}</a></article>`:''}${coupang?`<p class="chart-note">${esc(t('coupang.disclosure'))}</p>`:''}</section><section class="offer-section product-talk" id="detail-talk"></section><div class="detail-actions"><button data-favorite="${esc(p.id)}" class="save-action">${bookmark(fav)}<small>${esc(t('save.short'))}</small></button>${href?`<a class="primary buy-cta observed-buy" href="${esc(href)}" target="_blank" rel="sponsored noopener noreferrer" data-sku="${esc(p.sku)}" data-ref="${esc(p.sourceRef??'')}" data-retailer="${esc(p.retailer)}">${esc(t('buy.at',{retailer:p.retailer}))}</a>`:`<p role="status">${esc(t(p.availability==='out_of_stock'?'stock.out':'catalogFailed'))}</p>`}</div>`;
  loadOtherSizes(p);renderProductInfo($('#detail-description'),p);renderProductTalk($('#detail-talk'),p.familyKey);
  $('#back').onclick=closeDetail;
}
function closeDetail(){detailOpen=false;show(detailReturn)}
function openDetail(id){if(!product(id)){toast(t('empty.products'));return;}detailChat=screen==='chat';selected=id;track('product_view',id);detailOpen=true;detailReturn=screen;renderDetail();show('detail')}

localizePage();
// A shared link opens its room or product on arrival.
const arrival=sharedTarget();if(arrival){const appLink=document.createElement('a');appLink.className='text-link';appLink.textContent=t('share.openApp');appLink.href='seoulbeauty://open?'+new URLSearchParams({...arrival,region});document.body.prepend(appLink);}if(arrival?.room)openRoomNext(arrival.room);

// Invite handoff: offer optional skin-based discovery only after the user enters SeoulBeauty.
// The invite answers are session-only and are never posted as public reviews.
function showInviteDiscovery(){
  let data;try{data=JSON.parse(sessionStorage.getItem('sb-invite-discovery')||'null');sessionStorage.removeItem('sb-invite-discovery')}catch{return}
  if(!data||!data.focus||Date.now()-data.at>24*60*60*1000)return;
  const names={torriden:'토리든 다이브인 세럼',anua:'아누아 어성초 77 토너',aestura:'에스트라 아토베리어365 크림',romand:'롬앤 쥬시 래스팅 틴트',clio:'클리오 킬커버 쿠션',roundlab:'라운드랩 자작나무 선크림'};
  const name=names[data.focus];if(!name)return;
  const overlay=document.createElement('dialog');overlay.className='chat-dialog';overlay.id='invite-arrival-dialog';
  overlay.style.cssText='border:0;border-radius:16px;max-width:min(420px,calc(100vw - 32px));width:100%;padding:23px;color:#252525;background:#fff';
  const h=document.createElement('h2');h.textContent='내 피부와 비슷한 사람들의 경험도 볼래?';h.style.cssText='font-size:19px;line-height:1.4;margin:10px 0';
  const lead=document.createElement('p');lead.textContent=name+' · '+(data.topic||'사용 경험');lead.style.cssText='color:#777;font-size:13px';
  const hint=document.createElement('p');hint.textContent='피부 타입을 선택하면 관련 후기를 찾을 때 참고할 수 있어요. 언제든 건너뛸 수 있어요.';hint.style.cssText='color:#777;font-size:13px;line-height:1.6';
  const options=document.createElement('div');options.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0';
  const select=document.createElement('button');select.textContent='내게 맞는 후기 찾기';select.disabled=true;select.style.cssText='width:100%;background:#252525;color:#fff;padding:14px;border-radius:10px;border:0';
  const skip=document.createElement('button');skip.textContent='지금은 둘러보기';skip.style.cssText='display:block;width:100%;padding:13px;border:0;background:#fff;color:#777';
  let chosen='';
  const close=()=>{overlay.close();overlay.remove()};
  for(const value of ['지성','건성','복합성','민감성','잘 모르겠어요']){
    const b=document.createElement('button');b.textContent=value;b.style.cssText='background:#f7f7f7;border:1px solid #eee;border-radius:10px;padding:12px;font-size:13px';
    b.onclick=()=>{chosen=value;select.disabled=false;for(const x of options.children)x.style.borderColor=x===b?'#0786ff':'#eee'};
    options.append(b);
  }
  select.onclick=()=>{const map={'지성':'oily','건성':'dry','복합성':'combination','민감성':'sensitive'};close();openProfile(map[chosen]||'')};
  skip.onclick=close;
  overlay.append(h,lead,hint,options,select,skip);document.body.append(overlay);overlay.showModal();
}

show('chat');
showInviteDiscovery();
if(arrival?.product)openFamily(arrival.product);
const startGuide=(step,returnToChat=false,returnToActivity=false)=>openOnboarding({step,returnToChat:returnToChat||returnToActivity,load:onboardingData,onClose:target=>{if(returnToActivity){renderSaved();return;}if(returnToChat){document.getElementById('setup-nudge')?.remove();return;}if(target && 'productQuery' in target)openProductRoomsNext(target.productQuery);else openRoomListNext();show('chat')}});
loadRevisit({savedFamilies:savedFamilies()}).then(d=>setAlertBadge(unreadCount(d.alerts)),()=>{});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.demoProduct){openDemoProduct(b.dataset.demoProduct);return}
  if(b.dataset.chatProduct){try{openCatalogItem(JSON.parse(b.dataset.chatProduct),b.dataset.ref||'chat')}catch{toast(t('loadFailed'))}return}
  if(b.dataset.catalogOpen){openCatalogItem(catalogItems.get(b.dataset.catalogOpen));return}
  if('productRooms' in b.dataset){const name=b.dataset.productRooms;$('#family-dialog').open&&$('#family-dialog').close();openProductRoomsNext(name);brandChat=false;detailChat=false;show('chat');return}
  if(b.dataset.openRoom){$('#family-dialog').open&&$('#family-dialog').close();openRoomNext(b.dataset.openRoom);brandChat=false;detailChat=false;show('chat');return}
  if(b.dataset.familyShare){openShareSheet({title:$('#family-name').textContent,sub:familyHead?brandLabel(familyHead):'',image:familyCurrent()?.image_url,url:shareUrl({product:b.dataset.familyShare})});return}
  if(b.dataset.unsaveMessage){toggleSavedMessage({id:Number(b.dataset.unsaveMessage),room_id:b.dataset.messageRoom});drawSavedTalk();return}
  if(b.dataset.shareCopy!==undefined){const url=$('#share-sheet').dataset.url;navigator.clipboard.writeText(url).then(()=>toast(t('share.copied')),()=>toast(`${t('share.failed')} ${url}`));return}
  if(b.dataset.shareMore!==undefined){const d=$('#share-sheet');share({title:d.dataset.title,url:d.dataset.url},toast);return}
  if('familyAttach' in b.dataset){$('#family-dialog').close();if(brandChat)show('chat');if(attachToChat(familyCurrent()??familyHead))toast(t('family.attached'));return}
  if(b.dataset.hubTab){activityTab=b.dataset.hubTab;renderSaved();return}
  if(b.dataset.activityTab){activityTab=b.dataset.activityTab;renderSaved();$(`#activity-tab-${activityTab}`)?.focus();return}
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
  if(b.dataset.post&&(screen!=='chat'||b.closest('#family-dialog'))){$('#family-dialog').open&&$('#family-dialog').close();openPostNext(+b.dataset.post);brandChat=false;detailChat=false;show('chat');return}
  if(b.dataset.familyBrand){brandChat = canAttachToChat();$('#family-dialog').close();openBrand(b.dataset.familyBrand);return}
  if(b.dataset.brand){openBrand(b.dataset.brand);return}
  if('brandsRetry' in b.dataset){loadBrandStrip();return}
  if('brandRetry' in b.dataset){brandPage.failed=false;renderBrandPage();return}
  if(b.dataset.familyJump){$(FAMILY_JUMP[b.dataset.familyJump])?.scrollIntoView({behavior:'smooth',block:'start'});return}
  if(b.dataset.searchFilter){searchFilter=b.dataset.searchFilter;$('#search-results').dataset.filter=searchFilter;document.querySelectorAll('[data-search-filter]').forEach(x=>{const on=x.dataset.searchFilter===searchFilter;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});return}
  if(b.dataset.auth){authAction(b.dataset.auth);return}
  if(b.dataset.screen){show(b.dataset.screen);return}
  if(b.dataset.set){settingsAction(b.dataset.set);return}
  if(b.dataset.lang){try{localStorage.setItem('alimi-lang',b.dataset.lang)}catch{}location.href=languageURL(b.dataset.lang).href;return}
  if(b.dataset.product)openDetail(b.dataset.product);
  if(b.dataset.favorite){toggleFavorite(state,b.dataset.favorite);track(state.favorites.includes(b.dataset.favorite)?'wishlist_add':'wishlist_remove',b.dataset.favorite);save();renderList();if(screen==='search')renderSearch();if(screen==='saved')renderSaved();if(screen==='detail'&&detailOpen)renderDetail()}
  if(b.dataset.category){category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x.dataset.category===category));renderList()}});
$('#explore-search').onclick=()=>$('#search').focus();
let searchTimer;$('#search').oninput=()=>{renderSearch();clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const q=$('#search').value.trim();if(q)track('search',null,{length:q.length,results:search(products,q).length})},1200)};$('#clear').onclick=()=>{$('#search').value='';renderSearch();$('#search').focus()};
$('#browse-now').onclick=()=>$('.results').scrollIntoView({behavior:'smooth'});
$('#reset').onclick=()=>{if(confirm(t('reset.confirm'))){state={favorites:[],targets:{}};save();renderList()}};
document.addEventListener('click',e=>{const a=e.target.closest('a.observed-buy');if(!a)return;if(a.dataset.sku)track('merchant_click',null,{sku:a.dataset.sku,retailer:a.dataset.retailer??'',market:a.dataset.market??'',from:a.dataset.ref||'options'});else if(selected)track('merchant_click',selected,{retailer:a.dataset.retailer||product(selected)?.retailer,from:a.classList.contains('buy-cta')?'detail_cta':'detail_retailer'})});
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
  products=mergeCatalogSaves(list,readCatalogSaves(storage)).filter(p=>inMarket(p));
  $('#categories').innerHTML=['전체',...CATEGORIES].map(c=>`<button class="chip ${c==='전체'?'active':''}" data-category="${c}">${esc(categoryLabel(c))}</button>`).join('');
  if(products[0])$('#hero-art').innerHTML=art(products.find(p=>p.sku==='10759')??products[0]);
  const latest=products.map(p=>p.checkedAt).filter(Boolean).sort().at(-1);
  $('.notice').textContent=source==='live'?t('notice.live',{date:latest?kstDate(latest):''}):t('notice.offline',{date:exportedAt?kstDate(exportedAt):''});
  renderList();
  track('home_view',null,{source,lang});

}).catch(()=>{$('#products').innerHTML=`<p class="empty">${esc(t('loadFailed'))}</p>`});
auth.handleCallback().catch(error=>toast(error?.message||t('account.failed'))).finally(restoreAccount);
document.addEventListener('profile-change',()=>{if(screen==='saved')renderSaved()});
if(cachedProfile()&&!storage.getItem('seoulbeauty-data-owner'))refreshProfile();

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



