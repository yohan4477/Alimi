import {createPrivateKey, sign, randomUUID} from 'node:crypto';
import {connect} from 'node:http2';

// Product price only, USD, one exact 100ml item. Never implies a checkout total.
export function validQuote(snapshot, now = Date.now()) {
  const q = snapshot?.latest;
  const age = now - Date.parse(q?.observedAt);
  if (snapshot?.schemaVersion !== 1 || q?.productId !== '2' || q.market !== 'US' || q.currency !== 'USD' ||
      q.size !== '100ml' || q.quantity !== 1 || q.feedId !== '111294' || q.merchantProductId !== '10759' ||
      q.ean !== '8809416470009' || !Number.isFinite(q.amount) || q.amount <= 0 || q.amount > 10000 ||
      Math.abs(q.amount * 100 - Math.round(q.amount * 100)) > 1e-6 || !Number.isFinite(age) || age < -60000 || age > 7200000)
    throw Error('Invalid, future or stale official quote');
  return {product_id:'2', amount_cents:Math.round(q.amount*100), collected_at:q.observedAt,
    in_stock:q.availability === 'in_stock'};
}
export function priceDrop({current, baseline, lastAccepted = null, enabled = true, inStock = true}) {
  const anchor = lastAccepted ?? baseline;
  return enabled && inStock && Number.isSafeInteger(current) && current > 0 &&
    Number.isSafeInteger(anchor) && anchor > 0 && current * 100 <= anchor * 95;
}
export function quietHours(timeZone, now = new Date()) {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',hourCycle:'h23'}).format(now));
    return hour < 8 || hour >= 22;
  } catch { return true; } // Invalid timezone fails closed.
}
export function notificationPayload(amountCents) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw Error('Invalid price');
  return {aps:{alert:{title:'관심 상품 가격이 내려갔어요',
    body:`COSRX 100ml · Stylevana US $${(amountCents/100).toFixed(2)}. 배송비·세금 별도, 구매 전 확인해 주세요.`},sound:'default'},
    productId:'2',market:'US',currency:'USD',amountCents};
}
export function apnsJWT({keyId, teamId, privateKey}, now = Date.now()) {
  if (!/^[A-Z0-9]{10}$/.test(keyId) || !/^[A-Z0-9]{10}$/.test(teamId)) throw Error('Invalid APNs key identifiers');
  const header = Buffer.from(JSON.stringify({alg:'ES256',kid:keyId})).toString('base64url');
  const claims = Buffer.from(JSON.stringify({iss:teamId,iat:Math.floor(now/1000)})).toString('base64url');
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw Error('APNs requires P-256');
  const data = `${header}.${claims}`;
  return `${data}.${sign('sha256',Buffer.from(data),{key,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
}
export async function sendAPNs({token, environment, topic, jwt, amountCents, id = randomUUID()}) {
  if (!/^[a-f0-9]{32,256}$/.test(token) || !['sandbox','production'].includes(environment) ||
      !/^[A-Za-z0-9.-]+$/.test(topic)) throw Error('Invalid push destination');
  const body = JSON.stringify(notificationPayload(amountCents));
  const session = connect(environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
  return await new Promise((resolve,reject) => {
    let settled=false, request;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);session.destroy();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>finish(Error('APNs timeout; outcome unknown')),15000);
    session.on('error',()=>finish(Error('APNs connection failed; outcome unknown')));
    session.on('connect',()=>{
      request=session.request({':method':'POST',':path':`/3/device/${token}`,authorization:`bearer ${jwt}`,
        'apns-topic':topic,'apns-push-type':'alert','apns-priority':'10','apns-expiration':'0',
        'apns-id':id,'apns-collapse-id':'alimi-us-2','content-type':'application/json'});
      let status=0, response='';
      request.on('response',headers=>{status=Number(headers[':status']);});
      request.setEncoding('utf8');request.on('data',chunk=>{if(response.length<4096)response+=chunk;});
      request.on('error',()=>finish(Error('APNs stream failed; outcome unknown')));
      request.on('end',()=>{let reason;try{reason=JSON.parse(response).reason;}catch{}
        finish(null,{status,accepted:status===200,invalidToken:status===410 || reason==='BadDeviceToken'});});
      request.end(body);
    });
  });
}
