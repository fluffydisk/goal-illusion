import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{AnalysisQueue,publicJob} from './worker.mjs';
import {validateProse} from './quality.mjs';
import {progressText} from '../web/ai-client.mjs';
import contract from './contract.json' with {type:'json'};
const archive=JSON.parse(readFileSync(new URL('../web/data/stories.json',import.meta.url)));
const original=Object.values(archive.stories)[0];
const item={...original,status:'pending',narrative:null};
const valid={headline:'Yakın fırsat dağılımına rağmen farklı bir skor',summary:'İki takımın toplam gol beklentileri birbirine yakın kaldı.',
 cards:item.facts.sections.map(type=>({type,title:'Maçın fırsat dağılımı',text:'İki takımın toplam gol beklentileri birbirine yakın kaldı. Gerçek skor ise aynı şutlarla oluşabilecek sonuçlardan yalnızca biri.',evidence_ids:['chances','outcomes']}))};
test('mismatched client version is rejected before quota or queue changes',async()=>{
  const {queue,storage}=setup();
  const response=await queue.fetch(new Request('https://internal/analysis/1?fingerprint=old',{method:'POST'}));
  assert.equal(response.status,409);assert.equal((await response.json()).status,'data_changed');
  assert.equal(await storage.get('quota'),undefined);assert.equal(await storage.get('queue'),undefined);
});
test('old writing policy cannot reuse static prose or generated cache',async()=>{
  const {queue,storage,request}=setup();
  const old={...valid,prompt_version:contract.prompt_version-1};
  queue.facts=async()=>({...item,status:'ready',narrative:old});
  await storage.put(`job:1:${item.facts.fingerprint}`,{status:'ready',narrative:old});
  assert.equal((await (await queue.fetch(request('GET'))).json()).status,'missing');
  assert.equal(await storage.get('quota'),undefined);
});
test('queued drafts from an old writing policy stop without provider calls',async()=>{
  const {queue,storage}=setup();
  await storage.put('queue',['legacy']);
  await storage.put('legacy',{status:'queued',prompt_version:contract.prompt_version-1});
  queue.complete=()=>assert.fail('Obsolete draft must not use the provider');
  await queue.alarm();
  assert.equal((await storage.get('legacy')).status,'failed');
  assert.deepEqual(await storage.get('queue'),[]);
});
test('headline metaphors fail the style gate before independent review',()=>{
  assert.throws(()=>validateProse({headline:'Kasımpaşa galibiyeti dengenin içinden geliyor.',summary:valid.summary,cards:valid.cards},item.facts,item.model_facts),/manşet/);
});
class Storage {
  values=new Map(); alarm=null;
  async get(key){return structuredClone(this.values.get(key));}
  async put(key,value){if(typeof key==='object'){for(const [k,v] of Object.entries(key))this.values.set(k,structuredClone(v));}else this.values.set(key,structuredClone(value));}
  async getAlarm(){return this.alarm;}
  async setAlarm(t){this.alarm=t;}
}
function setup() {
  const storage=new Storage();let serial=Promise.resolve();
  const ctx={storage,blockConcurrencyWhile(fn){const next=serial.then(fn);serial=next.catch(()=>{});return next;}};
  const queue=new AnalysisQueue(ctx,{DAILY_GENERATION_LIMIT:80,GROQ_API_KEY:"test-placeholder"});queue.facts=async()=>item;
  const actualAlarm=queue.alarm.bind(queue);queue.alarm=async()=>{const keys=await storage.get('queue')||[];const job=await storage.get(keys[0]);if(job?.status==='waiting_provider'){job.retry_at=Date.now()-1;await storage.put('provider_cooldown',0);await storage.put(keys[0],job);}await actualAlarm();};
  const request=(method='POST')=>new Request('https://internal/analysis/1',{method,headers:{'X-Client':'test'}});
  return {storage,queue,request};
}
test('all archive prose passes the shared quality gate',()=>{
  for(const record of Object.values(archive.stories)) if(record.narrative) validateProse({headline:record.narrative.headline,summary:record.narrative.summary,cards:record.narrative.cards},record.facts,record.model_facts);
});
test('invented numbers, unsupported claims and missing evidence fail',()=>{
  const prose={headline:valid.headline,summary:valid.summary,cards:valid.cards};
  for(const bad of [{...prose,summary:'Bu maçta toplam xG değeri 99999.99 oldu.'},{...prose,headline:'Kaleci ve savunma galibiyeti getirdi.'},{...prose,cards:[{...valid.cards[0],evidence_ids:['missing','outcomes']},...valid.cards.slice(1)]}]) assert.throws(()=>validateProse(bad,item.facts,item.model_facts));
});
test('simultaneous visitors enqueue one job and GET never generates',async()=>{
  const {queue,storage,request}=setup();
  assert.equal((await (await queue.fetch(request('GET'))).json()).status,'missing');
  assert.equal(await storage.get('queue'),undefined);
  const responses=await Promise.all([queue.fetch(request()),queue.fetch(request())]);
  assert.ok(responses.every(r=>r.status===202));assert.equal((await storage.get('queue')).length,1);assert.equal((await storage.get('quota')).count,1);
});
test('generation requires an independent approval; result is shared and reusable',async()=>{
  const {queue,storage,request}=setup();await queue.fetch(request());let calls=0;
  queue.complete=async()=>{calls++;return calls===1?{headline:valid.headline,summary:valid.summary,cards:valid.cards}:{approved:true,reason:'Veriyle uyumlu.'};};
  await queue.alarm();assert.equal((await (await queue.fetch(request('GET'))).json()).status,'waiting_provider');
  await queue.alarm();const ready=await (await queue.fetch(request('GET'))).json();
  assert.equal(ready.status,'ready');assert.equal(ready.narrative.provider,'groq');assert.equal(ready.narrative.fingerprint,item.facts.fingerprint);
  await queue.fetch(request());assert.equal(calls,2);assert.equal((await storage.get('queue')).length,0);
});
test('rejected prose is regenerated and never cached as ready',async()=>{
  const {queue,storage,request}=setup();await queue.fetch(request());
  queue.complete=async(_,__,name)=>name==='match_story'?{headline:valid.headline,summary:valid.summary,cards:valid.cards}:{approved:false,reason:'Ters karşılaştırma.'};
  for(let i=0;i<4;i++)await queue.alarm();
  const result=await (await queue.fetch(request('GET'))).json();assert.equal(result.status,'failed');assert.equal(result.narrative,undefined);assert.equal((await storage.get('queue')).length,0);
});
test('fingerprint change invalidates previous generated prose',async()=>{
  const {queue,request}=setup();await queue.fetch(request());queue.facts=async()=>({...item,facts:{...item.facts,fingerprint:'changed'}});
  assert.equal((await (await queue.fetch(request('GET'))).json()).status,'missing');
});
test('quota errors expose a retry time without leaking provider errors',async()=>{
  const {queue,request}=setup();await queue.fetch(request());queue.complete=async()=>{const e=new Error('secret response');e.quota=true;throw e;};await queue.alarm();
  const result=await (await queue.fetch(request('GET'))).json();assert.equal(result.status,'waiting_provider');assert.ok(result.retry_at>Date.now());assert.ok(!JSON.stringify(result).includes('secret'));
});
test('widget gives estimates and elapsed time without fake completion percentages',()=>{
  const job={status:'generating',started_at:1000,estimated_seconds:[20,90]};
  assert.equal(progressText(job,11000).elapsed,'Geçen süre: 10 sn');
  assert.match(progressText(job,100000).remaining,/beklenenden uzun/);
  assert.equal(publicJob({...job,facts:{secret:'not public'},draft:{}}).facts,undefined);
});
test('queue preserves a second visitor added during model generation',async()=>{
  const {queue,storage,request}=setup();await queue.fetch(request());
  queue.complete=async()=>{
    const waiting=await storage.get('queue');await storage.put('queue',[...waiting,'second-job']);
    return {headline:valid.headline,summary:valid.summary,cards:valid.cards};
  };
  await queue.alarm();
  queue.complete=async()=>({approved:true,reason:'Doğru.'});await queue.alarm();
  assert.deepEqual(await storage.get('queue'),['second-job']);assert.ok(await storage.getAlarm());
});
test('provider cooldown prevents queued jobs from consuming more provider quota',async()=>{
  const {queue,storage,request}=setup();await queue.fetch(request());await storage.put('provider_cooldown',Date.now()+3600000);
  await queue.alarm();
  assert.equal((await (await queue.fetch(request('GET'))).json()).status,'waiting_provider');
});
test('unconfigured credentials cannot consume quota or start jobs',async()=>{
  const {queue,storage,request}=setup();delete queue.env.GROQ_API_KEY;
  assert.equal((await queue.fetch(request())).status,503);assert.equal(await storage.get('queue'),undefined);
});
test('temporary provider limits preserve the draft and resume its review',async()=>{
  const {queue,storage,request}=setup();await queue.fetch(request());let generated=0,reviewed=0;
  queue.complete=async(_,__,name)=>{
    if(name==='match_story'){generated++;return {headline:valid.headline,summary:valid.summary,cards:valid.cards};}
    reviewed++;if(reviewed===1){const e=new Error('Temporary quota');e.quota=true;e.retryMs=30000;throw e;}return {approved:true,reason:'Doğru.'};
  };
  await queue.alarm();await queue.alarm();
  assert.equal((await (await queue.fetch(request('GET'))).json()).status,'waiting_provider');
  await queue.alarm();assert.equal((await (await queue.fetch(request('GET'))).json()).status,'ready');
  assert.equal(generated,1);assert.equal(reviewed,2);assert.equal((await storage.get('queue')).length,0);
});
test('health reveals only configuration state and rejects other origins',async()=>{
  const env={SITE_ORIGIN:'https://fluffydisk.github.io',GROQ_API_KEY:'test-secret'};
  const response=await worker.fetch(new Request('https://worker/health',{headers:{Origin:env.SITE_ORIGIN}}),env);
  const data=await response.json();assert.equal(data.configured,true);assert.ok(!JSON.stringify(data).includes('test-secret'));
  assert.equal((await worker.fetch(new Request('https://worker/health',{headers:{Origin:'https://other.example'}}),env)).status,403);
});
test('queued visitors see their actual position and a longer estimate',async()=>{
  const {queue,request}=setup();await queue.fetch(request());
  const response=await queue.fetch(new Request('https://internal/analysis/2',{method:'POST',headers:{'X-Client':'another'}}));
  const job=await response.json();assert.equal(job.queue_position,2);assert.equal(job.estimated_seconds[0],120);assert.match(job.phase,/2\./);
});
test('long quota waits automatically resume without another POST or quota charge',async()=>{
  const {queue,storage,request}=setup();await queue.fetch(request());let generated=0,reviewed=0;
  queue.complete=async(_,__,name)=>{
    if(name==='match_story'){generated++;return {headline:valid.headline,summary:valid.summary,cards:valid.cards};}
    if(++reviewed===1){const e=new Error('Long quota');e.quota=true;e.retryMs=3600000;throw e;}return {approved:true,reason:'Doğru.'};
  };
  await queue.alarm();await queue.alarm();const key=[...storage.values.keys()].find(k=>k.startsWith('job:'));
  const job=await storage.get(key);assert.equal(job.status,'waiting_provider');assert.ok(job.draft);
  job.retry_at=0;await storage.put(key,job);await storage.put('provider_cooldown',0);
  await queue.alarm();
  assert.equal((await (await queue.fetch(request('GET'))).json()).status,'ready');assert.equal(generated,1);assert.equal((await storage.get('quota')).count,1);
});

