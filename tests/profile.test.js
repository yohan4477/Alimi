import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profilePayload, canShareB2B, gpcOn, saveProfile} from '../dist/profile-api.js';

test('profile payload keeps known values and drops unknown ones', () => {
  const p = profilePayload({age_band: '25-34', skin_type: 'oily', skin_tone: 'deep', interests: ['makeup', 'zodiac'], consent_analytics: true}, {});
  assert.equal(p.age_band, '25-34');
  assert.equal(p.skin_type, 'oily');
  assert.deepEqual(p.interests, ['makeup']);
  assert.equal(p.consent_analytics, true);
  assert.equal(profilePayload({age_band: 'under13'}, {}).age_band, undefined);
});

test('skin concerns are kept only with the separate health consent', () => {
  assert.deepEqual(profilePayload({concerns: ['acne']}, {}).concerns, []);
  assert.deepEqual(profilePayload({concerns: ['acne', 'cancer'], consent_health: true}, {}).concerns, ['acne']);
});

test('B2B sharing needs 16+, no opt-out and no Global Privacy Control', () => {
  assert.equal(profilePayload({age_band: '18-24', consent_b2b: true}, {}).consent_b2b, true);
  assert.equal(profilePayload({age_band: '13-15', consent_b2b: true}, {}).consent_b2b, false);
  assert.equal(profilePayload({consent_b2b: true}, {}).consent_b2b, false);
  assert.equal(profilePayload({age_band: '18-24', consent_b2b: true, opt_out_sale: true}, {}).consent_b2b, false);
  const gpc = profilePayload({age_band: '18-24', consent_b2b: true}, {globalPrivacyControl: true});
  assert.equal(gpc.consent_b2b, false);
  assert.equal(gpc.opt_out_sale, true);
  assert.equal(gpcOn({globalPrivacyControl: true}), true);
  assert.equal(canShareB2B({age_band: '16-17'}), true);
});

test('saveProfile posts only the normalised payload to set_profile', async () => {
  let call;
  const fetchImpl = async (url, init) => { call = {url, body: JSON.parse(init.body)}; return new Response('{}', {status: 200}); };
  await saveProfile('s', {skin_type: 'dry', consent_b2b: true}, fetchImpl, {});
  assert.match(call.url, /\/rest\/v1\/rpc\/set_profile$/);
  assert.equal(call.body.p_secret, 's');
  assert.equal(call.body.p_profile.consent_b2b, false);
  assert.equal(call.body.p_profile.skin_type, 'dry');
});
