// Server nicknames are "Adjective Animal" in English (chat_nickname in the chat migration). Korean screens show
// the same pair in Korean; anything else (older or custom names) is shown as stored. Mirrored in iOS Nickname.swift.
import {lang} from './i18n.js';

const ADJ = {Dewy:'촉촉한', Glowy:'반짝이는', Silky:'매끈한', Calm:'차분한', Bouncy:'탱탱한', Fresh:'상큼한', Velvet:'벨벳', Misty:'안개빛',
  Sunny:'햇살', Plump:'통통한', Gentle:'순한', Bright:'밝은', Cozy:'포근한', Rosy:'장밋빛', Clear:'맑은', Soft:'보드라운', Matte:'보송한',
  Peachy:'복숭아빛', Minty:'민트빛', Honey:'꿀빛'};
const ANIMAL = {Otter:'수달', Panda:'판다', Fox:'여우', Bunny:'토끼', Seal:'물범', Koala:'코알라', Tiger:'호랑이', Duck:'오리', Hamster:'햄스터',
  Owl:'부엉이', Deer:'사슴', Cat:'고양이', Puppy:'강아지', Penguin:'펭귄', Turtle:'거북이', Lamb:'아기양', Squirrel:'다람쥐', Whale:'고래',
  Swan:'백조', Bear:'곰'};

export function nick(name) {
  if (lang !== 'ko') return name ?? '';
  const [adj, animal, ...rest] = String(name ?? '').split(' ');
  return !rest.length && ADJ[adj] && ANIMAL[animal] ? `${ADJ[adj]} ${ANIMAL[animal]}` : name ?? '';
}
