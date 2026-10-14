// Offline planning model only. No network, database, or notification side effects.
import assert from 'node:assert/strict';
const base={dau:1000,watchesPerUser:10,uniqueRatio:0.2,pollsPerDay:4,apiPerUser:5};
function capacity(a){const watches=a.dau*a.watchesPerUser,offers=Math.ceil(watches*a.uniqueRatio),polls=offers*a.pollsPerDay;return {watches,offers,pollsPerDay:polls,pollsPerMonth:polls*30,apiPerDay:a.dau*a.apiPerUser,queueOpsPerDay:polls*3,historyRows90Days:polls*90}}
const c=capacity(base);assert.equal(c.offers,2000);assert.equal(c.pollsPerDay,8000);assert.equal(c.queueOpsPerDay,24000);
// Each offer is scheduled once per collection slot, independent of watcher count.
const watchers=Array.from({length:10000},(_,i)=>({user:Math.floor(i/10),offer:i%2000}));
const jobs=new Set(watchers.map(w=>`${w.offer}:slot-1`));assert.equal(jobs.size,2000);
// Policy example: one event per armed rule version, not one per polling result.
const outbox=new Set();const emit=(watch,version,price,target)=>{if(price<=target)outbox.add(`${watch}:${version}`)};
[15700,14000,14000,13000].forEach(p=>emit('watch-1',1,p,15000));assert.equal(outbox.size,1);
emit('watch-1',2,14000,15000);assert.equal(outbox.size,2);
console.log(JSON.stringify({classification:'offline arithmetic and policy simulation; NOT load/RLS/APNs test',assumptions:base,capacity:c,historyStorage90DaysMB:{low:c.historyRows90Days*200/1e6,high:c.historyRows90Days*600/1e6},checks:{baseline:'PASS',sharedCollection:'PASS',singleEventPerRuleVersion:'PASS',explicitRearm:'PASS'},sensitivity:[0.2,0.5,1].map(uniqueRatio=>({uniqueRatio,...capacity({...base,uniqueRatio})}))},null,2));
