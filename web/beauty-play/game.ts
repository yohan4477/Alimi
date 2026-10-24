import data from './product-data.json';
import additions from './scenario-products.json';
import scenarios from './scenarios.json';
export const VERSION='muse-v4';
export const products=[...data.products.map(p=>({...p,category:p.category||'lip',optionKind:p.optionKind||(p.id==='14621'?'scent':'shade'),rankStatus:p.rankStatus||'family-only'})),...additions];
const legacyReasons=['지금 상황에 맞아서','표현이 마음에 들어서','보송하게 표현하고 싶어서','얇게 덧바르고 싶어서','색이 어울려서','촉촉함이 중요해서','오래 유지될 것 같아서','직접 써봐서','그냥 끌려서'];
export const experiences=['지금 쓰고 있어','예전에 써봤어','써본 적 없어'];
const originalCharacters=[
{id:'mona',name:'모나리자',tag:'500년 만의 변화',title:'500년째 같은 립.\n이제 네가 바꿔줘.',short:'500년째 같은 립, 바꿔줄래?',context:'오늘은 초상화 대신 소개팅. 진한 색은 부담스럽지만, 평소와는 조금 달라 보이고 싶대.',condition:'입술이 쉽게 건조해져요',want:'자연스러운 색 · 촉촉한 표현',quote:'좋아. 오늘은 미소 말고 립으로 기억되겠어.',bg:'#e8e8ce'},
{id:'pearl',name:'진주 소녀',tag:'귀걸이가 예산 초과',title:'귀걸이에 다 썼어.\n립은 네가 골라줘.',short:'귀걸이는 골랐고. 립은?',context:'수업 끝나고 바로 친구들과 약속. 파우치에 하나만 넣고 가볍게 수정하고 싶대.',condition:'오후면 입술 각질이 보여요',want:'손쉬운 수정 · 데일리 색감',quote:'귀걸이만 예쁜 줄 알았지? 네 픽도 꽤 괜찮네.',bg:'#dce7ef'},
{id:'venus',name:'비너스',tag:'바다에서 바로 약속',title:'바다에서 막 나왔어.\n30분 뒤 약속인데?',short:'바다에서 막 나온 비너스의 파우치',context:'해변 산책 후 저녁 약속이 잡혔어. 입술은 당기는데, 번거로운 메이크업은 피하고 싶대.',condition:'입술이 당기고 건조해요',want:'간편한 케어 · 편안한 표현',quote:'조개껍데기보다 이걸 먼저 챙길걸.',bg:'#f2dece'},
{id:'madame',name:'마담 X',tag:'블랙 드레스의 마지막 한 끗',title:'드레스는 완벽해.\n립은 네가 골라줘.',short:'블랙 드레스엔 어떤 립?',context:'오랜만의 저녁 파티. 검은 드레스에 어울리는 립을 찾고 있어. 입술이 쉽게 건조해져서 편안한 표현도 중요하대.',condition:'입술이 쉽게 건조해져요',want:'드레스와 어울리는 색 · 편안한 표현',quote:'오늘의 마지막 한 끗은 네가 골라줬네.',bg:'#e6ddd5'},
{id:'camille',name:'양산을 쓴 여인',tag:'바람 부는 오후의 피크닉',title:'양산은 챙겼는데.\n파우치가 비었어.',short:'피크닉 갈 때 립 하나만?',context:'바람 부는 날 친구들과 피크닉을 가기로 했어. 입술이 당겨서, 가볍게 덧바를 수 있는 제품 하나를 챙기고 싶대.',condition:'바람을 쐬면 입술이 당겨요',want:'가벼운 사용감 · 손쉬운 덧바름',quote:'양산, 도시락, 그리고 네가 골라준 립.',bg:'#dfe9d9'},
{id:'ophelia',name:'오필리아',tag:'꽃보다 눈에 띄고 싶은 날',title:'꽃은 준비됐어.\n내 립도 골라줄래?',short:'꽃밭에서 찍을 오늘의 사진',context:'꽃밭에서 친구와 사진을 찍기로 했어. 입술 각질은 신경 쓰이고, 꽃과 어울리는 부드러운 색을 고르고 싶대.',condition:'입술 각질이 신경 쓰여요',want:'부드러운 색감 · 촉촉한 표현',quote:'꽃도 예쁘지만, 오늘 네 선택도 마음에 들어.',bg:'#e6e2d6'},
{id:'school_photo_friend',name:'푸른 소년',tag:'네컷사진에 진심인 전학생',title:'',short:'',context:'',condition:'',want:'',quote:'',bg:'#ded8c5'},
{id:'school_last_minute_friend',name:'피리 부는 소년',tag:'지각 직전에도 꾸미는 반장',title:'',short:'',context:'',condition:'',want:'',quote:'',bg:'#e8dfd3'}] as const;
export const characters=originalCharacters.map(c=>({...c,...scenarios[c.id],quote:c.id==='mona'?c.quote:'네가 골라준 아이템, 오늘 파우치에 넣었어.'}));
export const reasons=[...new Set([...legacyReasons,...Object.values(scenarios).flatMap(s=>s.reasonOptions)])];
export function eligibleFor(_character:string){return products;}
export const eventNames=['pilot_view','pilot_complete','pilot_feedback_more','pilot_feedback_once','pilot_feedback_confusing','advice_select','landing_view','character_view','game_start','step_view','product_select','brand_select','shade_select','back','skip','answer_saved','result_view','experience_saved','share_click','share_link_created','invite_open','comparison_view','next_game','product_open','reflection_start','reflection_saved','community_open','card_download','ownership_open'] as const;

