import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {englishGameHtml,localizedGameMetadata} from '../web/beauty-play/html-metadata.mjs';
const source = await readFile(new URL('../web/beauty-play/index.html',import.meta.url),'utf8');
const config = JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const references = html => [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(x=>x[1]);
test('English crawler HTML localizes metadata without changing assets or adding collapsed share URLs',()=>{
  const built=source.replace('/main.tsx','/beauty-play/bundle/fixture.js').replace('</head>','<link rel="stylesheet" href="/beauty-play/bundle/fixture.css"></head>');
  const english=englishGameHtml(built);
  assert.match(english,/<html lang="en">/);assert.match(english,/<title>Let Me Pick · Seoul Beauty<\/title>/);
  for(const match of english.matchAll(/<(?:title|meta)\b[^>]*(?:>[^<]*<\/title>)?/g))assert.doesNotMatch(match[0],/[가-힣]/);
  assert.deepEqual(references(english),references(built));
  assert.match(english,/og:image" content="https:\/\/seoulbeauty.me\/beauty-play\/assets\/art-mona.webp/);
  assert.doesNotMatch(english,/rel="canonical"|property="og:url"|invite=/);
  assert.match(source,/<html lang="ko">/);assert.match(source,/언니가 골라줄게/);
  assert.throws(()=>englishGameHtml('<html></html>'),/metadata is missing/);
});
test('build plugin emits English shell and leaves Korean built output byte-for-byte intact',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'beauty-metadata-'));
  const built=source.replace('/main.tsx','/beauty-play/bundle/fixture.js');
  await writeFile(join(directory,'index.html'),built);
  const plugin=localizedGameMetadata();plugin.configResolved({build:{outDir:directory}});await plugin.closeBundle();
  assert.equal(await readFile(join(directory,'index.html'),'utf8'),built);
  assert.equal(await readFile(join(directory,'index.en.html'),'utf8'),englishGameHtml(built));
});
test('only explicit English game requests use English metadata; API and other routes stay unchanged',()=>{
  const rewrites=config.rewrites;
  assert.deepEqual(rewrites[0],{source:'/beauty-play/api/:route',destination:'/api/beauty-play?route=:route'});
  for(const path of ['/beauty-play','/beauty-play/']){
    const matches=rewrites.filter(row=>row.source===path);
    assert.deepEqual(matches,[{source:path,has:[{type:'query',key:'lang',value:'en'}],destination:'/beauty-play/index.en.html'},{source:path,destination:'/beauty-play/index.html'}]);
    for(const [query,expected] of [['lang=en&invite=synthetic','/beauty-play/index.en.html'],['lang=ko&invite=synthetic','/beauty-play/index.html'],['invite=synthetic','/beauty-play/index.html'],['lang=fr','/beauty-play/index.html']]){
      const params=new URLSearchParams(query);
      const found=matches.find(row=>!row.has||row.has.every(condition=>params.get(condition.key)===condition.value));
      assert.equal(found.destination,expected);assert.equal(params.get('invite'),query.includes('invite=')?'synthetic':null);
    }
  }
  assert.equal(rewrites.filter(row=>row.has).length,2);
  assert.equal(config.buildCommand,'npm run build:beauty-play');
});
