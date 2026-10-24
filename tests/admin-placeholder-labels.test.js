import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../server/admin-page.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../dist/admin.js',import.meta.url),'utf8');
test('static admin KPIs describe pending aggregation, not a service outage or fabricated zeros',()=>{
 assert.equal((html.match(/<strong>집계 준비 중<\/strong>/g)||[]).length,22);
 assert.equal((html.match(/<strong>미연결<\/strong>/g)||[]).length,0);
 assert.equal((html.match(/실제 서비스·판매처의 연결 장애를 뜻하지 않습니다/g)||[]).length,5);
 for(const id of ['users','community','products','revenue','system']){
  const section=html.split('id="sb-'+id+'"')[1].split('</section>')[0];
  assert.equal((section.match(/<strong>집계 준비 중<\/strong>/g)||[]).length,4);
  assert.doesNotMatch(section,/<strong>0<\/strong>/);
 }
 assert.match(html,/상단 방문·참여·리텐션·수익 KPI는 관리자 통합 집계 준비 중/);
});
test('existing diagnostic scope and eight live bindings remain distinct from placeholder KPIs',()=>{
 assert.deepEqual([...html.matchAll(/data-metric="([^"]+)"/g)].map(x=>x[1]),['community','rooms','detail','merchant','saved','beautyDraftOpen','beautyRoomSelected','beautyPublished']);
 assert.match(html,/기존 행동 이벤트 진단 · 최근 7일/);
 assert.match(html,/사람 수나 순차 전환 퍼널이 아닙니다/);
 assert.match(js,/unavailable:'불러오기 실패'/);
 assert.match(js,/denied:'조회 권한 없음'/);
 assert.match(js,/no_data:'미수신'/);
 assert.match(js,/unconnected:'미연결'/);
 assert.match(js,/e\.textContent='불러오기 실패'/);
 assert.match(js,/data\.state==='received'&&Number\.isFinite\(value\)/);
});
