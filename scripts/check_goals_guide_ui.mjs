import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const records=JSON.parse(readFileSync('web/data/analysis.json')).snapshot.matches;
const record=records.find(d=>d.home_fixed+d.away_fixed>0&&d.shots.some(s=>s.outcome==='Goal'));
const empty=records.find(d=>d.home_score+d.away_score===0);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:320,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));await page.route('**/health',r=>r.fulfill({json:{languages:['tr','en']}}));
 await page.goto(`http://127.0.0.1:8765/?lang=tr&match=${record.match.id}`);await page.locator('#analysis').waitFor();
 await page.locator('#goals-panel summary').click();assert.equal(await page.locator('.goal-event').count(),record.shots.filter(s=>s.outcome==='Goal').length);assert.equal(await page.locator('#goal-own-note').isVisible(),true);
 await page.locator('#shot-outcome').selectOption('highxg');await page.locator('.goal-event').first().click();assert.equal(await page.locator('#shot-outcome').inputValue(),'');assert.equal(await page.locator('#pitch .selected-shot').count(),1);assert.match(await page.locator('#shot-detail').innerText(),/Gol/);
 await page.locator('#language').selectOption('en');await page.locator('#glossary summary').click();assert.match(await page.locator('#glossary').innerText(),/What is xG/);assert.match(await page.locator('#glossary').innerText(),/20%/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.goto(`http://127.0.0.1:8765/?lang=en&match=${empty.match.id}`);await page.locator('#analysis').waitFor();await page.locator('#goals-panel summary').click();assert.equal(await page.locator('#goal-events-empty').isVisible(),true);assert.equal(await page.locator('.goal-event').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS true shot-goal counts, own-goal explanation, goal-to-map detail with filters reset, EN glossary, scoreless empty state, 320px');
} finally {await browser.close();}
