// Handoff regressions: same-photo SKU identity, saved option, failed send, draft and metrics boundaries.
// All REST calls are fixtures; no production writes. CAPTURE_ONLY records the unchanged baseline.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const base=process.argv[2]??'http://127.0.0.1:3000/';
const label=process.env.CAPTURE_ONLY?'before':'after';
await mkdir('artifacts/handoff',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
const room={id:'tint',title_en:'Tint talk',title_ko:'틴트 이야기',intro_en:'Share your experience',intro_ko:'발색 경험을 나눠요',kind:'topic',sort:1,members:2,messages_24h:1,last_message_at:new Date().toISOString()};
const common={family_key:'tint',retailer:'Stylevana US',market:'US',brand:'TEST',brand_ko:'테스트',currency:'USD',availability:'in_stock',image_url:null,size_label:'4g',category:'립'};
const items=[{...common,sku:'01',name:'Tint - 01',option_label:'01',price_minor:1200,url:'https://www.stylevana.com/01.html',affiliate_url:'https://www.awin1.com/pclick.php?p=01'},
 {...common,sku:'02',name:'Tint - 02',option_label:'02',price_minor:1800,url:'https://www.stylevana.com/02.html',affiliate_url:'https://www.awin1.com/pclick.php?p=02'}];
const messages=[{id:1,room_id:'tint',author_tag:'other',nickname:'Maya',body:'02호 발색은 어때요?',item:items[1],reply_to:null,likes:0,created_at:new Date().toISOString()}];
let failSend=true,sends=0;const events=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('seoulbeauty-interests-v1',JSON.stringify({version:1,skincare:false,makeup:false,concerns:[],done:true}));localStorage.setItem('alimi-chat-agreed','1');});
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),u=new URL(req.url()),resource=u.pathname.split('/').at(-1);
  if(resource==='app_events'){events.push(req.postDataJSON());return route.fulfill({status:204});}
  if(resource==='chat_room_list')return route.fulfill({json:[room]});
  if(resource==='chat_messages')return route.fulfill({json:u.searchParams.has('id')?[]:messages});
  if(resource==='join_chat')return route.fulfill({json:'Jade'});
  if(resource==='catalog_items')return route.fulfill({json:items});
  if(resource==='post_chat'){sends++;if(failSend)return route.fulfill({status:503,json:{message:'unavailable'}});const b=req.postDataJSON();return route.fulfill({json:{...messages[0],id:2,body:b.p_body,item:items.find(i=>i.sku===b.p_sku)??null}});}
  return route.fulfill({json:[]});
 });
 if(process.env.QA_FONT_DIR)await page.route('**/__qa-fonts/*',route=>route.fulfill({path:process.env.QA_FONT_DIR+'/files/'+new URL(route.request().url()).pathname.split('/').at(-1)}));
 await page.goto(base+'?lang=ko');
 if(process.env.QA_FONT_DIR){let css=await readFile(process.env.QA_FONT_DIR+'/400.css','utf8');css+=await readFile(process.env.QA_FONT_DIR+'/700.css','utf8');await page.addStyleTag({content:css.replaceAll('./files/','/__qa-fonts/')+"\nbody,button,input,textarea{font-family:'Noto Sans KR',sans-serif !important}"});await page.evaluate(()=>document.fonts.ready);}
await page.locator('.hot-row').first().waitFor();
 await page.screenshot({path:`artifacts/handoff/${label}-community.png`});
 await page.click('#tabbar [data-screen="saved"]');await page.screenshot({path:`artifacts/handoff/${label}-saved.png`});
 if(!process.env.CAPTURE_ONLY){
  assert.equal(await page.locator('#saved .add-slot').count(),0);
  assert.equal(await page.locator('.activity-tabs .on').evaluate(el=>getComputedStyle(el).borderBottomWidth),'2px');
 }
 await page.click('#tabbar [data-screen="chat"]');await page.locator('.hot-row[data-chat-room="tint"]').first().click();await page.locator('#chat-log .chat-item').waitFor();
 await page.locator('#chat-text').waitFor();await page.fill('#chat-text','이 색상 질문을 작성 중이에요');
 await page.locator('#chat-log .chat-item').click();await page.locator('#family-dialog[open] #family-price').waitFor();
 await page.screenshot({path:`artifacts/handoff/${label}-product.png`});
 if(process.env.CAPTURE_ONLY){assert.deepEqual(errors,[]);console.log('baseline screenshots captured');}
 else {
  assert.match(await page.locator('#family-price').innerText(),/18/,'arrival selects attached SKU 02');
  assert.equal(new URL(await page.locator('.family-buy').getAttribute('href')).searchParams.get('p'),'02');
  await page.locator('[data-family-option="0"]').click();
  assert.match(await page.locator('#family-price').innerText(),/12/);
  assert.equal(new URL(await page.locator('.family-buy').getAttribute('href')).searchParams.get('p'),'01');
  await page.locator('[data-family-option="1"]').click();await page.locator('[data-family-save]').click();
  assert.equal(await page.locator('[data-family-save]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-family-attach]').click();
  assert.equal(await page.locator('#chat-text').inputValue(),'이 색상 질문을 작성 중이에요');
  await page.click('#chat-form .chat-send');await page.waitForFunction(()=>!document.querySelector('#chat-text').disabled);
  assert.equal(sends,1);assert.equal(events.filter(e=>e.name==='chat_send').length,0);
  assert.equal(await page.locator('#chat-text').inputValue(),'이 색상 질문을 작성 중이에요');
  assert.match(await page.locator('#chat-context').innerText(),/02/);
  await page.click('.room-back');await page.locator('.hot-row[data-chat-room="tint"]').first().click();await page.locator('#chat-text').waitFor();
  assert.equal(await page.locator('#chat-text').inputValue(),'이 색상 질문을 작성 중이에요');
  assert.match(await page.locator('#chat-context').innerText(),/02/);
  failSend=false;await page.click('#chat-form .chat-send');await page.waitForFunction(()=>document.querySelector('#chat-text').value==='');
  assert.equal(sends,2);assert.equal(events.filter(e=>e.name==='chat_send').length,1);
  await page.click('.room-back');await page.locator('.hot-row').first().waitFor();await page.click('#tabbar [data-screen="saved"]');assert.equal(await page.locator('#saved .add-slot').count(),0);
  await page.locator('#saved [data-product]').first().click();await page.locator('#detail:not([hidden])').waitFor();
  assert.match(await page.locator('#detail h1').innerText(),/02/);
  await page.reload();await page.locator('.hot-row').first().waitFor();await page.click('#tabbar [data-screen="saved"]');
  assert.match(await page.locator('#saved').innerText(),/02/);
  assert.deepEqual(errors,[]);console.log('ok - exact SKU price/link/save, failed send keeps draft/card, retry counts success once, room return and saved reload');
 }
}finally{await browser.close();}
