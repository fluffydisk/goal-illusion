import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchMetrics} from '../web/match-metrics.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const bundle=JSON.parse(readFileSync('web/data/analysis.json')),records=bundle.snapshot.matches;
const first=records.find(d=>d.league_id===47),second=records.find(d=>d.league_id===54),sample=records.find(d=>!d.league_id);
const base='http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));await page.route('**/health',r=>r.fulfill({json:{languages:['tr','en']}}));
 await page.goto(`${base}/?lang=tr&match=${first.match.id}&compare=${second.match.id}`);await page.locator('#analysis').waitFor();
 assert.equal(await page.locator('#comparison').evaluate(e=>e.open),true);assert.equal(await page.locator('#compare-match').inputValue(),String(second.match.id));
 assert.equal(await page.locator('#comparison-table tbody tr').count(),10);
 const xg=matchMetrics(first).home.xg.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});assert.equal(await page.locator('#comparison-table tbody tr').nth(1).locator('td').first().innerText(),xg);
 await page.locator('#compare-match').selectOption(String(sample.match.id));assert.equal(await page.locator('#comparison-model-note').isVisible(),true);
 await page.locator('#compare-search').fill('no-matches-found');assert.equal(await page.locator('#comparison-empty').isVisible(),true);assert.equal(await page.locator('#comparison-table table').count(),0);assert.equal(await page.locator('#export-comparison').isDisabled(),true);
 await page.locator('#compare-search').fill('');await page.locator('#compare-match').selectOption(String(second.match.id));
 await page.locator('#language').selectOption('en');assert.match(await page.locator('#comparison-table').innerText(),/Home xG/);assert.equal(new URL(page.url()).searchParams.get('compare'),String(second.match.id));
 await page.locator('#theme').selectOption('dark');await page.locator('#comparison').screenshot({path:'/tmp/match-comparison-desktop.png'});
 await page.reload();await page.locator('#analysis').waitFor();assert.equal(await page.locator('#compare-match').inputValue(),String(second.match.id));
 await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('#comparison').screenshot({path:'/tmp/match-comparison-mobile.png'});
 const comparisonDownload=page.waitForEvent('download');await page.locator('#export-comparison').click();const comparison=await comparisonDownload;assert.equal(comparison.suggestedFilename(),`goal-illusion-compare-${first.match.id}-${second.match.id}.csv`);const comparisonText=readFileSync(await comparison.path(),'utf8');assert.equal(comparisonText.split('\r\n').length,6);assert.ok(comparisonText.includes(String(first.match.id))&&comparisonText.includes(String(second.match.id)));
 await page.locator('#data-export summary').click();await page.locator('#shot-outcome').selectOption('goals');
 for(const [id,suffix] of [['export-json','json.json'],['export-shots','shots.csv'],['export-summary','summary.csv']]) {
  const promise=page.waitForEvent('download');await page.locator(`#${id}`).click();const download=await promise;
  assert.equal(download.suggestedFilename(),`goal-illusion-${first.match.id}-${suffix}`);const content=readFileSync(await download.path(),'utf8');
  if(id==='export-json'){const data=JSON.parse(content);assert.equal(data.match.id,first.match.id);assert.equal(data.shots.length,first.shots.length);assert.equal(data.source.url,first.source_url);assert.equal(data.metrics.home.xg,matchMetrics(first).home.xg);}
  else {assert.ok(content.includes('source_url'));assert.equal(content.split('\r\n').length,id==='export-shots'?first.shots.length+2:4);}
 }
 await page.locator('#comparison summary').click();await page.waitForFunction(()=>!new URL(location.href).searchParams.has('compare'));
 assert.deepEqual(errors,[]);console.log('PASS comparison deep link/reload, calculated values, cross-source notice, search empty state, EN/dark/320px, all three actual downloads, shot filters preserve exported full data');
} finally {await browser.close();}
