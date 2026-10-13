import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const records=JSON.parse(readFileSync('web/data/analysis.json')).snapshot.matches,record=records.find(d=>d.league_id===47);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));
 await page.goto(`http://127.0.0.1:8765/?lang=tr&match=${record.match.id}`);await page.locator('#analysis').waitFor();
 await page.locator('.match-row').first().focus();await page.keyboard.press('ArrowDown');assert.equal(await page.locator('.match-row').nth(1).evaluate(e=>e===document.activeElement),true);
 const otherId=await page.locator('.match-row').nth(1).getAttribute('data-match-id');await page.keyboard.press('Enter');assert.equal(new URL(page.url()).searchParams.get('match'),otherId);
 await page.goBack();await page.waitForFunction(id=>new URL(location.href).searchParams.get('match')===id,String(record.match.id));assert.equal(await page.locator('#home').innerText(),record.match.home);
 await page.goForward();await page.waitForFunction(id=>new URL(location.href).searchParams.get('match')===id,otherId);
 await page.locator('#league').selectOption('54');assert.equal(await page.locator('#league').inputValue(),'54');
 await page.goBack();await page.waitForFunction(()=>document.querySelector('#league').value==='47');assert.equal(new URL(page.url()).searchParams.get('match'),otherId);
 await page.locator('.match-row').first().focus();await page.keyboard.press('End');assert.equal(await page.locator('.match-row').last().evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Home');assert.equal(await page.locator('.match-row').first().evaluate(e=>e===document.activeElement),true);
 await page.goto('http://127.0.0.1:8765/?lang=tr&match=999999999');await page.locator('#analysis').waitFor();assert.equal(await page.locator('#route-notice').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('PASS keyboard list navigation, match back/forward, cross-league restoration, document title and invalid-link notice');
} finally {await browser.close();}
