import cxDataset from './cx-demo-fixtures.json' with {type:'json'};
import productImages from './demo-product-images.json' with {type:'json'};
import {lang} from './i18n.js';
// Isolated synthetic chat examples for presentation. Not actual users or KPIs.
// Text follows the UI language at load: Korean screens read Korean, English screens English.
const ko=lang==='ko', L=(k,e)=>ko?k:e;
const topicsKo=['여드름 진정','속건조 해결','민감성 피부','모공 관리','선크림 추천','장벽 회복','지성 피부','환절기 관리','기미 잡티','탄력 관리','스킨케어 입문','토너패드','립 조합','쿨톤 메이크업','웜톤 메이크업','쿠션 비교','컨실러','지속력 메이크업','내추럴 메이크업','데일리 메이크업','브러시 퍼프','눈썹 메이크업','글로우 매트','퍼스널 컬러','COSRX 후기','롬앤 틴트','클리오 쿠션','K뷰티 입문','미국 K뷰티','해외 직구','여행용 파우치','운동 후 관리','출근 메이크업','뷰티 질문','클렌징 루틴','틴트 발색'];
const topicsEn=['Acne calming','Inner dryness','Sensitive skin','Pore care','Sunscreen picks','Barrier repair','Oily skin','Seasonal skin care','Dark spots','Firming care','Skincare basics','Toner pads','Lip combos','Cool-tone makeup','Warm-tone makeup','Cushion comparison','Concealer','Long-wear makeup','Natural makeup','Everyday makeup','Brushes & puffs','Brow makeup','Glow vs. matte','Personal color','COSRX reviews','rom&nd tints','CLIO cushions','K-beauty starter','K-beauty in the US','Shopping from Korea','Travel pouch','Post-workout care','Office makeup','Beauty questions','Cleansing routine','Tint swatches'];
const concerns=['acne','dry','sensitive','pores','sensitive','dry','sebum','sensitive','spots','firmness','dry','pores','lip','shade','shade','cushion','base','longwear','base','lip','base','longwear','base','shade','acne','lip','cushion','sensitive','lip','base','longwear','sebum','longwear','dry','acne','shade'];
const names=L(['루나','피치','민트','제이','소라','코코','로지','모카','나나','하늘','유니','달빛'],['Luna','Peach','Mint','Jay','Sora','Coco','Rosie','Mocha','Nana','Sky','Uni','Moon']);
const demoNow = Date.now();
export const demoRooms=topicsKo.map((title,i)=>({id:'demo-'+i,title_ko:title,title_en:topicsEn[i],intro_ko:title+'에 대해 편하게 이야기해요.',intro_en:`Talk about ${topicsEn[i].toLowerCase()} together.`,kind:'topic',tag:i<12?'skin':i<24?'makeup':'talk',concerns:[concerns[i]],members:0,messages_24h:0,sort:i,last_message_at:null,demo:true}));
// Empty topic examples stay empty. Never pad conversations with generated repetitions.
export const demoMessages=Object.fromEntries(demoRooms.map(r=>[r.id,[]]));

