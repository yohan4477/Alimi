// Read-only, explicitly fictional UX examples. Never imported by the actual app.
import source from './cx-demo-fixtures.json' with {type:'json'};
import english from './cx-demo-fixtures.en.json' with {type:'json'};
export function sampleRooms(language='ko'){
 return source.rooms.map(room=>({id:room.id,tag:room.tag,title:language==='en'?english.rooms[room.id].title:room.title_ko,intro:language==='en'?english.rooms[room.id].intro:room.intro_ko,demo:true}));
}
export function sampleMessages(roomId,language='ko'){
 return (source.messages[roomId]||[]).map(message=>({id:message.id,room_id:message.room_id,author:message.author_tag,nickname:language==='en'?english.messages[message.id].nickname:message.nickname,body:language==='en'?english.messages[message.id].body:message.body,reply_to:message.reply_to,demo:true}));
}
export const isSampleRoom=id=>source.rooms.some(room=>room.id===id);
