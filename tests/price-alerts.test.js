import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {validQuote,priceDrop,quietHours,notificationPayload,apnsJWT,sendAPNs} from '../scripts/price-alerts.mjs';
import {dispatch,databaseClient} from '../scripts/dispatch-price-alerts.mjs';
const now=new Date('2026-10-17T03:00:00Z');
const snapshot=()=>({schemaVersion:1,latest:{productId:'2',market:'US',currency:'USD',size:'100ml',quantity:1,feedId:'111294',merchantProductId:'10759',ean:'8809416470009',amount:16,observedAt:now.toISOString(),availability:'in_stock'}});
const claim={user_id:'00000000-0000-0000-0000-000000000001',product_id:'2',token:'a'.repeat(64),environment:'sandbox',time_zone:'Asia/Seoul',amount_cents:1600,baseline_cents:1750,last_accepted_cents:null,claim_id:'00000000-0000-0000-0000-000000000002'};
function fakeDB({device={},watch=true}={}) {
  const calls=[];
  const db=async(path,method,body)=>{
    calls.push({path,method,body});
    if(path==='rpc/alimi_claim_alerts')return [{...claim}];
    if(path.startsWith('alimi_devices')&& !method)return [{...claim,enabled:true,...device}];
    if(path.startsWith('alimi_watches'))return [{enabled:watch}];
    return null;
  };
  return {db,calls};
}
test('price drop threshold and repeat suppression use integer cents',()=>{
  assert.equal(priceDrop({current:1663,baseline:1750}),false);
  assert.equal(priceDrop({current:1662,baseline:1750}),true);
  assert.equal(priceDrop({current:1600,baseline:1750,lastAccepted:1600}),false);
  assert.equal(priceDrop({current:1520,baseline:1750,lastAccepted:1600}),true);
  for(const changes of [{inStock:false},{enabled:false},{current:-1},{baseline:null},{current:1.5}])
    assert.equal(priceDrop({current:1600,baseline:1750,...changes}),false);
});
test('fresh official quote only, no cross-market or old bundled data',()=>{
  assert.equal(validQuote(snapshot(),+now).amount_cents,1600);
  for(const changes of [{market:'KR'},{currency:'KRW'},{size:'200ml'},{quantity:2},{ean:'x'},{feedId:'104951'},{amount:0},{amount:1.001},{observedAt:'bad'},{observedAt:'2026-10-16T00:00:00Z'},{observedAt:'2026-10-17T04:00:00Z'}]) {
    const s=snapshot();Object.assign(s.latest,changes);assert.throws(()=>validQuote(s,+now));
  }
});
test('quiet hours are device-local and unknown timezone fails closed',()=>{
  assert.equal(quietHours('Asia/Seoul',new Date('2026-10-16T22:59:00Z')),true);
  assert.equal(quietHours('Asia/Seoul',new Date('2026-10-16T23:00:00Z')),false);
  assert.equal(quietHours('Asia/Seoul',new Date('2026-10-17T13:00:00Z')),true);
  assert.equal(quietHours('America/New_York',now),true);
  assert.equal(quietHours('unknown',now),true);
});
test('notification makes product price, currency and unknown total explicit',()=>{
  const p=notificationPayload(1600);assert.match(p.aps.alert.body,/\$16.00/);assert.match(p.aps.alert.body,/배송비·세금 별도/);
  assert.equal(p.productId,'2');assert.equal(p.currency,'USD');assert.throws(()=>notificationPayload(NaN));
});
test('APNs token is real P-256 ES256 signature with injected time',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const jwt=apnsJWT({keyId:'ABCDEFGHIJ',teamId:'0123456789',privateKey:privateKey.export({type:'pkcs8',format:'pem'})},+now);
  const [head,body,signature]=jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(head,'base64url')),{alg:'ES256',kid:'ABCDEFGHIJ'});
  assert.equal(JSON.parse(Buffer.from(body,'base64url')).iat,+now/1000);
  assert.equal(verify('sha256',Buffer.from(head+'.'+body),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')),true);
});
test('invalid push destination is rejected before network access',async()=>{
  await assert.rejects(sendAPNs({token:'bad',environment:'sandbox',topic:'com.alimi.prototype'}));
});
test('fresh quote -> claim -> opt-out recheck -> APNs acceptance -> recorded accepted',async()=>{
  const {db,calls}=fakeDB();let sent=0;
  const counts=await dispatch({snapshot:snapshot(),db,clock:()=>now,send:async input=>{sent++;assert.equal(input.amountCents,1600);return {accepted:true};}});
  assert.equal(sent,1);assert.equal(counts.accepted,1);
  assert.equal(calls[0].path,'rpc/alimi_ingest_quote');assert.equal(calls.at(-1).body.p_status,'accepted');
});
test('permission withdrawal, removed watch, rotated token and quiet hours cancel send',async()=>{
  for(const config of [{device:{enabled:false}},{watch:false},{device:{token:'b'.repeat(64)}},{device:{time_zone:'America/New_York'}}]) {
    const {db}=fakeDB(config);let sent=0;
    const counts=await dispatch({snapshot:snapshot(),db,clock:()=>now,send:async()=>{sent++;}});
    assert.equal(sent,0);assert.equal(counts.skipped,1);
  }
});
test('lost APNs response is unknown, not accepted or automatically retried',async()=>{
  const {db,calls}=fakeDB();const counts=await dispatch({snapshot:snapshot(),db,clock:()=>now,send:async()=>{throw Error('timeout');}});
  assert.equal(counts.unknown,1);assert.equal(calls.at(-1).body.p_status,'unknown');
});
test('invalid APNs token disables only matching old token',async()=>{
  const {db,calls}=fakeDB();await dispatch({snapshot:snapshot(),db,clock:()=>now,send:async()=>({accepted:false,invalidToken:true})});
  assert.equal(calls.find(c=>c.method==='PATCH').body.enabled,false);
  assert.match(calls.find(c=>c.method==='PATCH').path,/token=eq\./);
});
test('stale snapshot never mutates backend or contacts APNs',async()=>{
  let calls=0;await assert.rejects(dispatch({snapshot:snapshot(),clock:()=>new Date('2026-10-18'),db:async()=>{calls++;},send:async()=>{calls++;}}));assert.equal(calls,0);
});
test('backend accepts empty minimal responses and sanitizes HTTP failures',async()=>{
  const db=databaseClient('https://example.supabase.co','secret',async()=>new Response(null,{status:201}));assert.equal(await db('test','POST',{}),null);
  const bad=databaseClient('https://example.supabase.co','secret',async()=>new Response('private-token',{status:500}));
  await assert.rejects(bad('test'),{message:'Backend HTTP 500'});
  assert.throws(()=>databaseClient('https://evil.test','secret'));
});
