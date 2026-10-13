// Manual acceptance check against the deployed site. This never sends an AI POST.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=(process.env.MVP_SITE_URL||'https://fluffydisk.github.io/goal-illusion/').replace(/\/?$/,'/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[];let posts=0;
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/analysis/'))posts++;});
 await page.goto(`${base}?lang=tr&match=3869118`);await page.locator('#analysis').waitFor();
 assert.equal(await page.locator('h1').innerText(),'Maç analizi');
 for(const id of ['71','54','47','87','55','53'])assert.equal(await page.locator(`#league option[value="${id}"]`).count(),1);
 const health=await page.evaluate(async()=>{const config=await (await fetch('data/site.json')).json();return (await fetch(`${config.ai_endpoint}/health`)).json();});assert.deepEqual(health.languages,['tr','en']);assert.equal(health.configured,true);
 await page.locator('#compare-link').click();assert.ok(await page.locator('#comparison-table tbody tr').count());
 const downloadReady=page.waitForEvent('download');await page.locator('#export-comparison').click();const comparison=await downloadReady;assert.equal(readFileSync(await comparison.path(),'utf8').split('\r\n').length,6);
 await page.locator('#save-match').click();assert.equal(await page.locator('#save-match').getAttribute('aria-pressed'),'true');
 await page.locator('#language').selectOption('en');await page.locator('#theme').selectOption('dark');await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#offline-help').evaluate(e=>{e.open=true;});await page.waitForFunction(()=>document.querySelector('#pwa-status').textContent.includes('available offline'),{},{timeout:60000});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const score=await page.locator('#score').innerText();await context.setOffline(true);await page.reload();await page.locator('#analysis').waitFor();assert.equal(await page.locator('#score').innerText(),score);assert.equal(await page.locator('#language').inputValue(),'en');assert.equal(await page.locator('#save-match').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#generate-ai').isDisabled(),true);assert.equal(await page.locator('#network-note').isVisible(),true);
 await page.locator('#data-export').evaluate(e=>{e.open=true;});const jsonReady=page.waitForEvent('download');await page.locator('#export-json').click();const data=JSON.parse(readFileSync(await (await jsonReady).path(),'utf8'));assert.equal(data.match.id,3869118);assert.ok(data.shots.length>0);
 await context.setOffline(false);await page.reload();await page.locator('#analysis').waitFor();assert.equal(await page.locator('#network-note').isVisible(),false);await page.locator('#open-story').waitFor({state:'visible',timeout:15000});await page.locator('#open-story').click();assert.equal(await page.getByRole('button',{name:'Close ×',exact:true}).count(),1);assert.equal(await page.locator('.story-segments button').count(),6);await page.keyboard.press('Escape');assert.deepEqual(errors,[]);assert.equal(posts,0);
 console.log('PASS live six leagues, Worker language/CORS, comparison CSV, TR/EN, dark/320px, persisted favourite, verified PWA install, offline reload/JSON export, online recovery and approved English reader; no AI generation POST');
} finally {await browser.close();}
