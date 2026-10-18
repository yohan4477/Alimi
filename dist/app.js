import {track} from './events.js';
import {openChat} from './chat.js';
import {t,lang,locale,categoryLabel} from './i18n.js';
import {loadProducts,searchCatalog,fetchFamiliesPage,fetchFamily,unitName,requestTracking,CATEGORIES,brandLabel,watchSummary,search,dailySeries,stats,usd,alertState,parseTarget,readState,writeState,toggleFavorite} from './live.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storage;try{storage=localStorage}catch{}
let state=readState(storage),products=[],selected=null,view='all',category='전체',days=30,timer,detailOpen=false;
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
function renderList(){
  const q=$('#search').value.trim();
  const items=search(products,q,category).filter(p=>view==='all'||state.favorites.includes(p.id));
  $('#count').textContent=state.favorites.length;
  $('#list-title').textContent=t(view==='all'?'section.watching':'section.saved');
  $('#result-count').textContent=t('count',{n:items.length});
  $('#products').innerHTML=(items.length?items.map(card).join(''):`<p class="empty">${esc(t(view==='all'?'empty.watchingCategory':'empty.saved'))}</p>`)+'<div id="catalog-results" class="catalog-results"></div>';
  if(view!=='all')return;
  if(q.length>=2)renderCatalogSearch(q);else renderCatalogBrowse(true);
}
// Whole-catalog search: tapping the heart saves the item and starts watching that exact SKU.
let catalogTimer,catalogSeq=0;
function renderCatalogSearch(q){clearTimeout(catalogTimer);const seq=++catalogSeq;
  catalogTimer=setTimeout(async()=>{let list;try{list=await searchCatalog(q)}catch{list=null}if(seq!==catalogSeq||!$('#catalog-results'))return;const tracked=new Set(products.map(p=>p.sku));list=(list||[]).filter(c=>!tracked.has(c.sku));
    $('#catalog-results').innerHTML=list===null?'':`<div class="heading"><div><h2>${esc(t('section.more'))}</h2><p>${esc(t('section.moreHint'))}</p></div><span>${esc(t('count',{n:list.length}))}</span></div>`+(list.length?`<div class="catalog-grid">${list.map(catalogCard).join('')}</div>`:`<p class="empty">${esc(t('empty.catalogSearch'))}</p>`);
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
  try{const page=await fetchFamiliesPage(browse.category,browse.items.length);if(seq!==catalogSeq)return;browse.items.push(...page);if(page.length<24)browse.done=true}
  catch{browse.done=true}
  finally{browse.loading=false}
  if(seq===catalogSeq&&!$('#search').value.trim()&&view==='all')renderCatalogBrowse(false);
}
async function startTracking(b){b.disabled=true;try{const slug=await requestTracking({retailer:b.dataset.retailer,market:b.dataset.market,sku:b.dataset.track});const r=await loadProducts();products=r.products;if(!state.favorites.includes(slug))toggleFavorite(state,slug);save();track('wishlist_add',slug,{from:'catalog'});renderList();if(detailOpen)renderDetail();b.outerHTML=`<button class="variant-heart" data-favorite="${esc(slug)}" aria-pressed="true">♥</button>`;toast(t('toast.saved'))}catch{b.disabled=false;toast(t('toast.saveFailed'))}}

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
function closeDetail(){detailOpen=false;$('#detail').hidden=true;$('#browse').hidden=false;window.scrollTo(0,0)}
function openDetail(id){selected=id;track('product_view',id);detailOpen=true;renderDetail();$('#browse').hidden=true;$('#detail').hidden=false;window.scrollTo(0,0)}

localizePage();
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.track){startTracking(b);return}
  if(b.dataset.family){openFamily(b.dataset.family);return}
  if(b.dataset.product)openDetail(b.dataset.product);
  if(b.dataset.favorite){toggleFavorite(state,b.dataset.favorite);track(state.favorites.includes(b.dataset.favorite)?'wishlist_add':'wishlist_remove',b.dataset.favorite);save();renderList();if(detailOpen)renderDetail()}
  if(b.dataset.days){days=+b.dataset.days;const y=window.scrollY;renderDetail();window.scrollTo(0,y)}
  if(b.dataset.category){category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x.dataset.category===category));renderList()}
  if(b.dataset.view){view=b.dataset.view;document.querySelectorAll('nav [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));renderList();window.scrollTo(0,0)}});
$('#target-form').onsubmit=e=>{e.preventDefault();const v=parseTarget($('#target').value);if(v===null){toast(t('target.invalid'));return}state.targets[selected]=v;save();track('target_price_set',selected);$('#target-dialog').close();renderDetail();toast(t('target.saved'))};
let searchTimer;$('#search').oninput=()=>{renderList();clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const q=$('#search').value.trim();if(q)track('search',null,{length:q.length,results:search(products,q,category).length})},1200)};$('#clear').onclick=()=>{$('#search').value='';renderList()};$('#search-tab').onclick=()=>{$('#search').focus();window.scrollTo(0,0)};$('#chat-tab').onclick=()=>openChat({toast,onClose:renderList});
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
}).catch(()=>{$('#products').innerHTML=`<p class="empty">${esc(t('loadFailed'))}</p>`});
