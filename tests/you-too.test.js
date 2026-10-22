import test from 'node:test';
import assert from 'node:assert/strict';
import {validAnswer,comparison,shareText,products} from '../dist/you-too/model.js';
import {createYouTooHandler} from '../api/you-too.js';
const secret='a'.repeat(64);
async function request(body,options={}){
 let status,output,forwarded;
 const handler=createYouTooHandler({env:{SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-only'},fetchImpl:async(url,init)=>{forwarded=JSON.parse(init.body);return {ok:true,json:async()=>({counts:{own:1}})};},...options});
 const res={setHeader(){},set statusCode(v){status=v;},end(v){output=JSON.parse(v);}};
 await handler({method:'POST',headers:{'content-type':'application/json',host:'localhost'},body},res);
 return {status,output,forwarded};
}
test('validates product and followup branch',()=>{
 assert.equal(validAnswer('romand-tint','own','unopened'),true);
 assert.equal(validAnswer('romand-tint','never','unopened'),false);
 assert.equal(validAnswer('bogus','own',null),false);
 assert.equal(validAnswer('romand-tint','toString',null),false);
});
test('shared text contains only opted-in detail',()=>{
 assert.doesNotMatch(shareText(products[0],{choice:'own',detail:null}),/안 뜯/);
 assert.match(shareText(products[0],{choice:'own',detail:'unopened'}),/안 뜯/);
 assert.equal(comparison('own','own'),'둘 다 갖고 있네!');
});
test('capability is hashed before database call',async()=>{
 const r=await request({action:'vote',secret,product:'romand-tint',choice:'own'});
 assert.equal(r.status,200);assert.match(r.forwarded.p_owner,/^[a-f0-9]{64}$/);assert.notEqual(r.forwarded.p_owner,secret);
});
test('invalid answers and missing secrets never call database',async()=>{
 assert.equal((await request({action:'vote',secret,product:'romand-tint',choice:'never',detail:'unopened'})).status,400);
 assert.equal((await request({action:'read',product:'romand-tint'})).status,400);
});
test('configuration failures never masquerade as saved votes',async()=>{
 assert.equal((await request({action:'vote',secret,product:'romand-tint',choice:'own'},{env:{}})).status,503);
});
