// "Where did you hear about us?" asked once per browser after the first result.
// In-app browsers (Instagram, KakaoTalk, TikTok) often hide the referrer, so the visit source alone misses them.
// Only the chosen slug is sent, as the step of a heard_from event.
import {useState} from 'react';
export const heardOptions=[['instagram','인스타','Instagram'],['tiktok','틱톡','TikTok'],['youtube','유튜브','YouTube'],['reddit','레딧','Reddit'],['friend','친구가 알려줌','A friend'],['other','기타','Other']] as const;
const KEY='sb-heard';
const asked=()=>{try{return !!localStorage.getItem(KEY);}catch{return false;}};
export default function HeardFrom({lang,onPick}:{lang:'ko'|'en';onPick:(value:string)=>void}){
 const [state,setState]=useState<'ask'|'done'|'hidden'>(()=>asked()?'hidden':'ask');
 if(state==='hidden')return null;
 if(state==='done')return <p className="heard-from heard-thanks" role="status">{lang==='ko'?'알려줘서 고마워!':'Thanks for telling us!'}</p>;
 return <section className="heard-from" aria-label={lang==='ko'?'어디서 알게 됐어?':'Where did you hear about us?'}>
  <h2>{lang==='ko'?'여기 어디서 알게 됐어?':'Where did you find us?'}</h2>
  <div className="heard-options">{heardOptions.map(([value,ko,en])=><button key={value} type="button" onClick={()=>{try{localStorage.setItem(KEY,value);}catch{}onPick(value);setState('done');}}>{lang==='ko'?ko:en}</button>)}</div>
 </section>;
}
