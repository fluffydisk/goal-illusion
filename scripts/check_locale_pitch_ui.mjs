// Local integration checks. Synthetic commentary; no real model requests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const bundle=JSON.parse(readFileSync('web/data/analysis.json'));
const record=bundle.snapshot.matches.find(d=>d.home_score>0&&d.away_score>0&&d.shots.some(s=>s.team_id===d.match.away_id&&s.outcome==='Goal'));
const item=bundle.stories[record.match.id];
const story=lang=>({language:lang,headline:lang==='en'?'Recorded shots and the final score':'Şut verileri ve maçın sonucu',summary:lang==='en'?'The shot data supports an analysis of the recorded chances.':'Şut verileri maçtaki fırsatların incelenmesini sağlar.',fingerprint:item.facts.fingerprint,story_version:2,prompt_version:9,cards:item.facts.sections.map(type=>({type,title:lang==='en'?'A look at the recorded chances':'Kayıtlı fırsatların değerlendirmesi',text:lang==='en'?'The match can be assessed using its recorded shots. The probabilities are conditional on those chances.':'Maç, kaydedilmiş şutları üzerinden değerlendirilebilir. Olasılıklar bu fırsatlara koşulludur.',evidence_ids:['chances','outcomes']}))});
const base=process.env.STORY_BASE_URL||'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const context=await browser.newContext({locale:'en-GB'}),page=await context.newPage({viewport:{width:1280,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let started=false,ready=false,posts=0;
 await page.route('**/health',r=>r.fulfill({json:{languages:['tr','en']}}));
 await page.route('**/analysis/*',r=>{
  const lang=new URL(r.request().url()).searchParams.get('lang');assert.ok(['en','tr'].includes(lang));
  if(r.request().method()==='POST'){started=true;posts++;}
  return r.fulfill({json:ready?{status:'ready',language:lang,narrative:story(lang),fingerprint:item.facts.fingerprint}:started?{status:'generating',language:lang,phase:lang==='en'?'Writing match commentary':'Maçın hikâyesi yazılıyor',started_at:Date.now(),updated_at:Date.now()}:{status:'missing',language:lang}});
 });
 await page.goto(`${base}/?match=${record.match.id}`);
 await page.locator('#analysis').waitFor({state:'visible'});assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.equal(await page.locator('h1').innerText(),'Match analysis');
 assert.equal(await page.locator('#language').inputValue(),'en');
 assert.match(await page.locator('#date').innerText(),/2026/);
 assert.match(await page.locator('#metrics').innerText(),/Total shot xG/);
 assert.ok(!(await page.locator('#metrics').innerText()).includes('Şut'));
 await page.locator('#analysis-evidence > summary').click();
 assert.match(await page.locator('#all-evidence').innerText(),/Chance quality/);
 assert.match(await page.locator('#all-evidence').innerText(),/non-goal shot|goal,/);
 const markers=await page.locator('#pitch .shot').evaluateAll(nodes=>nodes.map(e=>({team:e.dataset.team,goal:e.dataset.goal,x:Number(e.getAttribute('cx')??e.getAttribute('x')),y:Number(e.getAttribute('cy')??e.getAttribute('y'))})));
 const located=record.shots.filter(s=>s.x!==null&&s.y!==null);assert.equal(markers.length,located.length);
 markers.forEach((m,i)=>{const s=located[i],home=s.team_id===record.match.home_id;assert.equal(m.x,home?s.x:120-s.x);assert.equal(m.y,home?s.y:80-s.y);assert.equal(m.goal,String(s.outcome==='Goal'));});
 assert.ok(markers.some(m=>m.team==='home'&&m.goal==='true'&&m.x>60));assert.ok(markers.some(m=>m.team==='away'&&m.goal==='true'&&m.x<60));
 await page.locator('#shot-map').screenshot({path:'/tmp/goal-illusion-pitch.png'});
 await page.waitForFunction(()=>!document.querySelector('#generate-ai').disabled);await page.locator('#generate-ai').click();await page.locator('#ai-progress').waitFor();
 assert.equal(posts,1);assert.match(await page.locator('#ai-estimate').innerText(),/recorded|commentary/);
 await page.locator('#language').selectOption('tr');
 assert.equal(new URL(page.url()).searchParams.get('lang'),'tr');assert.equal(new URL(page.url()).searchParams.get('match'),String(record.match.id));
 assert.equal(await page.locator('h1').innerText(),'Maç analizi');assert.match(await page.locator('#metrics').innerText(),/Şutlardan/);
 ready=true;await page.locator('#language').selectOption('en');
 await page.locator('#open-story').waitFor({state:'visible',timeout:10000});await page.locator('#open-story').click();
 assert.equal(await page.getByRole('button',{name:'Close ×',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'Pause',exact:true}).count(),1);
 await page.locator('.story-proof summary').click();assert.match(await page.locator('.story-proof').innerText(),/Chance quality/);assert.ok(!(await page.locator('dialog').innerText()).includes('Şut'));
 await page.screenshot({path:'/tmp/goal-illusion-english-reader.png'});
 await page.keyboard.press('Escape');
 await page.reload();await page.locator('#analysis').waitFor();assert.equal(await page.locator('#language').inputValue(),'en');
 await page.goto(`${base}/?match=${record.match.id}&lang=tr`);await page.locator('#analysis').waitFor();assert.equal(await page.locator('#language').inputValue(),'tr');
 await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#language').selectOption('en');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/goal-illusion-english-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 // Invalid URL language falls back to a supported preference; blocked storage remains usable.
 const clean=await browser.newContext({locale:'tr-TR'}),fallback=await clean.newPage();await fallback.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));
 await fallback.goto(`${base}/?lang=xx`);await fallback.locator('#analysis').waitFor();assert.equal(await fallback.locator('#language').inputValue(),'tr');await clean.close();
 console.log('PASS TR/EN switch, browser default, saved preference, URL override, localized evidence/reader/progress, 320px layout, home/away shot AND goal coordinates');
} finally {await browser.close();}