// Keep historical single-reason answers and share snapshots readable.
export function readSelection(raw:string):{reasons:string[];shade:string|null;advice:string|null;note:string}{
 try{const value=JSON.parse(raw);if(value&&Array.isArray(value.reasons))return {reasons:value.reasons.filter((r:unknown)=>typeof r==='string'&&reasons.includes(r)),shade:typeof value.shade==='string'?value.shade:null,advice:typeof value.advice==='string'?value.advice:null,note:typeof value.note==='string'?value.note:''};}catch{}
 return {reasons:reasons.includes(raw)?[raw]:[],shade:null,advice:null,note:''};
}

export const artworkSources=[
{id:'school_photo_friend',title:'푸른 소년 패러디',artist:'사용자 저장 재해석',position:'50% 3%',url:''},
{id:'school_last_minute_friend',title:'피리 부는 소년 패러디',artist:'사용자 저장 재해석',position:'50% 3%',url:''},
{id:'mona',title:'모나리자',artist:'레오나르도 다 빈치',position:'50% 30%',url:'https://commons.wikimedia.org/wiki/File:Mona_Lisa.jpg'},
{id:'pearl',title:'진주 귀걸이를 한 소녀',artist:'요하네스 베르메르',position:'50% 30%',url:'https://commons.wikimedia.org/wiki/File:1665_Girl_with_a_Pearl_Earring.jpg'},
{id:'venus',title:'비너스의 탄생',artist:'산드로 보티첼리',position:'53% 30%',url:'https://commons.wikimedia.org/wiki/File:El_nacimiento_de_Venus,_por_Sandro_Botticelli.jpg'},
{id:'madame',title:'마담 X',artist:'존 싱어 사전트',position:'50% 24%',url:'https://www.metmuseum.org/art/collection/search/12127'},
{id:'camille',title:'양산을 쓴 여인',artist:'클로드 모네',position:'57% 30%',url:'https://www.nga.gov/artworks/61379-woman-parasol-madame-monet-and-her-son'},
{id:'ophelia',title:'오필리아',artist:'존 에버렛 밀레이',position:'23% 55%',url:'https://commons.wikimedia.org/wiki/File:Millais_-_Ophelia.jpg'}
];
