import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{AnalysisQueue,publicJob} from './worker.mjs';
import {validateProse} from './quality.mjs';
import {progressText} from '../web/ai-client.mjs';
const archive=JSON.parse(readFileSync(new URL('../web/data/stories.json',import.meta.url)));
const original=Object.values(archive.stories)[0];
const item={...original,status:'pending',narrative:null};
const valid=original.narrative;
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
  for(const record of Object.values(archive.stories)) if(record.narrative) validateProse({headline:record.narrative.headline,explanation:record.narrative.explanation,evidence_ids:record.narrative.evidence_ids},record.facts,record.model_facts);
});
test('invented numbers, unsupported claims and missing evidence fail',()=>{
  const prose={headline:valid.headline,explanation:valid.explanation,evidence_ids:valid.evidence_ids};
  for(const bad of [{...prose,explanation:'Bu maçta toplam xG değeri 99999.99 oldu.'},{...prose,headline:'Kaleci ve savunma galibiyeti getirdi.'},{...prose,evidence_ids:['missing','outcomes']}]) assert.throws(()=>validateProse(bad,item.facts,item.model_facts));
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
  queue.complete=async()=>{calls++;return calls===1?{headline:valid.headline,explanation:valid.explanation,evidence_ids:valid.evidence_ids}:{approved:true,reason:'Veriyle uyumlu.'};};
  await queue.alarm();assert.equal((await (await queue.fetch(request('GET'))).json()).status,'waiting_provider');
  await queue.alarm();const ready=await (await queue.fetch(request('GET'))).json();
  assert.equal(ready.status,'ready');assert.equal(ready.narrative.provider,'groq');assert.equal(ready.narrative.fingerprint,item.facts.fingerprint);
  await queue.fetch(request());assert.equal(calls,2);assert.equal((await storage.get('queue')).length,0);
});
test('rejected prose is regenerated and never cached as ready',async()=>{
  const {queue,storage,request}=setup();await queue.fetch(request());
  queue.complete=async(_,__,name)=>name==='match_story'?{headline:valid.headline,explanation:valid.explanation,evidence_ids:valid.evidence_ids}:{approved:false,reason:'Ters karşılaştırma.'};
  for(let i=0;i<4;i++)await queue.alarm();
  const result=await (await queue.fetch(request('GET'))).json();assert.equal(result.status,'failed');assert.equal(result.narrative,undefined);assert.equal((await storage.get('queue')).length,0);
});
test('fingerprint change invalidates previous generated prose',async()=>{
  const {queue,request}=setup();await queue.fetch(request());queue.facts=async()=>({...item,facts:{...item.facts,fingerprint:'changed'}});
  assert.equal((await (await queue.fetch(request('GET'))).json()).status,'missing');
});
test('quota errors expose a retry time without leaking provider errors',async()=>{
  const {queue,request}=setup();await queue.fetch(request());queue.complete=async()=>{const e=new Error('secret response');e.quota=true;throw e;};await queue.alarm();
  const result=await (await queue.fetch(request('GET'))).json();assert.equal(result.status,'rate_limited');assert.ok(result.retry_at>Date.now());assert.ok(!JSON.stringify(result).includes('secret'));
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
    return {headline:valid.headline,explanation:valid.explanation,evidence_ids:valid.evidence_ids};
  };
  await queue.alarm();
  queue.complete=async()=>({approved:true,reason:'Doğru.'});await queue.alarm();
  assert.deepEqual(await storage.get('queue'),['second-job']);assert.ok(await storage.getAlarm());
});
test('provider cooldown prevents queued jobs from consuming more provider quota',async()=>{
  const {queue,storage,request}=setup();await queue.fetch(request());await storage.put('provider_cooldown',Date.now()+3600000);
  queue.complete=async()=>{assert.fail('quota cooldown must not call provider');};await queue.alarm();
  assert.equal((await (await queue.fetch(request('GET'))).json()).status,'rate_limited');
});
test('unconfigured credentials cannot consume quota or start jobs',async()=>{
  const {queue,storage,request}=setup();delete queue.env.GROQ_API_KEY;
  assert.equal((await queue.fetch(request())).status,503);assert.equal(await storage.get('queue'),undefined);
});
test('temporary provider limits preserve the draft and resume its review',async()=>{
  const {queue,storage,request}=setup();await queue.fetch(request());let generated=0,reviewed=0;
  queue.complete=async(_,__,name)=>{
    if(name==='match_story'){generated++;return {headline:valid.headline,explanation:valid.explanation,evidence_ids:valid.evidence_ids};}
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
