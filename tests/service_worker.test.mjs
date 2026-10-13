import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
const template=readFileSync('scripts/service_worker.template.js','utf8');
function harness() {
 const listeners={},stores=new Map(),bodies={'index.html':'page-v1','app.mjs':'code-v1','data/analysis.json':'data-v1'};
 const assets=Object.fromEntries(Object.entries(bodies).map(([path,body])=>[path,createHash('sha256').update(body).digest('hex')]));
 let offline=false;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {async put(url,response){store.set(url,response.clone());},async match(url){return store.get(url)?.clone();}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
 const self={registration:{scope:'https://example.test/football/'},addEventListener(name,handler){listeners[name]=handler;},async skipWaiting(){},clients:{async claim(){}}};
 runInNewContext(template.replace('__VERSION__','test').replace('__ASSETS__',JSON.stringify(assets)),{self,caches,crypto:webcrypto,URL,Headers,Response,AbortController,setTimeout,clearTimeout,fetch:async request=>{if(offline)throw Error('offline');const path=new URL(typeof request==='string'?request:request.url).pathname.replace('/football/','');return new Response(bodies[path]??'missing',{status:Object.hasOwn(bodies,path)?200:404});}});
 return {bodies,stores,setOffline(value){offline=value;},async event(name){let promise;listeners[name]({waitUntil(p){promise=p;}});await promise;},request(url,{method='GET',mode='cors'}={}){let promise;listeners.fetch({request:{url,method,mode},respondWith(p){promise=p;}});return promise;}};
}
test('offline fallback uses one verified generation even when network asset versions differ',async()=>{
 const h=harness();await h.event('install');
 h.bodies['app.mjs']='code-v2';
 const response=await h.request('https://example.test/football/app.mjs?v=2');
 assert.equal(await response.text(),'code-v1');assert.equal(response.headers.get('X-Goal-Illusion-Data-Status'),'cached');
 h.setOffline(true);assert.equal(await (await h.request('https://example.test/football/?match=99',{mode:'navigate'})).text(),'page-v1');
 assert.equal(await (await h.request('https://example.test/football/data/analysis.json?fresh=1')).text(),'data-v1');
 assert.equal(h.request('https://ai.test/analysis/99'),undefined);
 assert.equal(h.request('https://example.test/football/analysis/99',{method:'POST'}),undefined);
});
test('failed installation preserves the previous cache; activation only removes app generations',async()=>{
 const h=harness();h.stores.set('goal-illusion-old',new Map());h.stores.set('other-app',new Map());
 h.bodies['app.mjs']='wrong';await assert.rejects(h.event('install'),/mismatch/);
 assert.equal(h.stores.has('goal-illusion-old'),true);assert.equal(h.stores.has('goal-illusion-test'),false);
 h.bodies['app.mjs']='code-v1';await h.event('install');await h.event('activate');
 assert.equal(h.stores.has('goal-illusion-old'),false);assert.equal(h.stores.has('other-app'),true);assert.equal(h.stores.has('goal-illusion-test'),true);
});
