import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {GAME_ENTRANCE_SLIDES,GAME_ENTRANCE_INTERVAL,gameEntranceMarkup,gameEntranceHref,mountGameEntranceCarousel} from '../dist/game-entrance-carousel.js';
function target(initial={}) {
  const listeners = new Map();
  return Object.assign({addEventListener:(e,f)=>{if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(f);},removeEventListener:(e,f)=>listeners.get(e)?.delete(f),emit(e,detail={}){for(const f of [...listeners.get(e)||[]])f(detail);},listenerCount:()=>[...listeners.values()].reduce((n,v)=>n+v.size,0)},initial);
}
function fixture() {
  const image={}, label={},media=target({matches:false}),doc=target({hidden:false,activeElement:null});
  const anchor=target({dataset:{},isConnected:true,hiddenAncestor:false,matches:()=>false,contains:value=>value===anchor,querySelector:s=>s==='img'?image:label,getClientRects:()=>[{}],closest:()=>anchor.hiddenAncestor?{}:null});
  const timers=new Map();let id=0;
  const options={document:doc,window:{matchMedia:()=>media},setInterval:(fn,ms)=>{assert.equal(ms,5000);timers.set(++id,fn);return id;},clearInterval:id=>timers.delete(id)};
  return {anchor,doc,media,image,label,timers,options,tick:()=>{for(const fn of [...timers.values()])fn();}};
}
test('six existing portraits and exact current bilingual scenario text only',()=>{
 const scenarios=JSON.parse(readFileSync(new URL('../web/beauty-play/scenarios.json',import.meta.url)));
 const translations=JSON.parse(readFileSync(new URL('../web/beauty-play/translations.json',import.meta.url)));
 assert.deepEqual(GAME_ENTRANCE_SLIDES.map(s=>s.id),['mona','pearl','venus','madame','camille','ophelia']);
 for(const slide of GAME_ENTRANCE_SLIDES){
  assert.equal(slide.ko,scenarios[slide.id].short);assert.equal(slide.en,translations.en[slide.ko]);
  assert.ok(existsSync(new URL('../dist/beauty-play/assets/art-'+slide.id+'.webp',import.meta.url)));
 }
 assert.equal(GAME_ENTRANCE_INTERVAL,5000);
});
test('markup preserves entrance class, supported route, locale and resume disclosure',()=>{
 assert.match(gameEntranceMarkup('ko'),/class="home-game-entry"/);
 assert.match(gameEntranceMarkup('en'),/An existing game resumes where you left off/);
 assert.match(gameEntranceMarkup('ko'),/언니가 골라줘/);
 assert.equal(gameEntranceHref('pearl','en'),'/beauty-play/?pilot=1&character=pearl&lang=en');
 assert.equal(gameEntranceHref('not-real','other'),'/beauty-play/?pilot=1&character=mona&lang=ko');
 const page=readFileSync(new URL('../web/beauty-play/page.tsx',import.meta.url),'utf8');
 assert.match(page,/activeRun\(ids,u.searchParams.get\('character'\),runScope.current\)/);
});
test('five-second advancement synchronizes image, scenario and href and wraps',()=>{
 const f=fixture(),cleanup=mountGameEntranceCarousel(f.anchor,{...f.options,lang:'en'});
 assert.equal(f.timers.size,1);
 for(let n=1;n<=6;n++){f.tick();const slide=GAME_ENTRANCE_SLIDES[n%6];assert.equal(f.anchor.dataset.character,slide.id);assert.equal(f.label.textContent,slide.en);assert.equal(f.image.src,'/beauty-play/assets/art-'+slide.id+'.webp');assert.equal(f.anchor.href,gameEntranceHref(slide.id,'en'));}
 cleanup();assert.equal(f.timers.size,0);
});
test('hover, focus, document visibility and reduced motion pause and safely resume',()=>{
 const f=fixture(),cleanup=mountGameEntranceCarousel(f.anchor,f.options);
 for(const [pause,resume] of [
  [()=>f.anchor.emit('mouseenter'),()=>f.anchor.emit('mouseleave')],
  [()=>f.anchor.emit('focusin'),()=>f.anchor.emit('focusout',{relatedTarget:null})],
  [()=>{f.doc.hidden=true;f.doc.emit('visibilitychange');},()=>{f.doc.hidden=false;f.doc.emit('visibilitychange');}],
  [()=>{f.media.matches=true;f.media.emit('change');},()=>{f.media.matches=false;f.media.emit('change');}]
 ]){const before=f.anchor.dataset.character;pause();assert.equal(f.timers.size,0);f.tick();assert.equal(f.anchor.dataset.character,before);resume();assert.equal(f.timers.size,1);f.tick();assert.notEqual(f.anchor.dataset.character,before);}
 cleanup();assert.equal(f.anchor.listenerCount(),0);assert.equal(f.doc.listenerCount(),0);assert.equal(f.media.listenerCount(),0);
});
test('hidden view does not advance; removed nodes clean up; remount never duplicates timers',()=>{
 const f=fixture(),old=mountGameEntranceCarousel(f.anchor,f.options);
 const latest=mountGameEntranceCarousel(f.anchor,f.options);assert.equal(f.timers.size,1);old();assert.equal(f.timers.size,1);
 f.anchor.hiddenAncestor=true;f.tick();assert.equal(f.anchor.dataset.character,'mona');
 f.anchor.hiddenAncestor=false;f.tick();assert.equal(f.anchor.dataset.character,'pearl');
 f.anchor.isConnected=false;f.tick();assert.equal(f.timers.size,0);assert.equal(f.anchor.listenerCount(),0);latest();
});
test('initial reduced motion never starts autoplay',()=>{
 const f=fixture();f.media.matches=true;const cleanup=mountGameEntranceCarousel(f.anchor,f.options);assert.equal(f.timers.size,0);assert.equal(f.anchor.dataset.character,'mona');cleanup();
});
test('community redraw and tab leave dispose the previous carousel mount',()=>{
 const source=readFileSync(new URL('../dist/chat.js',import.meta.url),'utf8');
 assert.match(source,/const shell = inner => \{ stopGameEntrance\(\);/);
 assert.match(source,/export function leaveChat\(\) \{ stopGameEntrance\(\);/);
 assert.match(source,/mountGameEntranceCarousel\(entrance, \{lang:/);
});
