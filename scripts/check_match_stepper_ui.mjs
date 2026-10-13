import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}});await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));await page.route('**/health',r=>r.fulfill({json:{languages:['tr','en']}}));
 await page.goto('http://127.0.0.1:8765/?lang=tr');await page.locator('#analysis').waitFor();
 const ids=await page.locator('.match-row').evaluateAll(rows=>rows.map(r=>r.dataset.matchId));assert.equal(await page.locator('#newer-match').isDisabled(),true);
 await page.locator('#older-match').click();assert.equal(await page.locator('#match').inputValue(),ids[1]);assert.equal(await page.locator('#older-match').evaluate(e=>e===document.activeElement),true);
 await page.locator('#newer-match').click();assert.equal(await page.locator('#match').inputValue(),ids[0]);await page.goBack();assert.equal(await page.locator('#match').inputValue(),ids[1]);
 const team=await page.locator('#team option').nth(1).getAttribute('value');await page.locator('#team').selectOption(team);
 const filtered=await page.locator('.match-row').evaluateAll(rows=>rows.map(r=>r.dataset.matchId));await page.locator('.match-row').first().click();
 assert.equal(await page.locator('#newer-match').isDisabled(),true);if(filtered.length>1){await page.locator('#older-match').click();assert.equal(await page.locator('#match').inputValue(),filtered[1]);}
 await page.locator('#team-search').fill('no-match-result');assert.equal(await page.locator('#older-match').isDisabled(),true);assert.equal(await page.locator('#newer-match').isDisabled(),true);
 await page.locator('#language').selectOption('en');assert.equal(await page.locator('#older-match').innerText(),'Next in list →');await page.locator('#theme').selectOption('dark');await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('PASS list order, filter scope, limits/empty, focus, browser back, EN/dark/320px');
} finally {await browser.close();}
