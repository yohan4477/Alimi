import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const chat=readFileSync(new URL('../dist/chat.js',import.meta.url),'utf8');
test('handoff writes use a persistent tab-local pending marker before dispatch',()=>{
 const start=chat.indexOf('async function submitPost()');
 const end=chat.indexOf('// Live chat inside a topic.',start);
 assert.ok(start>=0&&end>start);
 const submit=chat.slice(start,end);
 assert.match(submit,/seoulbeauty-post-pending:/);
 assert.ok(submit.indexOf("setItem(pendingKey,'pending')")<submit.indexOf('await createPost('));
 assert.match(submit,/if\(pendingStore\?\.getItem\(pendingKey\)\)/);
 assert.equal((submit.match(/await createPost\(/g)||[]).length,1);
 assert.ok(submit.indexOf('removeItem(pendingKey)')>submit.indexOf('await createPost('));
 assert.match(submit,/if\(pendingKey\)toast/);
});
