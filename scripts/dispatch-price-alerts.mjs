import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validQuote, priceDrop, quietHours, apnsJWT, sendAPNs} from './price-alerts.mjs';

export function databaseClient(url, key, fetcher = fetch) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(base.hostname) || base.pathname !== '/' || base.search || base.hash)
    throw Error('Unexpected backend URL');
  return async (path, method='GET', body, prefer) => {
    const response=await fetcher(new URL('/rest/v1/'+path,base),{method,redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',...(prefer?{prefer}:{})},
      body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok)throw Error('Backend HTTP '+response.status); // Never log body, keys or device tokens.
    const text=await response.text();
    return text.trim() ? JSON.parse(text) : null;
  };
}
export async function dispatch({snapshot, db, send, clock = () => new Date()}) {
  const now=clock();
  const quote=validQuote(snapshot,now.getTime());
  // Worker reads a freshly imported feed, never the bundled app snapshot.
  await db('rpc/alimi_ingest_quote','POST',{p_quote:quote});
  const claims=await db('rpc/alimi_claim_alerts','POST',{});
  const counts={claimed:claims.length,accepted:0,failed:0,unknown:0,skipped:0};
  for(const claim of claims) {
    const filter=`user_id=eq.${encodeURIComponent(claim.user_id)}`;
    const devices=await db(`alimi_devices?${filter}&select=token,environment,time_zone,enabled`);
    const watches=await db(`alimi_watches?${filter}&product_id=eq.2&select=enabled`);
    const device=devices?.[0];
    // Check opt-out/token rotation/quiet hours immediately before handing off to APNs.
    let result='failed';
    let fresh=true;try{validQuote(snapshot,clock().getTime());}catch{fresh=false;}
    if(!fresh || !device?.enabled || !watches?.[0]?.enabled || device.token!==claim.token || device.environment!==claim.environment ||
       quietHours(device.time_zone,clock()) || claim.product_id!=='2' || claim.amount_cents!==quote.amount_cents ||
       !priceDrop({current:quote.amount_cents,baseline:claim.baseline_cents,lastAccepted:claim.last_accepted_cents,inStock:quote.in_stock})) {
      counts.skipped++;
    } else {
      try {
        const response=await send({...claim,amountCents:claim.amount_cents,id:claim.claim_id});
        result=response.accepted?'accepted':'failed';
        if(response.invalidToken)await db(`alimi_devices?${filter}&token=eq.${encodeURIComponent(claim.token)}`,'PATCH',{enabled:false},'return=minimal');
      } catch {result='unknown';}
      counts[result]++;
    }
    await db('rpc/alimi_finish_alert','POST',{p_user:claim.user_id,p_product:claim.product_id,p_claim:claim.claim_id,p_status:result});
  }
  return counts;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.includes('--ingest')) {
      const db=databaseClient(process.env.ALIMI_SUPABASE_URL,process.env.ALIMI_SUPABASE_SERVICE_KEY);
      const snapshot=JSON.parse(await readFile(resolve('data/stylevana-us.json'),'utf8'));
      await db('rpc/alimi_ingest_quote','POST',{p_quote:validQuote(snapshot)});
      console.log('Official quote ingested; no push attempted.');
      process.exit(0);
    }
    const required=['ALIMI_SUPABASE_URL','ALIMI_SUPABASE_SERVICE_KEY','ALIMI_APNS_KEY_ID','ALIMI_APNS_TEAM_ID','ALIMI_APNS_PRIVATE_KEY','ALIMI_APNS_TOPIC'];
    if(required.some(key=>!process.env[key]))throw Error('Alert backend/APNs configuration incomplete');
    const snapshot=JSON.parse(await readFile(resolve('data/stylevana-us.json'),'utf8'));
    const jwt=apnsJWT({keyId:process.env.ALIMI_APNS_KEY_ID,teamId:process.env.ALIMI_APNS_TEAM_ID,privateKey:process.env.ALIMI_APNS_PRIVATE_KEY});
    const db=databaseClient(process.env.ALIMI_SUPABASE_URL,process.env.ALIMI_SUPABASE_SERVICE_KEY);
    console.log(JSON.stringify(await dispatch({snapshot,db,send:claim=>sendAPNs({...claim,jwt,topic:process.env.ALIMI_APNS_TOPIC})})));
  }catch {console.error('Price alert dispatch failed. Check configuration/worker state; sensitive details suppressed.');process.exitCode=1;}
}
