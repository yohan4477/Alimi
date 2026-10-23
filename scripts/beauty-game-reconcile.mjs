// Offline only. Reads private, full-fidelity exports; never contacts either database.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const TABLES = Object.freeze(['beauty_conversions', 'beauty_journeys', 'beauty_shop_clicks',
  'friend_events', 'game_answers', 'game_events', 'game_reflections', 'game_shares',
  'journey_actions', 'mini_entries', 'mini_events', 'mini_invites']);
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const fail = message => { throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const names = value => Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string' && v.length) && new Set(value).size === value.length;
// JSON.parse alone silently rounds large/decimal tokens and discards duplicate keys.
// Accept only exact safe integer tokens; source fractional/large numerics must be strings.
export function parseExportJson(text) {
  let pos = 0;
  const invalid = () => fail('Invalid or ambiguous export JSON');
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[pos] || '\0')) pos++; };
  function string() {
    const start = pos++;
    while (pos < text.length) {
      const char = text[pos++];
      if (char === '\\') { pos++; continue; }
      if (char === '"') { try { return JSON.parse(text.slice(start,pos)); } catch { invalid(); } }
    }
    invalid();
  }
  function value(depth=0) {
    if (depth > 100) fail('Export nesting exceeds safety limit');
    whitespace();
    const char=text[pos];
    if (char === '"') return string();
    if (char === '{') {
      pos++; whitespace(); const result=Object.create(null), keys=new Set();
      if (text[pos] === '}') {pos++; return result;}
      while (pos < text.length) {
        whitespace(); if (text[pos] !== '"') invalid();
        const key=string(); if (keys.has(key)) fail('Duplicate export JSON key'); keys.add(key);
        whitespace(); if(text[pos++] !== ':') invalid(); result[key]=value(depth+1); whitespace();
        if(text[pos] === '}') {pos++; return result;}
        if(text[pos++] !== ',') invalid();
      }
      invalid();
    }
    if (char === '[') {
      pos++; whitespace(); const result=[];
      if(text[pos] === ']') {pos++; return result;}
      while(pos < text.length) {
        result.push(value(depth+1)); whitespace();
        if(text[pos] === ']') {pos++; return result;}
        if(text[pos++] !== ',') invalid();
      }
      invalid();
    }
    for(const [token,decoded] of [['true',true],['false',false],['null',null]]) if(text.startsWith(token,pos)) {pos+=token.length;return decoded;}
    const match=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(pos));
    if(!match) invalid();
    if(match[0] === '-0' || !/^-?(?:0|[1-9]\d*)$/.test(match[0]) || !Number.isSafeInteger(Number(match[0]))) fail('Non-integer or unsafe JSON number; export exact database numerics as strings');
    pos+=match[0].length; return Number(match[0]);
  }
  const result=value(); whitespace(); if(pos !== text.length) invalid(); return result;
}
// Preserve types, strings, nulls, and array order. Never normalize timestamps or parse JSON cells.
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value,-0)) fail('Unsafe numeric value; export it losslessly as a string');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  fail('Unsupported export value');
}

export function manifest(bundle) {
  if (!object(bundle) || bundle.format !== 'beauty-game-export-v1') fail('Expected beauty-game-export-v1');
  if (bundle.project_id !== 'appgprj_6ada0c5b0b908191a4774749406c858c' || bundle.binding_name !== 'DB') fail('Wrong source project or binding');
  const snapshot = bundle.snapshot;
  if (!object(snapshot) || snapshot.consistent !== true || typeof snapshot.id !== 'string' || !snapshot.id || !Number.isFinite(Date.parse(snapshot.captured_at)) || !/^[a-f0-9]{64}$/.test(snapshot.schema_sha256 || '')) fail('A consistent snapshot and verified source schema hash are required');
  if (!Array.isArray(bundle.tables) || bundle.tables.length !== TABLES.length || new Set(bundle.tables.map(t => t.name)).size !== TABLES.length || bundle.tables.some(t => !TABLES.includes(t.name))) fail('Exactly the 12 verified source tables are required, including empty tables');
  const tables = [...bundle.tables].sort((a,b) => a.name.localeCompare(b.name)).map(table => {
    const {name, columns, primary_key: pk, rows, row_count: count, completeness} = table;
    if (!names(columns) || !names(pk) || pk.some(k => !columns.includes(k))) fail(`${name}: verified columns and primary key required`);
    if (!object(completeness) || completeness.complete !== true || completeness.truncated !== false || completeness.omitted_rows !== 0 || completeness.omitted_columns !== 0 || completeness.truncated_values !== 0 || completeness.has_more !== false) fail(`${name}: incomplete or truncated export`);
    if (!Array.isArray(rows) || !Number.isSafeInteger(count) || count < 0 || count !== rows.length) fail(`${name}: row count mismatch`);
    const keys = new Set();
    const records = rows.map(row => {
      if (!object(row) || canonical(Object.keys(row).sort()) !== canonical([...columns].sort())) fail(`${name}: row columns mismatch`);
      if (pk.some(k => row[k] === null || row[k] === undefined)) fail(`${name}: null primary key`);
      const key = canonical(pk.map(k => row[k]));
      if (keys.has(key)) fail(`${name}: duplicate primary key`);
      keys.add(key);
      return {key, value: canonical(row)};
    }).sort((a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    return {name, columns: [...columns].sort(), primary_key: [...pk], row_count: count,
      sha256: digest(canonical(records.map(r => r.value)))};
  });
  // Deliberately omit rows, device IDs, raw answers, share tokens and individual row hashes.
  return {format: 'beauty-game-manifest-v1', project_id: bundle.project_id, binding_name: bundle.binding_name,
    snapshot: {id: snapshot.id, captured_at: snapshot.captured_at, schema_sha256: snapshot.schema_sha256}, total_rows: tables.reduce((sum,t) => sum + t.row_count, 0), tables,
    sha256: digest(canonical(tables))};
}

export function reconcile(source, target) {
  const left = manifest(source), right = manifest(target);
  if (left.snapshot.id !== right.snapshot.id || left.snapshot.schema_sha256 !== right.snapshot.schema_sha256) fail('Compare the same source snapshot and source-column projection');
  const differences = left.tables.flatMap((table,i) => canonical(table) === canonical(right.tables[i]) ? [] : [{table: table.name, source_rows: table.row_count, target_rows: right.tables[i].row_count, source_sha256: table.sha256, target_sha256: right.tables[i].sha256}]);
  return {equal: differences.length === 0, total_rows: left.total_rows, source_sha256: left.sha256, target_sha256: right.sha256, differences};
}

async function main(args) {
  const [mode, sourcePath, targetPath] = args;
  if (!['manifest','compare'].includes(mode) || !sourcePath || (mode === 'compare' && !targetPath)) fail('Usage: node scripts/beauty-game-reconcile.mjs manifest PRIVATE_EXPORT [PRIVATE_MANIFEST] | compare PRIVATE_SOURCE PRIVATE_TARGET');
  const source = parseExportJson(await readFile(sourcePath, 'utf8'));
  const result = mode === 'manifest' ? manifest(source) : reconcile(source, parseExportJson(await readFile(targetPath, 'utf8')));
  const output = JSON.stringify(result, null, 2) + '\n';
  if (mode === 'manifest' && targetPath) await writeFile(targetPath, output, {mode: 0o600, flag: 'wx'});
  else process.stdout.write(output);
  if (mode === 'compare' && !result.equal) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => {
  // Validation errors identify tables only, never dump raw input data.
  console.error(error instanceof SyntaxError ? 'Invalid export JSON' : error.message);
  process.exitCode = 1;
});
