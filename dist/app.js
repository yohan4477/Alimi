import {track} from './events.js';
import {loadProducts,searchCatalog,fetchCatalogPage,requestTracking,CATEGORIES,brandLabel,search,dailySeries,stats,trackedDays,usd,alertState,parseTarget,readState,writeState,toggleFavorite} from './live.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storage;try{storage=localStorage}catch{}
let state=readState(storage),products=[],selected=null,view='all',category='전체',days=30,timer,detailOpen=false;
const product=id=>products.find(p=>p.id===id);
const kstDate=iso=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(new Date(iso));
const stock=p=>p.availability==='in_stock'?'재고 있음':p.availability==='out_of_stock'?'품절':'재고 미확인';
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('show'),2500)}
function save(){try{writeState(storage,state)}catch{toast('현재 화면에서만 저장됩니다.')}}
const art=p=>`<img src="${esc(p.imageUrl)}" alt="${esc(brandLabel(p)+' '+p.name)}" loading="lazy">`;

function change(p){const s=stats(dailySeries(p,30));if(!s||s.days<2||s.max===s.min)return null;return Math.round((p.price/s.avg-1)*100)}
const card=p=>{const c=change(p);return `<article class="card"><button class="product-open" data-product="${esc(p.id)}"><div class="visual">${art(p)}</div><div class="brand">${esc(brandLabel(p))}</div><div class="product-name">${esc(p.name)}</div><div class="price-line">${c===null?'':`<span class="${c<=0?'down':'up'}">${c<=0?'▼':'▲'} ${Math.abs(c)}%</span> `}<strong>${usd(p.price)}</strong></div><small class="meta">${p.size?esc(p.size)+' · ':''}가격 추적 중</small><div class="delivery">${esc(p.retailer)} · ${stock(p)}</div></button><button class="heart" data-favorite="${esc(p.id)}" aria-label="관심 상품" aria-pressed="${state.favorites.includes(p.id)}">${state.favorites.includes(p.id)?'♥':'♡'}</button></article>`};
const catalogCard=c=>`<article class="card"><div class="visual">${c.image_url?`<img src="${esc(c.image_url)}" alt="${esc(brandLabel(c)+' '+c.name)}" loading="lazy">`:'<div class="no-photo">사진 없음</div>'}</div><div class="brand">${esc(brandLabel(c))}</div><div class="product-name">${esc(c.name)}</div><div class="price-line"><strong>${usd(c.price)}</strong></div><small class="meta">${esc(c.category??'')} · 현재가</small><button class="heart" data-track="${esc(c.sku)}" data-retailer="${esc(c.retailer)}" data-market="${esc(c.market)}" aria-label="가격 추적 시작">♡</button></article>`;
function renderList(){
  const q=$('#search').value.trim();
  const items=search(products,q,category).filter(p=>view==='all'||state.favorites.includes(p.id));
  $('#count').textContent=state.favorites.length;
  $('#list-title').textContent=view==='all'?'가격 추적 중':'내가 기다리는 뷰티';
  $('#result-count').textContent=items.length+'개';
  $('#products').innerHTML=(items.length?items.map(card).join(''):`<p class="empty">${view==='all'?'이 카테고리에는 아직 추적 중인 상품이 없어요.':'관심 상품이 없어요. 하트를 눌러 추가해 보세요.'}</p>`)+'<div id="catalog-results" class="catalog-results"></div>';
  if(view!=='all')return;
  if(q.length>=2)renderCatalogSearch(q);else renderCatalogBrowse(true);
}
// Whole-catalog search: tapping the heart starts tracking that exact SKU.
let catalogTimer,catalogSeq=0;
function renderCatalogSearch(q){clearTimeout(catalogTimer);const seq=++catalogSeq;
  catalogTimer=setTimeout(async()=>{let list;try{list=await searchCatalog(q)}catch{list=null}if(seq!==catalogSeq||!$('#catalog-results'))return;const tracked=new Set(products.map(p=>p.sku));list=(list||[]).filter(c=>!tracked.has(c.sku));
    $('#catalog-results').innerHTML=list===null?'':`<div class="heading"><div><h2>Stylevana 전체에서 찾기</h2><p>하트를 누르면 오늘부터 가격을 기록해요</p></div><span>${list.length}개</span></div>`+(list.length?`<div class="catalog-grid">${list.map(catalogCard).join('')}</div>`:'<p class="empty">전체 카탈로그에서도 찾지 못했어요.</p>');
  },350)}
