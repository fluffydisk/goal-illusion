import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const record=JSON.parse(readFileSync('web/data/analysis.json')).snapshot.matches.find(d=>d.shots.length>4);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));
 await page.goto(`http://127.0.0.1:8765/?lang=tr&match=${record.match.id}`);await page.locator('#analysis').waitFor();
 assert.equal(await page.locator('#pitch svg').getAttribute('role'),'group');
 const snapshot=await page.locator('#pitch').ariaSnapshot();assert.match(snapshot,/button/);assert.match(snapshot,/xG/);
 await page.locator('#pitch .shot').first().focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#pitch .shot').nth(1).evaluate(e=>e===document.activeElement),true);await page.keyboard.press('End');assert.equal(await page.locator('#pitch .shot').last().evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Home');assert.equal(await page.locator('#pitch .shot').first().evaluate(e=>e===document.activeElement),true);
 assert.ok((await page.locator('#shot-detail').innerText()).includes('xG'));
 assert.equal(await page.locator('#heatmap caption').count(),1);assert.equal(await page.locator('#heatmap th[scope=row]').count()>0,true);assert.equal(await page.locator('#heatmap td[aria-label]').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS shot map accessibility tree, arrow/Home/End focus, shot details, heatmap caption/header scopes/actual-score label');
} finally {await browser.close();}
