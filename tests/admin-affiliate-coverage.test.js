import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../server/admin-page.html',import.meta.url),'utf8');
const coverage=html.slice(html.indexOf('<div class="admin-affiliate-coverage"'),html.indexOf('<section class="sb-panel admin-ops-panel" id="sb-system"'));
const tiles=[...coverage.matchAll(/<details class="affiliate-brand-tile" data-affiliate-market="(kr|us)" data-brand-name="([^"]+)" data-coverage="([^"]+)">([\s\S]*?)<\/details>/g)];
test('protected revenue panel contains regional brand tiles without replacing quality or status panels',()=>{
 assert.equal(tiles.length,78);
 for(const market of ['kr','us']){
  const group=tiles.filter(x=>x[1]===market);assert.equal(group.length,39);assert.equal(new Set(group.map(x=>x[2])).size,39);
 }
 assert.match(html,/<section[^>]+id="sb-quality"/);assert.match(html,/<section[^>]+id="sb-dev"/);
 assert.match(coverage,/조사 36개 중 30개/);assert.match(coverage,/수동 검토/);assert.match(coverage,/브랜드와 직접 제휴했다는 뜻이 아닙니다/);
 assert.equal(tiles.filter(x=>x[1]==='us'&&x[3]==='verified').length,30);
 assert.deepEqual(tiles.filter(x=>x[1]==='kr'&&x[3]==='verified').map(x=>x[2]).sort(),['클리오','페리페라','구달','더마토리','네이처리퍼블릭'].sort());
});
test('merchant approval, coverage, SKU, live integration and market restrictions are independent',()=>{
 for(const tile of tiles){
  for(const label of ['판매처 / 네트워크','판매처 승인','브랜드 취급','상품·옵션','실제 사이트 연결','국가·언어·채널','배송 / 수수료 국가','근거 확인일']) assert.ok(tile[4].includes('<dt>'+label+'</dt>'),tile[2]+':'+label);
  assert.match(tile[4],/2026-10-23/);assert.match(tile[4],/개별 SKU/);
  if(tile[1]==='kr'&&tile[3]==='verified')assert.match(tile[4],/링크 준비 · 미배포/);
  if(tile[1]==='us')assert.match(tile[4],/SKU·구매 링크·귀속은 미검증/);
 }
 assert.equal(tiles.find(x=>x[1]==='us'&&x[2]==='루나')[3],'unverified');
 assert.match(coverage,/YesStyle \/ Awin · 조건부/);assert.match(coverage,/Sephora US \/ Rakuten · 조건부/);assert.match(coverage,/Ulta · 거절/);
 assert.doesNotMatch(coverage,/승인 수수료 [1-9]|모든 상품.*승인|직접 제휴 완료/);
});
test('native brand disclosures have unique accessible targets and safe public source links',()=>{
 const ids=new Set();
 for(const tile of tiles){
  const id=tile[4].match(/summary aria-controls="([^"]+)"/)[1];assert.ok(!ids.has(id));ids.add(id);assert.ok(tile[4].includes('id="'+id+'"'));
 }
 for(const a of coverage.matchAll(/<a href="([^"]+)"([^>]*)>/g)){
  const url=new URL(a[1].replaceAll('&amp;','&'));assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
  assert.match(a[2],/target="_blank"/);assert.match(a[2],/rel="noopener noreferrer"/);
 }
 for(const path of ['../dist/admin.js','../dist/index.html'])assert.ok(!readFileSync(new URL(path,import.meta.url),'utf8').includes('affiliate-brand-tile'),'coverage data stays in protected server HTML');
});
test('affiliate tabs isolate approved coverage from unverified entries without changing main navigation',()=>{
 const approved=coverage.split('id="affiliate-panel-verified"')[1].split('id="affiliate-panel-unverified"')[0];
 const unverified=coverage.split('id="affiliate-panel-unverified"')[1];
 assert.equal((approved.match(/data-coverage="verified"/g)||[]).length,35);
 assert.doesNotMatch(approved,/data-coverage="unverified"/);
 assert.equal((unverified.match(/data-coverage="unverified"/g)||[]).length,43);
 assert.doesNotMatch(unverified,/data-coverage="verified"/);
 for(const state of ['verified','unverified']){
  assert.match(coverage,new RegExp('id="affiliate-tab-'+state+'" aria-controls="affiliate-panel-'+state+'"'));
  assert.match(coverage,new RegExp('id="affiliate-panel-'+state+'" aria-labelledby="affiliate-tab-'+state+'"'));
 }
 assert.match(coverage,/id="affiliate-panel-unverified"[^>]+hidden/);
 const js=readFileSync(new URL('../dist/admin.js',import.meta.url),'utf8');
 assert.ok(js.includes(`root.querySelectorAll('[role="tab"][id^="sb-"]')`));
 assert.match(js,/img\.addEventListener\('error', failed\)/);
 assert.match(js,/img\.complete && img\.naturalWidth === 0/);
});
test('logos use verified official image bytes with local paths and truthful accessible fallbacks',async()=>{
 const {createHash}=await import('node:crypto');
 const sources=JSON.parse(readFileSync(new URL('./admin-brand-logo-sources.json',import.meta.url),'utf8'));
 assert.equal(sources.length,39);
 assert.equal([...coverage.matchAll(/<img data-brand-logo /g)].length,78);
 for(const source of sources){
  const bytes=readFileSync(new URL('../'+source.path,import.meta.url));
  assert.ok(bytes.length>50);
  if(source.path.endsWith('.svg')){
   const svg=bytes.toString();assert.match(svg,/<svg\b/);assert.doesNotMatch(svg,/<script|<foreignObject|\bonload=/i);
  }else assert.ok(['89504e47','47494638','ffd8ff','52494646'].some(prefix=>bytes.toString('hex').startsWith(prefix)),source.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
  assert.equal(new URL(source.sourceUrl).protocol,'https:');
  assert.ok(coverage.includes('src="/'+source.path.replace(/^dist\//,'')+'"'));
  assert.ok(coverage.includes('alt="'+source.brand+' 로고"'));
 }
 for(const image of coverage.matchAll(/<img ([^>]+)>/g)){
  assert.match(image[1],/src="\/brand-logos\/admin\//);
  assert.match(image[1],/alt="[^"]+ 로고"/);
 }
 assert.doesNotMatch(coverage,/affiliate-logo-missing|공식 로고 미확보/);assert.match(coverage,/로고 표시 불가/);
 assert.doesNotMatch(coverage,/<img[^>]+src="https?:/);
});
