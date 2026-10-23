import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sampleRooms,sampleMessages} from '../dist/sample-data.js';
import {copy,disclosureMarkup,roomMarkup,messageMarkup} from '../dist/sample-view.js';
const root=path.resolve('dist');
function imports(file,seen=new Set()){
 if(seen.has(file))return seen;seen.add(file);
 if(!file.endsWith('.js'))return seen;
 const source=fs.readFileSync(file,'utf8');
 for(const match of source.matchAll(/(?:from\s*|import\s*\(|import\s*)['"](\.\/[^'"]+)['"]/g))imports(path.resolve(path.dirname(file),match[1]),seen);
 return seen;
}
test('sample entry imports only isolated fixture/presentational/preference modules',()=>{
 const files=[...imports(path.join(root,'public-entry.js'))];
 for(const file of files){assert.doesNotMatch(path.basename(file),/^(app|chat|auth|account-sync|profile|events|chat-api|community-api|store|saved-messages|demo-fixtures)\.js$/);}
 for(const file of files.filter(f=>f.endsWith('.js')&&!f.endsWith('language-preference.js'))){
  const source=fs.readFileSync(file,'utf8');assert.doesNotMatch(source,/\bfetch\s*\(|sendBeacon|supabase\.co|\/rest\/v1|\/auth\/v1|localStorage\.(?:setItem|getItem)|sessionStorage/);
 }
});
test('same cleaned 13 rooms and 80 messages, with prominent fictional disclosures in both languages',()=>{
 const ko=sampleRooms('ko'),en=sampleRooms('en');assert.equal(ko.length,13);assert.deepEqual(en.map(x=>x.id),ko.map(x=>x.id));
 for(const lang of ['ko','en']){
  const rooms=sampleRooms(lang),messages=rooms.flatMap(r=>sampleMessages(r.id,lang));assert.equal(messages.length,80);
  assert.match(disclosureMarkup(lang),/data-sample-disclosure/);assert.ok(copy(lang).disclosure.includes(lang==='ko'?'실제 이용자':'not actual users'));
  const rendered=rooms.map(r=>roomMarkup(r,lang)).join('')+messages.map(m=>messageMarkup(m,messages,lang)).join('');
  assert.equal((rendered.match(/data-sample-message=/g)||[]).length,80);
  assert.doesNotMatch(rendered,/data-chat-room|data-community-like|data-family|data-chat-like|data-live|<time|messages_24h/);
  if(lang==='en')assert.doesNotMatch(rendered,/[가-힣]/);
  assert.ok(messages.every(m=>m.demo===true&&!('created_at'in m)&&!('likes'in m)&&!('item'in m)));
 }
});
test('presentation escapes message text and preserves only existing quote relationship',()=>{
 const parent={id:1,nickname:'<A>',body:'<script>bad</script>'};const child={id:2,nickname:'B',body:'&hello',reply_to:1};
 const html=messageMarkup(child,[parent,child],'en');assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert.ok(html.includes('data-sample-jump="1"'));assert.doesNotMatch(html,/<script>/);
});
test('sample first paint is withheld until locale resolution and no actual bootstrap is included',()=>{
 const html=fs.readFileSync('dist/index.html','utf8'),source=fs.readFileSync('dist/sample-app.js','utf8');
 assert.match(html,/data-locale-pending/);assert.match(html,/html\[data-locale-pending\] body\{visibility:hidden\}/);
 assert.match(html,/src="public-entry.js"/);assert.doesNotMatch(html,/visitor-entry\.js|src="app\.js"/);
 assert.ok(source.indexOf('await resolveVisitorContext()')<source.indexOf("removeAttribute('data-locale-pending')"));
 assert.match(source,/const liked=new Set\(\),saved=new Set\(\)/);
});
