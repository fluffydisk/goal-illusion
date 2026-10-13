import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const snapshot=JSON.parse(readFileSync('web/data/analysis.json')).snapshot,record=snapshot.matches.find(d=>d.league_id===47);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));await page.route('**/health',r=>r.fulfill({json:{languages:['tr','en']}}));
 await page.goto(`http://127.0.0.1:8765/?lang=tr&match=${record.match.id}`);await page.locator('#analysis').waitFor();
 assert.ok(!(await page.locator('#status').innerText()).includes('3 maç/kaynak'));
 await page.locator('#coverage-link').click();assert.equal(await page.locator('#data-coverage').evaluate(e=>e.open),true);
 assert.equal(await page.locator('#coverage-rows tr').count(),snapshot.coverage.length);
 for(let i=0;i<snapshot.coverage.length;i++){
  const row=page.locator('#coverage-rows tr').nth(i),entry=snapshot.coverage[i];assert.equal(await row.locator('td').nth(1).innerText(),String(entry.available));assert.equal(await row.locator('td').nth(2).innerText(),String(entry.completed));
  assert.match(await row.locator('a').getAttribute('href'),new RegExp(`/leagues/${entry.id}/`));
 }
 await page.locator('#language').selectOption('en');assert.match(await page.locator('#data-coverage').innerText(),/Verified/);assert.match(await page.locator('#data-coverage').innerText(),/Partial/);
 await page.locator('#theme').selectOption('dark');await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('PASS real league coverage counts, source links, selected-league issue scope, EN labels, dark/320px table containment');
} finally {await browser.close();}
