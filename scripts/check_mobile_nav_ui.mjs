import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:320,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));await page.route('**/health',r=>r.fulfill({json:{languages:['tr','en']}}));
 await page.goto('http://127.0.0.1:8765/?lang=tr');await page.locator('#analysis').waitFor();
 assert.equal(await page.locator('#match-picker').evaluate(e=>e.open),false);
 await page.locator('.mobile-nav a[href="#shot-map"]').click();assert.equal(new URL(page.url()).hash,'#shot-map');
 await page.locator('#mobile-matches').click();assert.equal(await page.locator('#match-picker').evaluate(e=>e.open),true);
 assert.equal(await page.locator('#mobile-matches').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#match-picker > summary').evaluate(e=>e===document.activeElement),true);
 await page.locator('#match-list .match-row').nth(1).click();assert.equal(await page.locator('#match-picker').evaluate(e=>e.open),false);
 await page.locator('#language').selectOption('en');await page.locator('#theme').selectOption('dark');
 assert.equal(await page.locator('#mobile-matches').innerText(),'Matches');assert.equal(await page.locator('.mobile-nav').getAttribute('aria-label'),'Mobile navigation');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('footer').scrollIntoViewIfNeeded();const footer=await page.locator('footer').boundingBox(),nav=await page.locator('.mobile-nav').boundingBox();assert.ok(footer.y+footer.height<=nav.y);
 await page.setViewportSize({width:1280,height:1000});assert.equal(await page.locator('.mobile-nav').isVisible(),false);assert.deepEqual(errors,[]);
 console.log('PASS mobile section links, picker return/focus, selection collapses, TR/EN, dark/320px, footer clear, desktop hidden');
} finally {await browser.close();}
