// Local-only suggestions: never transmit a private draft to a recommendation service.
// Match title/intro/category tokens conservatively; ties retain server order.
const stop=new Set(['i','a','the','and','for','with','that','this','what','when','use','you','are','have','product','제품','사용','추천','고민','어떤','저는','있어요','해요','할까','진짜','사람','분들','같은']);
export function draftTokens(body){
  if(typeof body!=='string')return [];
  return [...new Set((body.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[]).filter(w=>w.length<=35&&!stop.has(w)))].slice(0,32);
}
export function suggestDraftRooms(body,rooms,{limit=5}={}){
  const terms=draftTokens(body);
  if(!Array.isArray(rooms)||!terms.length)return [];
  return rooms.map((room,index)=>{
    const title=String(room.title_ko||'')+' '+String(room.title_en||'')+' '+String(room.title||'');
    const intro=String(room.intro_ko||'')+' '+String(room.intro_en||'')+' '+String(room.intro||'');
    const score=terms.reduce((n,w)=>n+(title.toLocaleLowerCase().includes(w)?3:0)+(intro.toLocaleLowerCase().includes(w)?1:0),0);
    return {room,score,index};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,Math.max(0,Math.min(limit,10)));
}