// Home browsing of the Korean-brand catalog by category, loaded page by page as the user scrolls.
const browse={category:null,items:[],done:false,loading:false};let observer;
function renderCatalogBrowse(reset){
  const box=$('#catalog-results');if(!box)return;
  if(reset&&browse.category!==category){Object.assign(browse,{category,items:[],done:false});catalogSeq++}
  const tracked=new Set(products.map(p=>p.sku));
  box.innerHTML=`<div class="heading"><div><h2>전체 상품</h2><p>한국 브랜드 · 하트를 누르면 오늘부터 가격을 기록해요</p></div></div><div class="catalog-grid">${browse.items.filter(c=>!tracked.has(c.sku)).map(catalogCard).join('')}</div>${browse.done?(browse.items.length?'':'<p class="empty">상품이 없어요.</p>'):'<p class="empty" id="catalog-more">불러오는 중…</p>'}`;
  observer?.disconnect();
  const more=$('#catalog-more');if(!more)return;
  observer=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))loadMoreCatalog()},{rootMargin:'600px'});observer.observe(more);
}
async function loadMoreCatalog(){
  if(browse.loading||browse.done)return;browse.loading=true;const seq=catalogSeq;
  try{const page=await fetchCatalogPage(browse.category,browse.items.length);if(seq!==catalogSeq)return;browse.items.push(...page);if(page.length<24)browse.done=true}
  catch{browse.done=true}
  finally{browse.loading=false}
  if(seq===catalogSeq&&!$('#search').value.trim()&&view==='all')renderCatalogBrowse(false);
}
async function startTracking(b){b.disabled=true;try{const slug=await requestTracking({retailer:b.dataset.retailer,market:b.dataset.market,sku:b.dataset.track});const r=await loadProducts();products=r.products;if(!state.favorites.includes(slug))toggleFavorite(state,slug);save();track('wishlist_add',slug,{from:'catalog'});renderList();toast('가격 추적을 시작했어요 · 관심 상품에 추가')}catch{b.disabled=false;toast('추적을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.')}}

function chart(p){
  const series=dailySeries(p,days),s=stats(series),tracked=trackedDays(p);
  let graph=`<div class="chart-wrap history-pending"><strong>가격 기록 중</strong><p>${tracked}일째 수집 중 · 가격이 바뀌면 그래프가 그려져요</p><small>매일 07:30 공식 피드 확인</small></div>`;
  const pts=series.map((d,i)=>({...d,i})).filter(d=>d.price!=null);
  if(s&&pts.length>=2){
    const pad=Math.max(.5,(s.max-s.min)*.25),lo=s.min-pad,hi=s.max+pad,y=v=>190-(v-lo)/(hi-lo)*150,x=i=>12+i*326/(days-1);
    graph=`<div class="chart-wrap"><svg viewBox="0 0 350 240" role="img" aria-label="최근 ${days}일 상품가, USD"><title>상품가 · USD</title>${s.max!==s.min?`<text x="335" y="${y(s.max)-12}" text-anchor="end" fill="#16ab51">최고 ${usd(s.max)}</text><text x="335" y="${y(s.min)+23}" text-anchor="end" fill="#f25b55">최저 ${usd(s.min)}</text>`:''}<polyline points="${pts.map(d=>x(d.i)+','+y(d.price)).join(' ')}" fill="none" stroke="#f25b55" stroke-width="2.6" stroke-linejoin="round"/><circle cx="${x(pts.at(-1).i)}" cy="${y(pts.at(-1).price)}" r="3.5" fill="#f25b55"/><text x="12" y="233">${days-1}일 전</text><text x="338" y="233" text-anchor="end">오늘</text></svg></div>`;
  }
  return graph+`<div class="stats">${[['최고가',s?.max,'up','▲'],['평균가',s?.avg,'','−'],['최저가',s?.min,'down','▼']].map(([t,v,c,icon])=>`<div><span><i class="${c}">${icon}</i>${t}</span><strong class="${v==null?'':c}">${v==null?'—':usd(v)}</strong></div>`).join('')}</div><p class="chart-note">USD 상품가 · 수집 시작 ${p.history.length?kstDate(p.history[0].at):'—'} · 그 이전 가격은 표시하지 않아요</p>`;
}

