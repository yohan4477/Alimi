// Presentational-only adapter: no identity, service API, metrics, or persistence.
import {esc} from './util.js';
import {roomArt} from './topic-art.js';
export const copy=language=>language==='ko'?{
 sample:'가상 대화',disclosure:'UX 테스트용 가상 대화예요. 실제 이용자·후기·활동 현황이 아니며 서비스에 저장되지 않아요.',
 title:'뷰티 고민, 함께 이야기해요',sub:'기존 UX 테스트 대화 13개를 둘러보세요.',live:'실제 커뮤니티로 이동',home:'커뮤니티',search:'탐색',saved:'내 활동',back:'뒤로',
 market:'카탈로그 범위',kr:'한국',us:'미국',choose:'선택 전',language:'언어',find:'가상 대화 검색',empty:'일치하는 가상 대화가 없어요.',activity:'이 미리보기에서 저장한 대화',memory:'좋아요와 저장은 이 화면에서만 유지되며 새로고침하면 사라져요.',none:'아직 저장한 가상 대화가 없어요.',save:'저장',savedLabel:'저장됨',like:'좋아요',person:'가상 인물',readonly:'이 가상 대화에는 글을 게시할 수 없어요. 실제 커뮤니티에서 직접 이야기를 시작해 주세요.',game:'게임을 열면 실제 서비스로 이동해요. 게임 응답은 별도의 저장 안내를 따라 처리돼요.',rooms:'가상 대화 둘러보기'
}:{
 sample:'Fictional conversation',disclosure:'Fictional conversations for UX testing, not actual users, reviews, or activity. This preview is not saved to the service.',
 title:'Beauty questions, shared together',sub:'Explore the 13 existing UX test conversations.',live:'Open the real community',home:'Community',search:'Explore',saved:'My activity',back:'Back',
 market:'Catalog scope',kr:'Korea',us:'United States',choose:'Not selected',language:'Language',find:'Search fictional conversations',empty:'No matching fictional conversations.',activity:'Conversations saved in this preview',memory:'Likes and saves stay in this preview only and disappear on reload.',none:'No fictional conversations saved yet.',save:'Save',savedLabel:'Saved',like:'Like',person:'Fictional person',readonly:'You cannot post in this fictional conversation. Start your own conversation in the real community.',game:'Opening the game leaves this preview for the real service. Game responses follow its separate storage notice.',rooms:'Explore fictional conversations'
};
export function disclosureMarkup(language){return `<div class="room-notice" data-sample-disclosure role="note"><span aria-hidden="true">ⓘ</span><span><b>${esc(copy(language).sample)}</b><small>${esc(copy(language).disclosure)}</small></span></div>`;}
export function roomMarkup(room,language){return `<button class="hot-row" data-sample-room="${esc(room.id)}"><span class="room-thumb room-thumb-art"><img src="${esc(roomArt({...room,title_ko:room.title}))}" alt="" loading="lazy"></span><span class="hot-text"><b>${esc(room.title)}</b><small>${esc(room.intro)}</small><span class="hot-meta">${esc(copy(language).sample)}</span></span></button>`;}
export function messageMarkup(message,messages,language,{liked=new Set(),saved=new Set()}={}){
 const c=copy(language),parent=messages.find(m=>m.id===message.reply_to),id=String(message.id);
 return `<article class="chat-msg feed" data-sample-message="${esc(id)}" tabindex="0"><div class="msg-main"><div class="msg-head"><b class="chat-nick">${esc(message.nickname)}</b><small>${esc(c.person)}</small></div>${parent?`<button class="chat-quote" data-sample-jump="${esc(parent.id)}"><b>${esc(parent.nickname)}</b><span>${esc(parent.body)}</span></button>`:''}<p class="msg-body">${esc(message.body)}</p></div><div class="msg-actions"><button class="chat-heart${liked.has(id)?' selected':''}" data-sample-like="${esc(id)}" aria-label="${esc(c.like)}" aria-pressed="${liked.has(id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button><button class="msg-reply" data-sample-save="${esc(id)}" aria-pressed="${saved.has(id)}">${esc(saved.has(id)?c.savedLabel:c.save)}</button></div></article>`;
}
