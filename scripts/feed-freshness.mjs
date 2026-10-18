import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Daily collection runs at 22:30 UTC; 36h tolerates one delayed schedule but not a skipped day.
export const maxAgeHours=36;
export function assessFreshness(snapshot, now=new Date().toISOString(), limitHours=maxAgeHours) {
  const last=snapshot?.checks?.at(-1)?.checkedAt ?? snapshot?.collectedAt;
  if(!last||!Number.isFinite(Date.parse(last)))return {fresh:false,reason:'No collection time recorded'};
  if(!Number.isFinite(Date.parse(now)))throw Error('Invalid current time');
  const ageHours=(Date.parse(now)-Date.parse(last))/3600000;
  if(ageHours<-0.1)return {fresh:false,lastCheckedAt:last,ageHours,reason:'Collection time is in the future'};
  if(snapshot.checks?.length && snapshot.checks.at(-1).fingerprint!==snapshot.latest?.fingerprint)return {fresh:false,lastCheckedAt:last,ageHours,reason:'Latest check does not match latest observation'};
  if(ageHours>limitHours)return {fresh:false,lastCheckedAt:last,ageHours,reason:`Last successful collection is older than ${limitHours}h`};
  return {fresh:true,lastCheckedAt:last,ageHours,checkCount:snapshot.checks?.length??0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const path=resolve(root,process.argv[2]||'data/stylevana-us.json');
  try {
    const result=assessFreshness(JSON.parse(await readFile(path,'utf8')));
    console.log(JSON.stringify({...result,ageHours:result.ageHours===undefined?undefined:Math.round(result.ageHours*10)/10}));
    if(!result.fresh)process.exitCode=1;
  } catch(e) { console.error('Freshness check failed: '+e.message);process.exitCode=1; }
}
