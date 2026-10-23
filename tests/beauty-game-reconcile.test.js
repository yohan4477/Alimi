import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {manifest,reconcile,canonical,parseExportJson,TABLES} from '../scripts/beauty-game-reconcile.mjs';
const bundle = () => ({format:'beauty-game-export-v1',project_id:'appgprj_6ada0c5b0b908191a4774749406c858c',binding_name:'DB',snapshot:{consistent:true,id:'fixture-only',captured_at:'2026-10-23T07:00:00Z',schema_sha256:'a'.repeat(64)},tables:TABLES.map(name=>({name,columns:['id','snapshot'],primary_key:['id'],row_count:0,rows:[],completeness:{complete:true,truncated:false,omitted_rows:0,omitted_columns:0,truncated_values:0,has_more:false}}))});
const add = b => { const t=b.tables.find(t=>t.name==='game_shares');t.rows=[{id:'fixture-1',snapshot:'{"text":"가나다","nested":[1,2]}'},{id:'fixture-2',snapshot:null}];t.row_count=2;return b; };
test('empty tables are represented, full values and deterministic order are reconciled',()=>{const a=add(bundle()),b=structuredClone(a);b.tables.reverse();b.tables.find(t=>t.name==='game_shares').rows.reverse();assert.equal(reconcile(a,b).equal,true);assert.equal(manifest(a).total_rows,2);});
test('manifest never contains raw rows, tokens or individual answer content',()=>{const result=JSON.stringify(manifest(add(bundle())));assert(!result.includes('fixture-1'));assert(!result.includes('가나다'));assert(!result.includes('nested'));});
test('a changed same-count share snapshot fails reconciliation',()=>{const a=add(bundle()),b=structuredClone(a);b.tables.find(t=>t.name==='game_shares').rows[0].snapshot+=' ';const r=reconcile(a,b);assert.equal(r.equal,false);assert.equal(r.differences[0].table,'game_shares');});
test('reject every truncation or incomplete pagination signal',()=>{for(const [key,value] of Object.entries({complete:false,truncated:true,omitted_rows:1,omitted_columns:1,truncated_values:1,has_more:true})){const b=bundle();b.tables[0].completeness[key]=value;assert.throws(()=>manifest(b),/incomplete or truncated/);}});
test('missing zero-row table and duplicate table cannot silently pass',()=>{const b=bundle();b.tables.pop();assert.throws(()=>manifest(b),/12 verified/);const c=bundle();c.tables[0]=c.tables[1];assert.throws(()=>manifest(c),/12 verified/);});
test('count, duplicate identity, and columns are checked',()=>{const a=add(bundle());const t=a.tables.find(t=>t.name==='game_shares');t.row_count=3;assert.throws(()=>manifest(a),/row count/);t.row_count=2;t.rows[1].id=t.rows[0].id;assert.throws(()=>manifest(a),/duplicate primary key/);t.rows[1].id='fixture-2';delete t.rows[0].snapshot;assert.throws(()=>manifest(a),/columns mismatch/);});
test('primary keys must be supplied from source DDL, never guessed',()=>{const a=bundle();a.tables[0].primary_key=[];assert.throws(()=>manifest(a),/primary key/);});
test('inconsistent snapshots and different watermarks fail closed',()=>{const a=bundle();a.snapshot.consistent=false;assert.throws(()=>manifest(a),/consistent snapshot/);const b=bundle(),c=bundle();c.snapshot.id='another';assert.throws(()=>reconcile(b,c),/same source snapshot/);});
test('SQL strings, whitespace, null and numeric types are preserved not coerced',()=>{assert.notEqual(canonical('1'),canonical(1));assert.notEqual(canonical(null),canonical('null'));assert.notEqual(canonical('{"a":1}'),canonical('{ "a":1}'));assert.throws(()=>canonical(9007199254740992),/Unsafe/);assert.throws(()=>canonical(Infinity),/Unsafe/);assert.throws(()=>canonical(undefined),/Unsupported/);});
test('unknown provenance cannot be reconciled into the approved destination',()=>{const a=bundle();a.project_id='wrong';assert.throws(()=>manifest(a),/Wrong source/);});
test('raw parser rejects silent decimal rounding, exponent tokens, and duplicate decoded keys',()=>{
  for(const input of ['9007199254740991.1','0.123456789012345678901','1e2','9007199254740992','-0']) assert.throws(()=>parseExportJson(input),/unsafe JSON number/);
  assert.throws(()=>canonical(-0),/Unsafe/);
  for(const input of ['{"id":1,"id":2}','{"id":1,"\\u0069d":2}']) assert.throws(()=>parseExportJson(input),/Duplicate/);
  assert.equal(parseExportJson('"9007199254740991.1"'),'9007199254740991.1');
  assert.equal(manifest(parseExportJson(JSON.stringify(add(bundle())))).total_rows,2);
  for(const input of ['[1,]','{"x":1,}','true junk','{"x":"unterminated}']) assert.throws(()=>parseExportJson(input),/Invalid/);
});
test('CLI writes a private non-overwriting manifest and returns distinct comparison outcomes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'beauty-reconcile-fixture-'));
  try {
    const source=join(dir,'source.json'),target=join(dir,'target.json'),out=join(dir,'manifest.json');
    const a=add(bundle()),b=structuredClone(a);
    await writeFile(source,JSON.stringify(a),{mode:0o600});
    await writeFile(target,JSON.stringify(b),{mode:0o600});
    const cli=(...args)=>spawnSync(process.execPath,['scripts/beauty-game-reconcile.mjs',...args],{encoding:'utf8'});
    assert.equal(cli('manifest',source,out).status,0);
    assert.equal((await stat(out)).mode&0o777,0o600);
    const original=await readFile(out,'utf8');
    assert.equal(cli('manifest',source,out).status,1);
    assert.equal(await readFile(out,'utf8'),original);
    assert.equal(cli('compare',source,target).status,0);
    b.tables.find(t=>t.name==='game_shares').rows[0].snapshot+='changed';
    await writeFile(target,JSON.stringify(b));
    assert.equal(cli('compare',source,target).status,2);
    await writeFile(target,'{raw-private-syntax-error');
    const invalid=cli('compare',source,target);
    assert.equal(invalid.status,1);
    assert(!invalid.stderr.includes('raw-private'));
    for (const raw of ['{"rounded":9007199254740991.1}', '{"id":1,"id":2}']) {
      await writeFile(target,raw);
      assert.equal(cli('manifest',target).status,1);
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
