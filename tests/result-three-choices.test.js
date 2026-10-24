import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const page=await readFile(new URL('../web/beauty-play/page.tsx',import.meta.url),'utf8');
const share=await readFile(new URL('../web/beauty-play/friend-share.tsx',import.meta.url),'utf8');
const game=await readFile(new URL('../web/beauty-play/game.ts',import.meta.url),'utf8');
test('result exposes exactly three main paths in the new section',()=>{const ui=page.split('<section className="result-three-choices"')[1].split('</section>')[0];assert(ui);for(const name of ['친구는 뭘 골랐을까?','너도 이거 갖고 있어?','다른 명화 골라주기'])assert(ui.includes(name));assert.equal((ui.match(/className="result-choice"/g)||[]).length,3);});
test('friend comparison keeps the original sharing and gated reveal',()=>{assert(page.includes('<FriendShare'));assert(page.includes('createLink={createLink}'));assert(page.includes('friend.shade===shade'));assert(share.includes('createLink(channel)'));assert(share.includes('navigator.share'));});
test('poll fails safe until launch, without dead destination',()=>{const ui=page.split('<section className="result-three-choices"')[1].split('</section>')[0];assert(ui.includes('준비 중'));assert(ui.includes('if(ownedPollEnabled)'));assert(page.includes('sessionInfo.ownedPollEnabled===true'));});
test('existing next game gate and saved game journey are preserved',()=>{assert(page.includes('aria-disabled={!shareUnlocked}'));assert(page.includes('if(!shareUnlocked){'));assert(page.includes("event('next_game','result')"));assert(page.includes('answer_saved'));assert(game.includes('export const characters'));});

test('all ten artwork assets exist for the game result and share card',async()=>{
 for(const id of ['mona','pearl','venus','madame','camille','ophelia','school_photo_friend','school_last_minute_friend','gogh','david']){const file=new URL('../dist/beauty-play/assets/art-'+id+'.webp',import.meta.url);assert((await (await import('node:fs/promises')).stat(file)).size>0,id);}
});
test('game and product image sources are local and stable',()=>{
 assert(share.includes("/beauty-play/assets/art-"));
 assert(page.includes('<Portrait id={c.id}/>'));
 assert(page.includes('option?.image||product.image'));
});