test('new service refuses old evidence without charging quota',async()=>{
 const {queue,storage,request}=setup();queue.facts=async()=>({...item,facts:{...item.facts,version:1}});
 assert.equal((await queue.fetch(request())).status,503);assert.equal(await storage.get('quota'),undefined);
});
test('client contract mismatch cannot start generation',async()=>{
 const {queue,storage}=setup();
 assert.equal((await queue.fetch(new Request('https://internal/analysis/1?story_version=1',{method:'POST'}))).status,503);
 assert.equal(await storage.get('quota'),undefined);
});
for(const reason of ['Oyuncu yanlış takımla eşleştirilmiş.','Gol dakikası yanlış.','İkinci yarı olayı ilk yarıda anlatılmış.'])test(`editor rejection prevents publication: ${reason}`,async()=>{
 const {queue,request}=setup();await queue.fetch(request());
 queue.complete=async(_,__,name)=>name==='match_story'?valid:{approved:false,reason};
 for(let i=0;i<4;i++)await queue.alarm();
 const result=await(await queue.fetch(request('GET'))).json();assert.equal(result.status,'failed');assert.equal(result.narrative,undefined);
});
test('every story card is checked, including late unsupported claims',()=>{
 const value=structuredClone(valid);value.cards.at(-1).text='Kaleci ve savunma galibiyeti getirdi. Bu maçın sonucunu kesinlikle bu performans belirledi.';
 assert.throws(()=>validateProse(value,item.facts,item.model_facts));
 const wrong=structuredClone(valid);wrong.cards.reverse();assert.throws(()=>validateProse(wrong,item.facts,item.model_facts));
});
test('a long waiting job does not block a new eligible match',async()=>{
 const {queue,storage,request}=setup();await queue.fetch(request());
 const first=(await storage.get('queue'))[0],job=await storage.get(first);
 job.status='waiting_provider';job.resume_status='generating';job.retry_at=Date.now()+3600000;
 await storage.put(first,job);await storage.setAlarm(job.retry_at);
 await queue.fetch(new Request('https://internal/analysis/2',{method:'POST',headers:{'X-Client':'another'}}));
 assert.ok((await storage.getAlarm())<job.retry_at);
 queue.complete=async()=>valid;
 // Bypass the test helper that expires the first job's timer.
 await AnalysisQueue.prototype.alarm.call(queue);
 const keys=await storage.get('queue');assert.equal((await storage.get(first)).retry_at,job.retry_at);
 assert.ok((await storage.get(keys[1])).draft);
});
test('review connection failure preserves generation and provider provenance',async()=>{
 const {queue,storage,request}=setup();await queue.fetch(request());let generated=0,reviewed=0;
 queue.complete=async(_,__,name)=>{
  if(name==='match_story'){generated++;queue.lastCompletion={provider:'gemini',model:'test-gemini'};return valid;}
  if(++reviewed===1){const e=new Error('Network');e.transient=true;throw e;}
  queue.lastCompletion={provider:'groq',model:'test-groq'};return {approved:true,reason:'Uyumlu.'};
 };
 await queue.alarm();await queue.alarm();await queue.alarm();
 const result=await(await queue.fetch(request('GET'))).json();
 assert.equal(result.status,'ready');assert.equal(generated,1);assert.equal(result.narrative.provider,'gemini');assert.equal(result.narrative.review_provider,'groq');
 assert.equal((await storage.get('quota')).count,1);
});
test('Turkish ordinal minutes are not extra sentences',()=>{
 const value=structuredClone(valid);
 value.cards[0].text='1. dakikadaki fırsat ile 2. dakikadaki fırsat birbirinden ayrı pozisyonlardı. İki takımın toplam gol beklentileri birbirine yakın kaldı. Gerçek skor ise aynı şutlarla oluşabilecek sonuçlardan yalnızca biri.';
 assert.doesNotThrow(()=>validateProse(value,item.facts,item.model_facts));
 value.cards[0].text='İki takımın toplam gol beklentileri birbirine yakın kaldı. Gerçek skor ayrı bir sonuçtu. İlk fırsat ayrıydı. İkinci fırsat ayrıydı. Son fırsat ayrıydı.';
 assert.throws(()=>validateProse(value,item.facts,item.model_facts),/cümle/);
});
