import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const chat=readFileSync(new URL('../dist/chat.js', import.meta.url),'utf8');

test('beauty draft publication maintains a durable same-tab pending guard',()=>{
  assert.match(chat,/seoulbeauty-post-pending:/);
  assert.match(chat,/getItem\(pendingKey\)/);
  assert.match(chat,/setItem\(pendingKey, 'pending'\)/);
  assert.match(chat,/if \(pendingKey && !knownRejection\)/);
  assert.match(chat,/clearHandoff\(handoffStorage\(\),d\.beautyHandoffId\)/);
});

test('uncertain beauty post outcomes never trigger automatic second createPost call',()=>{
  const start=chat.indexOf('async function submitPost()');
  const end=chat.indexOf('// Live chat inside a topic.',start);
  const submit=chat.slice(start,end);
  assert.equal((submit.match(/await createPost\(/g)||[]).length,1);
  assert.match(submit,/if \(handoffStore\?\.getItem\(pendingKey\)\)/);
  assert.match(submit,/toast\(locale\(\)\.startsWith\('ko'\)/);
});
