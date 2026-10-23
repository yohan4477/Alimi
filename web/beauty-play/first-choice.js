// Count an active choice once per play, including legacy product-first invitations.
// Keep the existing backend step contract; do not introduce a D1 dependency.
export function recordFirstChoice(seen,play,event){
 if(!play)return false;
 const key='first-choice-'+play;if(seen.has(key))return false;
 seen.add(key);event('game_start','selection');return true;
}
