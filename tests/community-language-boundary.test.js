import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {GoogleAuth} from '../dist/auth.js';
import {setLang,t} from '../dist/i18n.js';

test('game community and optional account links explicitly preserve selected UI language',()=>{
 for(const name of ['bridge-cta.tsx','account-link.tsx']){
  const source=readFileSync(new URL('../web/beauty-play/'+name,import.meta.url),'utf8');
  assert.match(source,/href=\{ko\?'\/kr\?lang=ko':'\/us\?lang=en'\}/);
 }
 const source=readFileSync(new URL('../web/beauty-play/account-link.tsx',import.meta.url),'utf8');
 assert.match(source,/href=\{ko\?'\/beauty-play\/\?lang=ko':'\/beauty-play\/\?lang=en'\}/);
});
test('explicit handoff language overrides opposite remembered language without changing destination region',()=>{
 for(const [path,language,saved] of [['/us','en','ko'],['/kr','ko','en'],['/kr','en','ko'],['/us','ko','en']]){
  const output=execFileSync(process.execPath,['--input-type=module','-e',`
   globalThis.location={pathname:${JSON.stringify(path)},search:${JSON.stringify('?lang='+language)}};
   globalThis.localStorage={getItem:key=>key==='alimi-lang'?${JSON.stringify(saved)}:null,setItem(){}};
   const {lang}=await import('./dist/i18n.js');const {region}=await import('./dist/region.js');
   console.log(JSON.stringify({lang,region}));`],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.deepEqual(JSON.parse(output),{lang:language,region:path.slice(1)});
 }
});
test('authentication HTTP and network errors use chosen language, never raw provider detail',async()=>{
 for(const lang of ['ko','en']){
  setLang(lang);
  for(const field of ['msg','message','error_description','error']){
   const auth=new GoogleAuth({storage:{},sessionStorage:{},location:{},fetchImpl:async()=>({ok:false,status:400,json:async()=>({[field]:'RAW_PROVIDER_DETAIL_민감'})})});
   await assert.rejects(auth.request('token'),e=>e.message===t('account.failed')&&e.status===400&&!e.message.includes('RAW_PROVIDER_DETAIL'));
  }
  const network=new GoogleAuth({storage:{},sessionStorage:{},location:{},fetchImpl:async()=>{throw Error('Failed to fetch RAW_NETWORK_DETAIL');}});
  await assert.rejects(network.request('token'),e=>e.message===t('account.failed'));
  const disabled=new GoogleAuth({storage:{},sessionStorage:{},location:{},fetchImpl:async()=>({ok:false,status:400,json:async()=>({error:'Unsupported provider'})})});
  await assert.rejects(disabled.request('token'),e=>e.message===t('account.providerDisabled')&&e.status===400);
 }
});
