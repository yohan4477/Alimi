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
