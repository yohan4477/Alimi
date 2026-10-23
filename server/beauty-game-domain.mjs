/** New backend contract derived from the checked-in frontend, not a recovered upstream implementation. */
import { readFileSync } from 'node:fs';
import { SCENARIO_TAXONOMY_VERSION, scenarioFor, scenarioMembers } from '../web/beauty-play/scenario-taxonomy.js';
const json = name => JSON.parse(readFileSync(new URL(`../web/beauty-play/${name}.json`, import.meta.url), 'utf8'));
const scenarios = json('scenarios');
const adviceData = json('advice-data');
const products = [...json('product-data').products.map(p => ({...p, category:'lip', optionKind:p.id === '14621' ? 'scent' : 'shade', rankStatus:'verified'})), ...json('scenario-products')];
// Only the fields not overridden by scenarios.json are mirrored from game.ts.
const portraits = {
  mona:['모나리자','#e8e8ce','좋아. 오늘은 미소 말고 립으로 기억되겠어.'],
  pearl:['진주 소녀','#dce7ef'], venus:['비너스','#f2dece'], madame:['마담 X','#e6ddd5'],
  camille:['양산을 쓴 여인','#dfe9d9'], ophelia:['오필리아','#e6e2d6'],
};
const characters = Object.entries(portraits).map(([id,[name,bg,quote]]) => ({id,name,bg,...scenarios[id],quote:quote || '네가 골라준 아이템, 오늘 파우치에 넣었어.'}));
const legacyReasons = ['지금 상황에 맞아서','표현이 마음에 들어서','보송하게 표현하고 싶어서','얇게 덧바르고 싶어서','색이 어울려서','촉촉함이 중요해서','오래 유지될 것 같아서','직접 써봐서','그냥 끌려서'];
const allReasons = new Set([...legacyReasons,...Object.values(scenarios).flatMap(s => s.reasonOptions)]);
export const experiences = ['지금 쓰고 있어','예전에 써봤어','써본 적 없어'];
export const eventNames = ['pilot_view','pilot_complete','pilot_feedback_more','pilot_feedback_once','pilot_feedback_confusing','advice_select','landing_view','character_view','game_start','step_view','product_select','brand_select','shade_select','back','skip','answer_saved','result_view','experience_saved','share_click','share_link_created','invite_open','comparison_view','next_game','product_open','reflection_start','reflection_saved','community_open','card_download'];
const steps = ['0','1','2','3','4','5','pilot','selection','context','gallery','products','product','option','reason','shades','answer','result','reflection','advice'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(field) { throw Object.assign(new Error(`Invalid ${field}`), {status:400}); }
function one(value, values, field) { if (!values.includes(value)) invalid(field); return value; }
function uuid(value, field) { if (typeof value !== 'string' || !uuidPattern.test(value)) invalid(field); return value.toLowerCase(); }
function bool(value, field) { if (value === undefined || value === false || value === 0 || value === '0') return false; if (value === true || value === 1 || value === '1') return true; invalid(field); }
function text(value, max, field, optional=false) { if (optional && value === undefined) return ''; if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) invalid(field); return value.trim(); }
function allow(input, fields) { for (const key of Object.keys(input)) if (!fields.includes(key)) invalid('field'); }
function list(value, choices, field) { if (!Array.isArray(value) || value.length > choices.length || value.some(v => !choices.includes(v))) invalid(field); return [...new Set(value)]; }
function characterId(id) { return one(id, characters.map(c => c.id), 'character'); }
function eligibleFor(character) {
  if (character.category === 'mixed') return products.filter(p => ['64960','69092','67330','39547','43287'].includes(p.id));
  if (character.category === 'lip') return products.filter(p => ['64960','66606','106475','100982','109909'].includes(p.id));
  return products.filter(p => p.category === character.category);
}
export function shareSnapshot(id) {
  characterId(id);
  const character = characters.find(c => c.id === id), advice = adviceData[id] || [];
  const ids = new Set([...eligibleFor(character).map(p => p.id), ...advice.flatMap(a => a.productIds)]);
  return structuredClone({character,products:products.filter(p => ids.has(p.id)),advice});
}
/** context.snapshot is trusted server data from an authenticated invitation lookup, NEVER a body field. */
export function validateCommand(route, input, context = {}) {
  route = route.replace(/^\/api\//, '').replace(/^\//, '');
  if (input instanceof URLSearchParams) {
    const entries = [...input.entries()];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) invalid('query');
    input = Object.fromEntries(entries);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype,null].includes(Object.getPrototypeOf(input))) invalid('body');
  let size; try { size = Buffer.byteLength(JSON.stringify(input)); } catch { invalid('body'); }
  if (size > 16384) invalid('body size');
  if (route === 'link-account') { allow(input,['consent']); if (input.consent !== true) invalid('consent'); return {consent:true}; }
  if (route === 'invite') { allow(input,['id','play','reveal']); return {id:uuid(input.id,'id'),play:uuid(input.play,'play'),reveal:bool(input.reveal,'reveal')}; }
  if (route === 'stats') {
    allow(input,['character','scope','test']); const character = characterId(input.character), scope = one(input.scope ?? 'character',['character','group'],'scope');
    return {character,scope,characters:scope === 'group' ? scenarioMembers(scenarioFor(character).groupId) : [character],test:bool(input.test,'test')};
  }
  if (route === 'reflection') {
    allow(input,['character','play','test','mode','text','criteria','language']);
    const body = text(input.text,500,'text'); if (!body) invalid('text');
    const criteria = list(input.criteria,['사용감','보습감','지속력','사용 편의'],'criteria'); if (!criteria.length) invalid('criteria');
    return {character:characterId(input.character),play:uuid(input.play,'play'),test:bool(input.test,'test'),mode:one(input.mode,['used','looking'],'mode'),body,criteria,language:one(input.language,['ko','en'],'language')};
  }
  if (route !== 'record') invalid('route');
  const kind = one(input.kind,['event','answer','experience','share'],'kind');
  const extra = {event:['id','name','step','source'],answer:['product','reasons','shade','advice','note'],experience:['experience'],share:['channel']}[kind];
  allow(input,['kind','play','character','test','invite',...extra]);
  const result = {kind,play:uuid(input.play,'play'),character:characterId(input.character),test:bool(input.test,'test'),invite:input.invite == null ? null : uuid(input.invite,'invite')};
  const snapshot = context.snapshot || shareSnapshot(result.character);
  if (snapshot.character?.id !== result.character || !Array.isArray(snapshot.products) || !Array.isArray(snapshot.advice || [])) invalid('snapshot');
  const adviceOptions = snapshot.advice || [];
  if (kind === 'event') {
    const name = one(input.name,eventNames,'name');
    const allowedSteps = name === 'advice_select' ? adviceOptions.map(a => a.id) : name === 'brand_select' ? ['all',...snapshot.products.map(p => p.brand)] : steps;
    return {...result,id:uuid(input.id,'id'),name,step:one(input.step,allowedSteps,'step'),source:one(input.source,['direct','friend','preview'],'source')};
  }
  if (kind === 'experience') return {...result,experience:one(input.experience,experiences,'experience')};
  if (kind === 'share') return {...result,channel:one(input.channel,['native','copy','kakao'],'channel')};
  const advice = input.advice == null ? null : one(input.advice,adviceOptions.map(a => a.id),'advice');
  const selectedAdvice = adviceOptions.find(a => a.id === advice);
  const pool = selectedAdvice ? snapshot.products.filter(p => selectedAdvice.productIds.includes(p.id)) : context.snapshot ? snapshot.products : eligibleFor(snapshot.character);
  const product = one(input.product,[...pool.map(p => p.id),'unsure'],'product');
  const selectedProduct = pool.find(p => p.id === product);
  const shade = input.shade == null ? null : one(input.shade,(selectedProduct?.options || []).map(o => o.id),'shade');
  const reasons = list(input.reasons ?? [],selectedAdvice?.reasonOptions || snapshot.character.reasonOptions || [],'reasons');
  const note = text(input.note,160,'note',true);
  return {...result,product,reason:JSON.stringify({reasons,shade,advice,note})};
}
/** Same legacy single-reason/JSON interpretation as game.ts. Do not expose note in public responses. */
export function readSelection(raw) {
  try { const value = JSON.parse(raw); if (value && Array.isArray(value.reasons)) return {reasons:value.reasons.filter(r => typeof r === 'string' && allReasons.has(r)),shade:typeof value.shade === 'string' ? value.shade : null,advice:typeof value.advice === 'string' ? value.advice : null,note:typeof value.note === 'string' ? value.note : ''}; } catch {}
  return {reasons:allReasons.has(raw) ? [raw] : [],shade:null,advice:null,note:''};
}
/** Rows must be answer rows (joined to their experience), not event records. */
export function aggregateAnswers(rows, options) {
  const {scope,characters:members,test} = validateCommand('stats',{character:options.character,scope:options.scope,test:options.test});
  const votes=new Map(), experienced=new Map(), reasons=new Map(), shades=new Map(), choices=new Map(), categories=new Map();
  function bump(map,key,base) { if (!map.has(key)) map.set(key,{...base,n:0}); const value=map.get(key); value.n++; return value; }
  for (const row of rows) {
    if (!members.includes(row.character) || ![test,Number(test),String(Number(test))].includes(row.test ?? false) || typeof row.product !== 'string') continue;
    const selection=readSelection(row.reason), used=experiences.slice(0,2).includes(row.experience);
    bump(votes,row.product,{product:row.product});
    if (used) bump(experienced,row.product,{product:row.product});
    const key=JSON.stringify([row.character,selection.advice,row.product,selection.shade]);
    const choice=bump(choices,key,{character:row.character,scenarioId:scenarioFor(row.character)?.scenarioId,advice:selection.advice,product:row.product,shade:selection.shade,usedN:0,reasons:new Map()});
    if (used) choice.usedN++;
    for (const reason of new Set(selection.reasons)) { bump(reasons,JSON.stringify([row.product,reason]),{product:row.product,reason}); bump(choice.reasons,reason,{reason}); }
    if (selection.shade !== null) bump(shades,JSON.stringify([row.product,selection.shade]),{product:row.product,shade:selection.shade});
    const category=products.find(p => p.id === row.product)?.category || 'unselected';
    const count=bump(categories,category,{category,usedN:0}); if (used) count.usedN++;
  }
  const values=map => [...map.values()].sort((a,b) => b.n-a.n || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {scope,taxonomyVersion:SCENARIO_TAXONOMY_VERSION,votes:values(votes),experienced:values(experienced),reasons:values(reasons),shades:values(shades),choices:values(choices).map(c => ({...c,reasons:values(c.reasons)})),categoryChoices:values(categories)};
}
