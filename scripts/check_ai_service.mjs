// Manual integration check of the Worker's actual high-effort Groq calls.
// This publishes no narrative and never changes the public analysis cache.
import {readFileSync,writeFileSync} from 'node:fs';
import contract from '../service/contract.json' with {type:'json'};
import {AnalysisQueue,publicJob} from '../service/worker.mjs';
const ids=(process.env.MATCH_IDS||process.env.MATCH_ID||'3869118,5904763,5904743').split(',').map(id=>id.trim());
if(ids.length>3||ids.some(id=>!/^\d+$/.test(id)))throw new Error('Bir ile üç maç kimliği gerekir.');
const archive=JSON.parse(readFileSync(new URL('../web/data/stories.json',import.meta.url)));
async function check(id){
const item=archive.stories[id];
if(!item?.model_facts||!process.env.GROQ_API_KEY)throw new Error('Maç girdisi veya sunucu anahtarı eksik.');
const values=new Map();let alarmAt=0;
const storage={
  async get(key){return structuredClone(values.get(key));},
  async put(key,value){if(typeof key==='object')for(const [k,v] of Object.entries(key))values.set(k,structuredClone(v));else values.set(key,structuredClone(value));},
  async setAlarm(t){alarmAt=t;}
};
const queue=new AnalysisQueue({storage,blockConcurrencyWhile:fn=>fn()},{GROQ_API_KEY:process.env.GROQ_API_KEY});
const complete=queue.complete.bind(queue);
queue.complete=async(...args)=>{
  const result=await complete(...args);
  writeFileSync(`/tmp/ai-quality-check-${id}-${args[2]}.json`,JSON.stringify(result,null,2));
  return result;
};
await storage.put('queue',['integration-check']);
await storage.put('integration-check',{status:'queued',prompt_version:contract.prompt_version,fingerprint:item.facts.fingerprint,facts:item.facts,model_facts:item.model_facts,started_at:Date.now(),updated_at:Date.now(),attempt:0});
for(let i=0;i<8;i++){
  if(alarmAt>Date.now())await new Promise(resolve=>setTimeout(resolve,alarmAt-Date.now()));
  await queue.alarm();
  const job=await storage.get('integration-check');console.log(`Stage: ${job.status}`);
  if(job.last_failure)console.log(`Diagnostic: ${job.last_failure}`);
  if(['failed','rate_limited'].includes(job.status)){console.log(`Provider retry time: ${job.retry_at?new Date(job.retry_at).toISOString():'unknown'}`);throw new Error(job.error);}
  if(job.status==='ready'){
    writeFileSync(`/tmp/ai-quality-check-${id}.json`,JSON.stringify(publicJob(job),null,2));
    console.log(`Approved: ${job.narrative.headline}`);return;
  }
}
throw new Error('Analiz tamamlanamadı.');

}
for(const id of ids)await check(id);
