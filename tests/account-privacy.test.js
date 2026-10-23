import test from 'node:test';
import assert from 'node:assert/strict';
import {accountPreferencesExport} from '../dist/account-privacy.js';
const auth={user:{id:'a',email:'a@example.test',app_metadata:{provider:'google'}},session:{access_token:'secret-token'}};
const values={'seoulbeauty-data-owner':'a','alimi-live-v1':'{"favorites":["test"]}','alimi-chat-secret':'secret-identity','alimi-auth-session-v1':'secret-session','seoulbeauty-account-cache:b':'other-person'};
const storage={getItem:key=>values[key]??null};
test('export contains only current-owner local preferences, never auth/chat secrets or account caches',()=>{
 const exported=accountPreferencesExport(auth,storage,{now:()=>new Date('2026-10-23T00:00:00Z')});
 assert.deepEqual(exported.preferences,{'alimi-live-v1':{favorites:['test']}});
 assert.equal(exported.scope,'locally_saved_account_preferences');assert.equal(exported.account.id,'a');
 assert.doesNotMatch(JSON.stringify(exported),/secret-token|secret-identity|secret-session|other-person/);
});
test('export rejects preferences from a previous account or guest before reading them',()=>{
 for(const owner of ['b','guest',null])assert.throws(()=>accountPreferencesExport(auth,{getItem:key=>{assert.equal(key,'seoulbeauty-data-owner');return owner}}),/account_preferences_not_ready/);
});
test('export rejects a changed account after session refresh and requires a verified session',()=>{
 assert.throws(()=>accountPreferencesExport(auth,storage,{expectedOwner:'b'}),/account_preferences_not_ready/);
 assert.throws(()=>accountPreferencesExport({...auth,session:null},storage),/account_preferences_not_ready/);
 assert.throws(()=>accountPreferencesExport({...auth,user:null},storage),/account_preferences_not_ready/);
});
