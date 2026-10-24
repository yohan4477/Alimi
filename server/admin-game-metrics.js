// Authenticated admin-only aggregates. No raw sessions, voters, notes or answers leave this module.
export async function readGameMetrics({env=process.env,fetchImpl=fetch,test=false,now=new Date()}={}){
 const flags={ownership:env.OWNED_POLL_ENABLED==='true',accountLink:env.BEAUTY_GAME_ACCOUNT_LINK_ENABLED==='true',backend:'supabase'};
 const base={generatedAt:now.toISOString(),days:7,test:!!test,flags,game:null,ownership:null};
 if(!env.SUPABASE_SECRET_KEY)return {...base,state:'unconnected'};
 const headers={apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};if(!headers.apikey.startsWith('sb_secret_'))headers.Authorization='Bearer '+headers.apikey;
 try{const r=await fetchImpl('https://mqsnshnlfwsgabrsmqsz.supabase.co/rest/v1/rpc/beauty_operations_metrics',{method:'POST',headers,body:JSON.stringify({p_test:!!test}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!r.ok)return {...base,state:r.status===404?'migration_required':[401,403].includes(r.status)?'denied':'unavailable'};
 const data=await r.json();for(const [section,keys] of Object.entries({game:['observations','started','completed','shared','inviteOpened','compared'],ownership:['responses','participants','followups','multiProductParticipants','visits','exploredVisits']})){if(keys.some(k=>!Number.isSafeInteger(data[section]?.[k])||data[section][k]<0))throw Error('Invalid aggregate');base[section]=Object.fromEntries(keys.map(k=>[k,data[section][k]]));}
 const o=base.ownership;return {...base,state:base.game.observations||o.responses||o.visits?'received':'no_data',rates:{followup:o.responses?o.followups/o.responses:null,exploration:o.visits?o.exploredVisits/o.visits:null}};
 }catch{return {...base,game:null,ownership:null,state:'unavailable'};}
}
// Funnel, visit sources and choices for the game (supabase/migrations/20261024130000_beauty_game_insights.sql).
// The database returns counts only; this adds display names for characters, answers and products.
export async function readGameInsights({env=process.env,fetchImpl=fetch,test=false,days=7,now=new Date()}={}){
 const base={generatedAt:now.toISOString(),days,test:!!test};
 if(!env.SUPABASE_SECRET_KEY)return {...base,state:'unconnected'};
 const headers={apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};if(!headers.apikey.startsWith('sb_secret_'))headers.Authorization='Bearer '+headers.apikey;
 try{
  const r=await fetchImpl('https://mqsnshnlfwsgabrsmqsz.supabase.co/rest/v1/rpc/beauty_game_insights',{method:'POST',headers,body:JSON.stringify({p_test:!!test,p_days:days}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok)return {...base,state:r.status===404?'migration_required':[401,403].includes(r.status)?'denied':'unavailable'};
  const data=await r.json();
  const count=v=>{if(!Number.isSafeInteger(v)||v<0)throw Error('Invalid aggregate');return v;};
  const {insightLabels}=await import('./beauty-game-domain.mjs');
  const choices=(data.choices||[]).map(c=>({...insightLabels(c),advice:c.advice,product:c.product,character:c.character,n:count(c.n)}));
  const tally=(key)=>{const m=new Map();for(const c of choices){const k=c[key];if(k)m.set(k,(m.get(k)||0)+c.n);}return [...m].map(([label,n])=>({label,n})).sort((a,b)=>b.n-a.n);};
  return {...base,state:count(data.people)?'received':'no_data',people:count(data.people),
   funnel:(data.funnel||[]).map(f=>({step:String(f.step),plays:count(f.plays),people:count(f.people)})),
   segments:(data.segments||[]).map(s=>({dimension:String(s.dimension),value:String(s.value),people:count(s.people),started:count(s.started),completed:count(s.completed),shared:count(s.shared)})),
   situations:choices.reduce((list,c)=>{const key=c.characterName+' · '+c.adviceLabel,row=list.find(x=>x.label===key);row?row.n+=c.n:list.push({label:key,character:c.characterName,advice:c.adviceLabel,n:c.n});return list;},[]).sort((a,b)=>b.n-a.n),
   categories:tally('category'),answerBrands:tally('brand'),
   products:choices.map(c=>({label:(c.brand?c.brand+' · ':'')+c.productName,n:c.n})).reduce((l,c)=>{const r=l.find(x=>x.label===c.label);r?r.n+=c.n:l.push({...c});return l;},[]).sort((a,b)=>b.n-a.n).slice(0,30),
   reasons:(data.reasons||[]).map(r=>({label:String(r.reason),n:count(r.n)})),
   brandTaps:(data.brands||[]).map(b=>({label:String(b.brand),n:count(b.people)}))};
 }catch{return {...base,state:'unavailable'};}
}
