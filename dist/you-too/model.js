export const products = [
  {id:'romand-tint',brand:'rom&nd',name:'쥬시 래스팅 틴트',scope:'색상과 관계없이 답해 주세요.'},
  {id:'torriden-serum',brand:'Torriden',name:'다이브인 세럼',scope:'용량과 관계없이 답해 주세요.'},
  {id:'laneige-lip',brand:'LANEIGE',name:'립 슬리핑 마스크',scope:'향과 관계없이 답해 주세요.'}
];
export const ownership = {own:'나도 있어',past:'전에 있었어',never:'없어'};
export const followups = {
 own:{question:'요즘 얼마나 손이 가?',answers:{often:'자주 써',sometimes:'가끔 써',rarely:'거의 안 써',unopened:'아직 안 뜯었어'}},
 past:{question:'끝까지 다 썼어?',answers:{finished:'다 썼어',part:'일부만 썼어',unused:'사용하지 않았어',unsure:'기억이 안 나'}},
 never:{question:'이 제품, 써보고 싶어?',answers:{want:'써보고 싶어',unsure:'잘 모르겠어',no:'관심 없어'}}
};
export function validAnswer(product, choice, detail) {
 return products.some(p=>p.id===product) && Object.hasOwn(ownership,choice) && (detail===null || Object.hasOwn(followups[choice].answers,detail));
}
export function comparison(friend,mine) {
 if(friend===mine) return friend==='own'?'둘 다 갖고 있네!':friend==='past'?'둘 다 써본 적 있네!':'둘 다 갖고 있지 않네!';
 return '같은 제품, 서로 다른 경험.';
}
export function shareText(product,answer) {
 return `${product.name}, 너도 이거 있어?\n나는 “${ownership[answer.choice]}”${answer.detail?`, “${followups[answer.choice].answers[answer.detail]}”`:''}라고 답했어.`;
}
