// Exports the public Supabase price rows as an offline fallback for web and iOS.
// Uses only the publishable (read-only) key.
import {writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, OFFERS_QUERY, toProducts} from '../dist/live.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const res = await fetch(SUPABASE_URL + OFFERS_QUERY, {headers: {apikey: SUPABASE_PUBLISHABLE_KEY}});
if (!res.ok) throw Error('Supabase HTTP ' + res.status);
const rows = await res.json();
if (toProducts(rows).length === 0) throw Error('No products returned; refusing to overwrite snapshot');
const json = JSON.stringify({schemaVersion: 1, exportedAt: new Date().toISOString(), rows}, null, 1) + '\n';
for (const p of ['dist/live-snapshot.json', 'ios/Alimi/live-snapshot.json']) await writeFile(resolve(root, p), json);
console.log(JSON.stringify({products: toProducts(rows).length}));
