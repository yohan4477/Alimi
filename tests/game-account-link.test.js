import test from 'node:test';
import assert from 'node:assert/strict';
import {readGamePicks,rememberGamePick,syncGamePicks} from '../web/beauty-play/account-link.ts';
class Store {
  data=new Map();
  getItem(k){return this.data.get(k)??null}
  setItem(k,v){this.data.set(k,String(v))}
}
const session=(id,token)=>JSON.stringify({access_token:token,user:{id}});
const pick=id=>({id,character:'mona',scenario:'campus',product:'p01',shade:'red',advice:'natural',reasons:['color'],experience:null});
const answer=(data,status=200)=>({ok:status<400,status,json:async()=>data});
test('game picks persist without secrets and preserve last 50',()=>{
 const st=new Store();
 for(let i=0;i<55;i++)rememberGamePick(pick('vote-'+i),st);
 assert.equal(readGamePicks(st).length,50);
 assert.equal(readGamePicks(st)[0].id,'vote-5');
 assert.equal(st.getItem('alimi-auth-session-v1'),null);
});
test('game picks restore into authenticated account from cloud',async()=>{
 const st=new Store();st.setItem('alimi-auth-session-v1',session('A','tokenA'));st.setItem('seoulbeauty-data-owner','A');
 const requests=[];
 const ok=await syncGamePicks(async(url,opts)=>{
   requests.push({url,opts});
   if(url.includes('/auth/v1/user'))return answer({id:'A'});
   if(opts.method==='POST')return answer(null,204);
   return answer([{value:JSON.stringify([pick('cloud-1')])}]);
 },st);
 assert.equal(ok,true);
 assert.equal(readGamePicks(st)[0].id,'cloud-1');
 assert.equal(requests[2].opts.headers.Authorization,'Bearer tokenA');
});
test('never merge old account picks into new account',async()=>{
 const st=new Store();st.setItem('alimi-auth-session-v1',session('B','tokenB'));st.setItem('seoulbeauty-data-owner','A');
 rememberGamePick(pick('old-A'),st);
 let calls=0;
 assert.equal(await syncGamePicks(async()=>{calls++;return answer({id:'B'})},st),false);
 assert.equal(calls,1);
});
test('session change before account preference upload aborts',async()=>{
 const st=new Store();st.setItem('alimi-auth-session-v1',session('A','tokenA'));st.setItem('seoulbeauty-data-owner','A');
 rememberGamePick(pick('from-A'),st);
 let posts=0;
 const ok=await syncGamePicks(async(url,opts)=>{
   if(url.includes('/auth/v1/user'))return answer({id:'A'});
   st.setItem('alimi-auth-session-v1',session('B','tokenB'));
   if(opts.method==='POST')posts++;
   return answer([]);
 },st);
 assert.equal(ok,false);
 assert.equal(posts,0);
});
