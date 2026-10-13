// Local checks: intercept AI requests to avoid starting any real generation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const bundle=JSON.parse(readFileSync('web/data/analysis.json'));
const records=bundle.snapshot.matches;
const record=records.find(d=>d.league_id===71)||records[0];
const base=process.env.STORY_BASE_URL||'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/analysis/*',route=>route.fulfill({json:{status:'missing'}}));
 await page.goto(`${base}/?lang=tr&match=${record.match.id}`);
 await page.locator('#analysis').waitFor({state:'visible'});
 assert.equal(await page.locator('#home').innerText(),record.match.home);
 assert.equal(await page.locator('.match-row[aria-current="true"]').count(),1);
 const leagueRows=await page.locator('.match-row').count();
 const team=String(record.match.home_id);
 await page.locator('#team').selectOption(`${record.source_name}:${team}`);
 const expected=records.filter(d=>String(d.league_id||'example')===String(record.league_id||'example')&&(String(d.match.home_id)===team||String(d.match.away_id)===team));
 assert.equal(await page.locator('.match-row').count(),expected.length);
 await page.locator('#team-search').fill('no-such-team');
 assert.equal(await page.locator('.match-row').count(),0);
 assert.equal(await page.locator('#no-matches').isVisible(),true);
 assert.equal(await page.locator('#home').innerText(),record.match.home);
 await page.locator('#clear-search').click();
 assert.equal(await page.locator('.match-row').count(),leagueRows);
 assert.equal(await page.locator('#team-search').evaluate(e=>e===document.activeElement),true);
 const target=await page.locator('.match-row').last().getAttribute('data-match-id');
 await page.locator('.match-row').last().click();
 assert.equal(new URL(page.url()).searchParams.get('match'),target);
 assert.equal(await page.locator('.match-row[aria-current="true"]').getAttribute('data-match-id'),target);
 await page.locator('#league').selectOption('54');
 assert.equal(await page.locator('#team-search').inputValue(),'');
 assert.equal(await page.locator('#team').inputValue(),'');
 assert.equal(await page.locator('.match-row[aria-current="true"]').count(),1);
 await page.locator('#league').blur();
 await page.screenshot({path:'/tmp/goal-illusion-desktop.png',fullPage:true});
 await page.locator('.match-row').nth(1).focus();
 await page.keyboard.press('Enter');
 assert.equal(await page.locator('.match-row[aria-current="true"]').getAttribute('data-match-id'),await page.locator('.match-row').nth(1).getAttribute('data-match-id'));
 for(const width of [390,320]) {
  await page.setViewportSize({width,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Page overflow at ${width}`);
  await page.screenshot({path:`/tmp/goal-illusion-mobile-${width}.png`,fullPage:true});
 }
 await page.locator('#match-picker>summary').click();
 await page.locator('.match-row').first().click();
 assert.equal(await page.locator('#match-picker').evaluate(e=>e.open),false);
 assert.equal(await page.locator('#match-picker>summary').evaluate(e=>e===document.activeElement),true);
 await page.locator('#match-picker>summary').click();
 await page.locator('#league').selectOption('example');
 assert.equal(await page.locator('.match-row').count(),records.filter(d=>!d.league_id).length);
 assert.deepEqual(errors,[]);
 console.log('PASS direct match links, team home/away filter, search empty state/reset, selection, league change, 1440/390/320px layouts');
} finally {await browser.close();}
