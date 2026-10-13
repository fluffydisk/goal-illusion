import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const record=JSON.parse(readFileSync('web/data/analysis.json')).snapshot.matches[0];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));await page.goto(`http://127.0.0.1:8765/?lang=tr&match=${record.match.id}`);await page.locator('#analysis').waitFor();
 await page.locator('#favorite-home').click();await page.locator('#favorite-management summary').click();const promise=page.waitForEvent('download');await page.locator('#export-favorites').click();const download=await promise,content=readFileSync(await download.path(),'utf8');assert.equal(JSON.parse(content).teams.length,1);
 await page.locator('#clear-favorites').click();assert.equal(await page.locator('#favorite-home').getAttribute('aria-pressed'),'false');
 await page.locator('#import-favorites').setInputFiles({name:'favorites.json',mimeType:'application/json',buffer:Buffer.from(content)});await page.waitForFunction(()=>document.querySelector('#favorite-home').getAttribute('aria-pressed')==='true');
 await page.locator('#import-favorites').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await page.waitForFunction(()=>document.querySelector('#favorite-action-status').textContent.includes('okunamadı'));assert.equal(await page.locator('#favorite-home').getAttribute('aria-pressed'),'true');
 console.log('PASS actual favorites backup download/import, invalid file preserves existing favorites, visible error');
} finally {await browser.close();}
