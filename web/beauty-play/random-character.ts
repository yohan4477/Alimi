/** A shuffled character deck, scoped to this tab. Each eligible character appears once per cycle. */
const KEY='beauty-play-character-deck-v1';
export function randomNextCharacter(ids:string[], current?:string):string {
 const unique=[...new Set(ids)];if(!unique.length)throw Error('No characters');
 let stored:{remaining:string[]}|null=null;
 try{stored=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{}
 let remaining=Array.isArray(stored?.remaining)?stored!.remaining.filter(id=>unique.includes(id)&&id!==current):[];
 if(!remaining.length){remaining=unique.filter(id=>id!==current);if(!remaining.length)remaining=[...unique];}
 const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);const index=Math.floor((bytes[0]/4294967296)*remaining.length);
 const [chosen]=remaining.splice(index,1);
 try{sessionStorage.setItem(KEY,JSON.stringify({remaining}))}catch{}
 return chosen;
}
