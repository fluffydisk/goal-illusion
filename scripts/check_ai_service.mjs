// Manual integration check of the Worker's actual high-effort Groq calls.
// This publishes no narrative and never changes the public analysis cache.
import {readFileSync,writeFileSync} from 'node:fs';
import {AnalysisQueue,publicJob} from '../service/worker.mjs';
const id=process.env.MATCH_ID||'5904761';
const archive=JSON.parse(readFileSync(new URL('../web/data/stories.json',import.meta.url)));
const item=archive.stories[id];
if(!item?.model_facts||!process.env.GROQ_API_KEY)throw new Error('Maç girdisi veya sunucu anahtarı eksik.');
const values=new Map();let alarmAt=0;
const storage={
  async get(key){return structuredClone(values.get(key));},
  async put(key,value){if(typeof key==='object')for(const [k,v] of Object.entries(key))values.set(k,structuredClone(v));else values.set(key,structuredClone(value));},
  async setAlarm(t){alarmAt=t;}
};
const queue=new AnalysisQueue({storage,blockConcurrencyWhile:fn=>fn()},{GROQ_API_KEY:process.env.GROQ_API_KEY});
await storage.put('queue',['integration-check']);
await storage.put('integration-check',{status:'queued',fingerprint:item.facts.fingerprint,facts:item.facts,model_facts:item.model_facts,started_at:Date.now(),updated_at:Date.now(),attempt:0});
for(let i=0;i<5;i++){
  if(alarmAt>Date.now())await new Promise(resolve=>setTimeout(resolve,alarmAt-Date.now()));
  await queue.alarm();
  const job=await storage.get('integration-check');console.log(`Stage: ${job.status}`);
  if(['failed','rate_limited'].includes(job.status))throw new Error(job.error);
  if(job.status==='ready'){
    writeFileSync('/tmp/ai-quality-check.json',JSON.stringify(publicJob(job),null,2));
    console.log(`Approved: ${job.narrative.headline}`);process.exit(0);
  }
}
throw new Error('Analiz tamamlanamadı.');