// Explicit subject products: separate from an incidental product mention in a message.
export const demoProducts = [
  ['torriden-serum','토리든','다이브인 세럼','건성이라 아침에 쓰기엔 어떤지 궁금해요.','저는 얇게 바르고 크림을 덧발라요.','Torriden','DIVE-IN Serum','My skin is dry. Is it okay for mornings?','I apply a thin layer and add cream on top.'],
  ['aestura-cream','에스트라','아토베리어365 크림','화장 전에 바르면 밀리진 않나요?','양을 조금 줄이니까 저는 괜찮았어요.','AESTURA','Atobarrier 365 Cream','Does it pill under makeup?','Using a little less worked fine for me.'],
  ['roundlab-sun','라운드랩','자작나무 수분 선크림','덧바를 때 사용감이 궁금해요.','저는 점심에 소량씩 나눠 발라요.','Round Lab','Birch Juice Moisturizing Sunscreen','How does it feel when you reapply?','I reapply small amounts at lunch.'],
  ['anua-toner','아누아','어성초 77 토너','세안 후 어떤 순서로 사용하세요?','저는 토너 다음에 세럼을 써요.','Anua','Heartleaf 77% Toner','What order do you use it in after cleansing?','Toner first, then serum.'],
  ['cosrx-essence','COSRX','스네일 96 에센스','촉촉한 마무리감인가요?','저한테는 촉촉했지만 피부마다 다를 것 같아요.','COSRX','Snail 96 Mucin Essence','Is the finish dewy?','Dewy for me, but it probably depends on skin.'],
  ['romand-tint','롬앤','쥬시 래스팅 틴트','쿨톤 데일리 색상 같이 골라봐요.','저는 실제 발색 사진을 더 보고 고르려고요.','rom&nd','Juicy Lasting Tint','Help me pick an everyday cool-tone shade.','I want to see more real swatches before choosing.'],
  ['clio-cushion','클리오','킬커버 메쉬글로우 쿠션','수정 화장할 때도 괜찮나요?','저는 얇게 올릴 때 편했어요.','CLIO','Kill Cover Mesh Glow Cushion','Is it good for touch-ups too?','It was easy when I applied a thin layer.'],
  ['laneige-lip','라네즈','립 슬리핑 마스크','밤에 어느 정도 양으로 바르세요?','저는 소량만 발라도 충분했어요.','LANEIGE','Lip Sleeping Mask','How much do you apply at night?','A small amount was enough for me.'],
  ['medicube-pad','메디큐브','제로 모공 패드','매일 쓰는 분도 계세요?','제 피부는 민감해서 간격을 두고 써요.','medicube','Zero Pore Pad','Does anyone use it every day?','My skin is sensitive, so I space it out.'],
  ['drg-cream','닥터지','레드 블레미쉬 수딩 크림','여름에 쓰기에는 무겁지 않나요?','저는 얇게 펴 바르는 편이에요.','Dr.G','Red Blemish Soothing Cream',"Isn't it too heavy for summer?",'I spread it thin.'],
  ['goodal-serum','구달','청귤 비타C 세럼','다른 세럼이랑 같이 쓰세요?','저는 한 번에 하나씩 바꿔보는 중이에요.','goodal','Green Tangerine Vita C Serum','Do you use it with other serums?',"I'm switching one product at a time."],
  ['peripera-tint','페리페라','잉크 무드 글로이 틴트','립 조합 추천받고 싶어요.','저는 연한 색을 베이스로 먼저 발라요.','peripera','Ink Mood Glowy Tint','Looking for lip combo ideas.','I put a light shade down first as a base.']
].map(([id,bk,nk,qk,ak,be,ne,qe,ae])=>{const brand=L(bk,be),name=L(nk,ne);return {id,brand,name,image_url:productImages[id],label:`${brand} ${name}`,question:L(qk,qe),answer:L(ak,ae),label_ko:`${bk} ${nk}`,label_en:`${be} ${ne}`};});
for (const [i, product] of demoProducts.entries()) {
  for (let j=0;j<2;j++) {
    const id=`demo-product-${i}-${j}`;
    const room={id,title_ko:`${product.label_ko} · ${j?'조합·비교':'사용 후기'}`,title_en:`${product.label_en} · ${j?'Combos & comparisons':'Reviews'}`,intro_ko:`${product.label_ko} 사용 경험을 나눠요.`,intro_en:`Share experiences with ${product.label_en}.`,kind:'topic',tag:[5,6,7,11].includes(i)?'makeup':'skin',concerns:[[5,7,11].includes(i)?'lip':i===6?'cushion':'dry'],members:8+(i*3+j)%25,messages_24h:4+(i+j)%13,sort:36+i*2+j,last_message_at:new Date(Date.UTC(2026,9,20,7)-i*60000-j*30000).toISOString(),demo:true,topic_product:product};
    demoRooms.push(room);
    // One question and one answer only in the review example; comparison starts empty.
    demoMessages[id]=j ? [] : [product.question,product.answer].map((body,k)=>({id:950000+i*100+k,room_id:id,nickname:names[(i+k)%names.length],author_tag:`demo-author-${(i+k)%12}`,body,likes:0,item:k===0?{demo:true,family_key:product.id,image_url:product.image_url,brand:product.brand,name:product.name,label:product.label}:null,reply_to:k===1?950000+i*100:null,created_at:new Date(demoNow-(2-k)*3600000).toISOString(),demo:true}));
    room.members=demoMessages[id].length; room.messages_24h=demoMessages[id].length;
    room.last_message_at=demoMessages[id].at(-1)?.created_at ?? null;
  }
}
// Do not fabricate personal activity or notifications for visitors.
export const demoActivity={savedRooms:[],joined:[],recent:[],saved:[],alerts:[]};

export function createDemoProductRoom({title,intro='',tag='talk',concerns=[],productName}) {
  const product=demoProducts.find(p=>p.label===productName)??{id:`custom-${demoRooms.length}`,brand:'',name:productName,label:productName};
  const room={id:`demo-created-${demoRooms.length}`,title_ko:title,title_en:title,intro_ko:intro,intro_en:intro,kind:'topic',tag,concerns:[...concerns],members:0,messages_24h:0,sort:demoRooms.length,demo:true,topic_product:product};
  demoRooms.push(room);demoMessages[room.id]=[];return room;
}

export const demoEntries = () => Object.values(demoMessages).flat().map(m=>({...m,source:'chat'}));

// Existing community renderer uses these synthetic discussion fixtures.
if (ko) { for (const room of cxDataset.rooms) { demoRooms.push(room); demoMessages[room.id] = cxDataset.messages[room.id]; } }
