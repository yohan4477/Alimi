// Isolated synthetic chat examples for presentation. Not actual users or KPIs.
const topics=['여드름 진정','속건조 해결','민감성 피부','모공 관리','선크림 추천','장벽 회복','지성 피부','환절기 관리','기미 잡티','탄력 관리','스킨케어 입문','토너패드','립 조합','쿨톤 메이크업','웜톤 메이크업','쿠션 비교','컨실러','지속력 메이크업','내추럴 메이크업','데일리 메이크업','브러시 퍼프','눈썹 메이크업','글로우 매트','퍼스널 컬러','COSRX 후기','롬앤 틴트','클리오 쿠션','K뷰티 입문','미국 K뷰티','해외 직구','여행용 파우치','운동 후 관리','출근 메이크업','뷰티 질문','클렌징 루틴','틴트 발색'];
const concerns=['acne','dry','sensitive','pores','sensitive','dry','sebum','sensitive','spots','firmness','dry','pores','lip','shade','shade','cushion','base','longwear','base','lip','base','longwear','base','shade','acne','lip','cushion','sensitive','lip','base','longwear','sebum','longwear','dry','acne','shade'];
const q=['요즘 어떤 제품 쓰세요?','비슷한 고민 있으신 분?','다른 분 경험도 궁금해요.','이 조합 써본 분 계세요?','피부 타입별로 차이가 있나요?','구매 전에 후기 더 들어보고 싶어요.'];
const a=['저도 그게 궁금해요!','저는 소량으로 테스트해봤어요.','저는 건성이라 조금 달랐어요.','사용감은 괜찮았는데 개인차가 있어요.','좋은 정보 감사합니다.','저도 며칠 더 써보려고요.'];
const names=['루나','피치','민트','제이','소라','코코','로지','모카','나나','하늘','유니','달빛'];
export const demoRooms=topics.map((title,i)=>({id:'demo-'+i,title_ko:title,title_en:title,intro_ko:title+'에 대해 편하게 이야기해요.',intro_en:'Discuss '+title+'.',kind:'topic',tag:i<12?'skin':i<24?'makeup':'talk',concerns:[concerns[i]],members:5+(i*7)%41,messages_24h:3+(i*5)%18,sort:i,last_message_at:new Date(Date.UTC(2026,9,20,3)-i*60000).toISOString(),demo:true}));
export const demoMessages=Object.fromEntries(demoRooms.map((r,i)=>[r.id,Array.from({length:24},(_,j)=>({id:900000+i*100+j,room_id:r.id,nickname:names[(i+j)%12],author_tag:'demo-author-'+((i+j)%12),body:j%2?q[(i+j)%6]:a[(i+j)%6],likes:(i+j)%9,item:null,reply_to:null,created_at:new Date(Date.UTC(2026,9,18,5)+i*60000+j*3600000).toISOString(),demo:true}))]));

// Explicit subject products: separate from an incidental product mention in a message.
export const demoProducts = [
  ['torriden-serum','토리든','다이브인 세럼','건성이라 아침에 쓰기엔 어떤지 궁금해요.','저는 얇게 바르고 크림을 덧발라요.'],
  ['aestura-cream','에스트라','아토베리어365 크림','화장 전에 바르면 밀리진 않나요?','양을 조금 줄이니까 저는 괜찮았어요.'],
  ['roundlab-sun','라운드랩','자작나무 수분 선크림','덧바를 때 사용감이 궁금해요.','저는 점심에 소량씩 나눠 발라요.'],
  ['anua-toner','아누아','어성초 77 토너','세안 후 어떤 순서로 사용하세요?','저는 토너 다음에 세럼을 써요.'],
  ['cosrx-essence','COSRX','스네일 96 에센스','촉촉한 마무리감인가요?','저한테는 촉촉했지만 피부마다 다를 것 같아요.'],
  ['romand-tint','롬앤','쥬시 래스팅 틴트','쿨톤 데일리 색상 같이 골라봐요.','저는 실제 발색 사진을 더 보고 고르려고요.'],
  ['clio-cushion','클리오','킬커버 메쉬글로우 쿠션','수정 화장할 때도 괜찮나요?','저는 얇게 올릴 때 편했어요.'],
  ['laneige-lip','라네즈','립 슬리핑 마스크','밤에 어느 정도 양으로 바르세요?','저는 소량만 발라도 충분했어요.'],
  ['medicube-pad','메디큐브','제로 모공 패드','매일 쓰는 분도 계세요?','제 피부는 민감해서 간격을 두고 써요.'],
  ['drg-cream','닥터지','레드 블레미쉬 수딩 크림','여름에 쓰기에는 무겁지 않나요?','저는 얇게 펴 바르는 편이에요.'],
  ['goodal-serum','구달','청귤 비타C 세럼','다른 세럼이랑 같이 쓰세요?','저는 한 번에 하나씩 바꿔보는 중이에요.'],
  ['peripera-tint','페리페라','잉크 무드 글로이 틴트','립 조합 추천받고 싶어요.','저는 연한 색을 베이스로 먼저 발라요.']
].map(([id,brand,name,question,answer])=>({id,brand,name,label:`${brand} ${name}`,question,answer}));
for (const [i, product] of demoProducts.entries()) {
  for (let j=0;j<2;j++) {
    const id=`demo-product-${i}-${j}`, title=`${product.label} · ${j?'조합·비교':'사용 후기'}`;
    const room={id,title_ko:title,title_en:title,intro_ko:`${product.label} 사용 경험을 나눠요.`,intro_en:`Share experiences with ${product.label}.`,kind:'topic',tag:[5,6,7,11].includes(i)?'makeup':'skin',concerns:[[5,7,11].includes(i)?'lip':i===6?'cushion':'dry'],members:8+(i*3+j)%25,messages_24h:4+(i+j)%13,sort:36+i*2+j,last_message_at:new Date(Date.UTC(2026,9,20,7)-i*60000-j*30000).toISOString(),demo:true,topic_product:product};
    demoRooms.push(room);
    demoMessages[id]=Array.from({length:24},(_,k)=>({id:950000+i*100+j*30+k,room_id:id,nickname:names[(i+j+k)%names.length],author_tag:`demo-author-${(i+j+k)%12}`,body:[product.question,product.answer,`${product.name} 써본 분들의 다른 경험도 듣고 싶어요.`,'저도 비슷한 고민이에요. 피부 타입이나 쓰는 양에 따라 다를 것 같아요.','구매 전에 여기서 경험을 더 들어보려고요.','사용 순서도 함께 알려주셔서 도움됐어요.'][k%6],likes:(i+j+k)%7,item:null,reply_to:null,created_at:new Date(Date.UTC(2026,9,19,6)+k*3600000+i*60000).toISOString(),demo:true}));
  }
}
export function createDemoProductRoom({title,intro='',tag='talk',concerns=[],productName}) {
  const product=demoProducts.find(p=>p.label===productName)??{id:`custom-${demoRooms.length}`,brand:'',name:productName,label:productName};
  const room={id:`demo-created-${demoRooms.length}`,title_ko:title,title_en:title,intro_ko:intro,intro_en:intro,kind:'topic',tag,concerns:[...concerns],members:0,messages_24h:0,sort:demoRooms.length,demo:true,topic_product:product};
  demoRooms.push(room);demoMessages[room.id]=[];return room;
}