function renderDetail(){
  const p=product(selected),target=state.targets[p.id]??null,fav=state.favorites.includes(p.id);
  $('#detail').innerHTML=`<div class="detail-nav"><button id="back" aria-label="뒤로">←</button><strong>상품 상세</strong><button data-favorite="${esc(p.id)}" aria-label="관심 상품">${fav?'♥':'♡'}</button></div><div class="detail-product"><div class="detail-art">${art(p)}</div><div class="price-summary"><small>${esc(p.retailer)} · 미국 상품가</small><div class="current"><strong>${usd(p.price)}</strong></div><p class="price-baseline">${kstDate(p.checkedAt)} 확인 · 가격 변경 ${kstDate(p.changedAt)}</p><h1>${esc(p.name)}</h1><p class="product-meta">${esc(brandLabel(p))}${p.size?' · '+esc(p.size):''} · ${esc(p.category)}</p><div class="info-chips"><span>${stock(p)}</span><span>배송비 ${p.delivery==null?'미확인':usd(p.delivery)}~</span></div></div></div><section class="analysis-section"><h2>가격 흐름</h2><div class="periods" aria-label="가격 이력 기간">${[7,14,30].map(n=>`<button data-days="${n}" aria-pressed="${n===days}" class="${n===days?'active':''}">${n}일</button>`).join('')}</div>${chart(p)}</section><section class="offer-section"><div class="offer-heading"><h2>판매처</h2><small>공식 제휴 피드</small></div><article class="seller-row"><div class="seller-info"><strong>${esc(p.retailer)}</strong><small>피드 배송비 ${p.delivery==null?'미확인':usd(p.delivery)} · 주소별 결제 총액은 판매처에서 확인</small></div><div class="seller-price"><strong>${usd(p.price)}</strong><small>${stock(p)}</small></div><a class="observed-buy" href="${esc(p.affiliateUrl||p.url)}" target="_blank" rel="sponsored noopener noreferrer">Stylevana에서 보기 ↗</a></article><p class="chart-note">표시 가격은 결제 가격과 다를 수 있어요. 제휴 링크로 구매하면 Alimi가 수수료를 받을 수 있어요.</p></section><section class="target-section"><h2>나의 목표가</h2><div id="alert-status">${target===null?'원하는 USD 상품가를 저장해 보세요':usd(target)+' · '+alertState(target,p.price)}</div><p class="chart-note">배송비·세금 제외 · 이 기기에 저장 · 푸시 알림은 준비 중</p>${target===null?'':'<button id="remove-target">목표가 삭제</button>'}</section><div class="detail-actions"><button data-favorite="${esc(p.id)}" class="save-action">${fav?'♥':'♡'}<small>관심</small></button><button id="set-target" class="primary">목표가 설정</button></div>`;
  $('#back').onclick=closeDetail;
  $('#set-target').onclick=()=>{$('#target').value=state.targets[p.id]??'';$('#target-dialog').showModal()};
  if($('#remove-target'))$('#remove-target').onclick=()=>{delete state.targets[p.id];save();renderDetail()};
}
function closeDetail(){detailOpen=false;$('#detail').hidden=true;$('#browse').hidden=false;window.scrollTo(0,0)}
function openDetail(id){selected=id;track('product_view',id);detailOpen=true;renderDetail();$('#browse').hidden=true;$('#detail').hidden=false;window.scrollTo(0,0)}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.track){startTracking(b);return}
  if(b.dataset.product)openDetail(b.dataset.product);
  if(b.dataset.favorite){toggleFavorite(state,b.dataset.favorite);track(state.favorites.includes(b.dataset.favorite)?'wishlist_add':'wishlist_remove',b.dataset.favorite);save();renderList();if(detailOpen)renderDetail()}
  if(b.dataset.days){days=+b.dataset.days;const y=window.scrollY;renderDetail();window.scrollTo(0,y)}
  if(b.dataset.category){category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x.dataset.category===category));renderList()}
  if(b.dataset.view){view=b.dataset.view;document.querySelectorAll('nav [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));renderList();window.scrollTo(0,0)}});
$('#target-form').onsubmit=e=>{e.preventDefault();const v=parseTarget($('#target').value);if(v===null){toast('USD 0.01~10,000, 소수 둘째 자리까지 입력하세요');return}state.targets[selected]=v;save();track('target_price_set',selected);$('#target-dialog').close();renderDetail();toast('목표가를 저장했어요')};
let searchTimer;$('#search').oninput=()=>{renderList();clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const q=$('#search').value.trim();if(q)track('search',null,{length:q.length,results:search(products,q,category).length})},1200)};$('#clear').onclick=()=>{$('#search').value='';renderList()};$('#search-tab').onclick=()=>{$('#search').focus();window.scrollTo(0,0)};
$('#browse-now').onclick=()=>$('.results').scrollIntoView({behavior:'smooth'});
$('#reset').onclick=()=>{if(confirm('관심 상품과 목표가를 초기화할까요?')){state={favorites:[],targets:{}};save();renderList()}};
document.addEventListener('click',e=>{const a=e.target.closest('a.observed-buy');if(a&&selected)track('merchant_click',selected,{retailer:product(selected)?.retailer})});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){const box=document.createElement('div');box.className='no-photo';box.textContent='상품 사진을 불러오지 못했어요';e.target.replaceWith(box)}},true);

$('#products').innerHTML='<p class="empty">가격을 불러오는 중…</p>';
loadProducts().then(({products:list,source,exportedAt})=>{
  products=list;
  $('#categories').innerHTML=['전체',...CATEGORIES].map(c=>`<button class="chip ${c==='전체'?'active':''}" data-category="${c}">${c}</button>`).join('');
  if(products[0])$('#hero-art').innerHTML=art(products.find(p=>p.sku==='10759')??products[0]);
  const latest=products.map(p=>p.checkedAt).sort().at(-1);
  $('.notice').textContent=source==='live'?`Stylevana US 공식 피드 · 한국 브랜드 · 가격 추적 ${products.length}개 · ${latest?kstDate(latest):''} 확인`:`오프라인 데이터 · ${exportedAt?kstDate(exportedAt):''} 기준`;
  renderList();
  track('home_view',null,{source});
}).catch(()=>{$('#products').innerHTML='<p class="empty">가격을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>'});
