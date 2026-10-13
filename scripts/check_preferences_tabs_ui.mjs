import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const record=JSON.parse(readFileSync('web/data/analysis.json')).snapshot.matches[0],url=`http://127.0.0.1:8765/?lang=tr&match=${record.match.id}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const context=await browser.newContext(),a=await context.newPage(),b=await context.newPage(),errors=[];
 for(const page of [a,b]){page.on('pageerror',e=>errors.push(e.message));await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));await page.goto(url);await page.locator('#analysis').waitFor();}
 await a.locator('#favorite-home').click();await b.waitForFunction(()=>document.querySelector('#favorite-home').getAttribute('aria-pressed')==='true');
 await b.locator('#save-match').click();await a.waitForFunction(()=>document.querySelector('#save-match').getAttribute('aria-pressed')==='true');
 await a.locator('#favorite-management summary').click();await a.locator('#clear-favorites').click();await b.waitForFunction(()=>document.querySelector('#favorite-home').getAttribute('aria-pressed')==='false');assert.equal(await a.locator('#undo-favorites').isVisible(),true);
 await a.locator('#undo-favorites').click();await b.waitForFunction(()=>document.querySelector('#favorite-home').getAttribute('aria-pressed')==='true');assert.equal(await a.locator('#save-match').getAttribute('aria-pressed'),'true');
 await a.locator('#theme').selectOption('dark');await b.waitForFunction(()=>document.documentElement.dataset.theme==='dark');assert.equal(await b.locator('#theme').inputValue(),'dark');
 assert.deepEqual(errors,[]);
 const denied=await browser.newContext(),p=await denied.newPage();await p.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError');}}));await p.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));await p.goto(url);await p.locator('#analysis').waitFor();await p.locator('#favorite-home').click();await p.locator('#favorite-management summary').click();await p.locator('#clear-favorites').click();await p.locator('#undo-favorites').click();assert.equal(await p.locator('#favorite-home').getAttribute('aria-pressed'),'true');await denied.close();
 console.log('PASS two-tab favorites and theme sync, clear/undo, preserved match favorites, blocked-storage session undo');
} finally {await browser.close();}
