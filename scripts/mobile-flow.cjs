// UI-only regression suite. Run with Playwright and CHROMIUM_EXECUTABLE_PATH.
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {createHash}=require('node:crypto');
const {readFile,mkdir,writeFile}=require('node:fs/promises');
const {resolve,extname,dirname}=require('node:path');
const {readFileSync}=require('node:fs');
const fontCss=process.env.MOBILE_FONT_CSS?readFileSync(process.env.MOBILE_FONT_CSS,'utf8').replaceAll('Noto Sans KR','Apple SD Gothic Neo').replace(/url\(([^)]+)\)/g,(_,path)=>`url(data:font/woff2;base64,${readFileSync(resolve(dirname(process.env.MOBILE_FONT_CSS),path)).toString('base64')})`):'';
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../dist');
const out=resolve(process.env.MOBILE_RESULTS_DIR||'mobile-results');
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(req.url==='/'?'/index.html':req.url));if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
(async()=>{
 await mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu']}: {})});
 const results=[],startedAt=new Date().toISOString(),sourceSha256=Object.fromEntries(['app.js','index.html','style.css'].map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
 try{
 for(const width of [320,390,430]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);page.setDefaultTimeout(3000);if(fontCss){await page.addStyleTag({content:fontCss});await page.evaluate(()=>document.fonts.ready);}
  const check=async(name,fn)=>{try{await fn();results.push({width,name,status:'passed'});}catch(e){results.push({width,name,status:'failed',error:e.message});}};
  const tap=selector=>page.locator(selector).tap();
  const open=id=>tap(`[data-product="${id}"]`);
  const target=async value=>{await tap('#set-target');await page.locator('#target').fill(value);await tap('#target-form .primary');};
  await check('discovery and touch environment',async()=>{assert.equal(await page.locator('.card').count(),10);assert.ok(await page.evaluate(()=>navigator.maxTouchPoints>0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));});
  await check('favorite and target-only USD survives reload and edit',async()=>{
   await tap('[data-favorite="1"]');await open('2');await target('15.25');await tap('#back');
   await page.locator('#search').fill('no-such-product');await tap('[data-category="크림"]');await tap('nav [data-view="saved"]');assert.equal(await page.locator('.card').count(),2);assert.equal(await page.locator('#search').inputValue(),'');
   await page.reload();await tap('nav [data-view="saved"]');assert.equal(await page.locator('.card').count(),2);await open('2');await tap('#set-target');assert.equal(await page.locator('#target').inputValue(),'15.25');await page.locator('#target').fill('14.50');await tap('#target-form .primary');assert.match(await page.locator('#alert-status').innerText(),/14.50/);
  });
  await check('USD decimal keyboard and accessible range validation',async()=>{await tap('#set-target');assert.equal(await page.locator('#target').getAttribute('inputmode'),'decimal');await page.locator('#target').fill('10000.01');await tap('#target-form .primary');assert.equal(await page.locator('#target').getAttribute('aria-invalid'),'true');assert.match(await page.locator('#target-error').innerText(),/USD/);await tap('.close-dialog');});
  await check('removing heart preserves target-only tracking',async()=>{await tap('#detail .save-action');await tap('#detail .save-action');assert.equal(await page.locator('#detail .save-action').getAttribute('aria-pressed'),'false');await tap('#back');assert.equal(await page.locator('[data-product="2"]').count(),1);await open('2');});
  await check('dialog cancel restores action focus without jumping',async()=>{
   await tap('#set-target');await tap('.close-dialog');assert.equal(await page.evaluate(()=>document.activeElement.id),'set-target');
  });
  await check('USD deletion persists',async()=>{await tap('#remove-target');await tap('#back');await page.reload();await tap('nav [data-view="saved"]');assert.equal(await page.locator('[data-product="2"]').count(),0);});
  await check('KRW target edit and deletion; favorite independent',async()=>{
   await open('1');await target('12000');await target('11000');assert.match(await page.locator('#alert-status').innerText(),/11,000/);await tap('#back');await page.reload();await tap('nav [data-view="saved"]');await open('1');assert.match(await page.locator('#alert-status').innerText(),/11,000/);await tap('#remove-target');await tap('#back');assert.equal(await page.locator('.card').count(),1);
  });
  await check('list return scroll and focus',async()=>{
   await tap('nav [data-view="all"]');await page.locator('[data-product="9"]').scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);await open('9');await tap('#back');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-before)<3);assert.equal(await page.evaluate(()=>document.activeElement.dataset.product),'9');
  });
  await check('modal preserves detail position after target save',async()=>{
   await open('9');await page.locator('#alert-status').scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);await target('18000');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-before)<3,'detail scroll changed after modal save');
  });
  await check('save restores focus to target action',async()=>{await target('17000');assert.equal(await page.evaluate(()=>document.activeElement.id),'set-target');});
  await check('invalid exponent gets an accessible dialog error',async()=>{await tap('#set-target');await page.locator('#target').fill('1e4');await tap('#target-form .primary');assert.equal(await page.locator('#target-dialog').evaluate(el=>el.open),true);assert.equal(await page.locator('#target').getAttribute('aria-invalid'),'true');assert.ok((await page.locator('#target-error').innerText()).length>0);if(fontCss){await page.addStyleTag({content:fontCss});await page.evaluate(()=>document.fonts.ready);}await page.screenshot({path:resolve(out,`input-error-${width}.png`)});await tap('.close-dialog');});
  await check('mobile input constraints and invalid values',async()=>{
   if(await page.locator('#target-dialog').evaluate(el=>el.open))await tap('.close-dialog');await tap('#set-target');assert.equal(await page.locator('#target').getAttribute('inputmode'),'numeric');assert.ok(await page.locator('#target').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));await page.locator('#target').fill('0');await tap('#target-form .primary');assert.equal(await page.locator('#target-dialog').evaluate(el=>el.open),true);await tap('.close-dialog');
  });
  await tap('#back');await tap('nav [data-view="saved"]');await page.locator('.results').scrollIntoViewIfNeeded();if(fontCss){await page.addStyleTag({content:fontCss});await page.evaluate(()=>document.fonts.ready);}await page.screenshot({path:resolve(out,`mobile-${width}.png`)});
  await check('no uncaught browser errors',async()=>assert.deepEqual(errors,[]));
  await context.close();
  const blocked=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
  await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('test quota','QuotaExceededError')};Storage.prototype.removeItem=function(){throw new DOMException('test quota','QuotaExceededError')};});
  const p=await blocked.newPage();await p.goto('http://127.0.0.1:'+server.address().port);
  await check('blocked storage never reports save success',async()=>{await p.locator('[data-product="2"]').tap();await p.locator('#set-target').tap();await p.locator('#target').fill('12.50');await p.locator('#target-form .primary').tap();assert.match(await p.locator('#toast').innerText(),/현재 화면/);await p.reload();await p.locator('[data-product="2"]').tap();assert.doesNotMatch(await p.locator('#alert-status').innerText(),/12.50/);});
  await check('reset failure is disclosed',async()=>{await p.locator('#back').tap();p.once('dialog',d=>d.accept());await p.locator('#reset').tap();assert.match(await p.locator('#toast').innerText(),/현재 화면/);});
  await blocked.close();
 }
 }finally{await browser.close();server.close();await writeFile(resolve(out,'results.json'),JSON.stringify({startedAt,sourceSha256,node:process.version,viewportHeight:844,hasTouch:true,isMobile:true,browser:'Chromium',version:browser.version(),realIPhone:false,fontFallback:fontCss?'Noto Sans KR registered as missing Apple SD Gothic Neo fallback':'system',results},null,2));console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status==='failed'))process.exitCode=1;}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
