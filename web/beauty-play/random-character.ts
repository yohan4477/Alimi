/** A shuffled character deck, scoped to this tab. Each eligible character appears once per cycle. */
const KEY='beauty-play-character-deck-v1';
export function randomNextCharacter(ids:string[], current?:string):string {
 const unique=[...new Set(ids)];if(!unique.length)throw Error('No characters');
 let stored:{remaining:string[]}|null=null;
 try{stored=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{}
 let remaining=Array.isArray(stored?.remaining)?[...new Set(stored!.remaining)].filter(id=>unique.includes(id)):[];
 if(!remaining.length)remaining=[...unique];
 // Avoid immediate repeats without dropping the current character from the deck.
 let candidates=remaining.filter(id=>id!==current);
 if(!candidates.length){remaining=[...unique];candidates=remaining.filter(id=>id!==current);if(!candidates.length)candidates=[...remaining];}
 const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);const index=Math.floor((bytes[0]/4294967296)*candidates.length);
 const chosen=candidates[index];remaining.splice(remaining.indexOf(chosen),1);
 try{sessionStorage.setItem(KEY,JSON.stringify({remaining}))}catch{}
 return chosen;
}
