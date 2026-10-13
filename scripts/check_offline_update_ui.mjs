import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=mkdtempSync(join(tmpdir(),'goal-offline-')),root=join(directory,'web'),python=resolve('.venv/bin/python'),builder=resolve('scripts/build_service_worker.py');
cpSync('web',root,{recursive:true});
const types={html:'text/html',mjs:'text/javascript',js:'text/javascript',css:'text/css',json:'application/json',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png',pdf:'application/pdf'};
const server=createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));if(path.includes('..'))throw Error('bad path');res.setHeader('Content-Type',types[path.split('.').pop()]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(readFileSync(join(root,path)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
function build(){const r=spawnSync(python,[builder],{cwd:directory,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
try {
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/analysis/*',r=>r.fulfill({json:{status:'missing'}}));await page.route('**/health',r=>r.fulfill({json:{languages:['tr','en']}}));
 await page.goto(`http://127.0.0.1:${server.address().port}/?lang=en&offline=1`);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.locator('#analysis').waitFor();
 const score=await page.locator('#score').innerText(),initial=await page.evaluate(()=>caches.keys());
 writeFileSync(join(root,'style.css'),readFileSync(join(root,'style.css'),'utf8')+'\nbody{--offline-test-version:2}\n');build();
 await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
 await page.waitForFunction(()=>getComputedStyle(document.body).getPropertyValue('--offline-test-version').trim()==='2',{},{timeout:30000});await page.locator('#analysis').waitFor();assert.equal(await page.locator('#score').innerText(),score);
 const updated=await page.evaluate(()=>caches.keys());assert.equal(updated.length,1);assert.notDeepEqual(updated,initial);
 // A worker fingerprinted for a missing/corrupt asset must not replace the valid family.
 writeFileSync(join(root,'style.css'),readFileSync(join(root,'style.css'),'utf8')+'\nbody{--offline-test-version:3}\n');build();writeFileSync(join(root,'style.css'),'corrupt after fingerprint');
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();const w=r.installing;if(w)await new Promise(resolve=>{const check=()=>{if(['redundant','activated'].includes(w.state))resolve();};w.addEventListener('statechange',check);check();});});
 assert.deepEqual(await page.evaluate(()=>caches.keys()),updated);
 await context.setOffline(true);await page.reload();await page.locator('#analysis').waitFor();assert.equal(await page.locator('#score').innerText(),score);assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--offline-test-version').trim()),'2');
 assert.deepEqual(errors,[]);console.log('PASS real worker update/reload, same selected score, single generation, failed update preserves valid offline family');
} finally {await browser.close();await new Promise(r=>server.close(r));rmSync(directory,{recursive:true,force:true});}
