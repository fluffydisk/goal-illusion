import contract from './contract.json' with {type:'json'};
import {validateProse} from './quality.mjs';

const json=(data,status=200)=>Response.json(data,{status});
const phases={queued:'Sırada bekliyor',generating:'Maça özgü yorum yazılıyor',reviewing:'Veriler ve yorum karşılaştırılıyor',waiting_provider:'AI sağlayıcısının sırası bekleniyor',ready:'Analiz hazır',failed:'Analiz tamamlanamadı',rate_limited:'Ücretsiz kota doldu'};
export function publicJob(job, position) {
  if (!job) return {status:'missing'};
  const {status,started_at,updated_at,narrative,fingerprint,error,retry_at,attempt,resume_status}=job;
  return {status,phase:status==='queued'&&position?`${position}. sırada bekliyor`:phases[status],queue_position:position,eta_reference_at:status==='queued'&&position?Date.now():updated_at,started_at,updated_at,narrative,fingerprint,error,retry_at,attempt,resume_status,
    // No fabricated percentage/countdown: estimates stay an explicit range.
    estimated_seconds: status==='waiting_provider'?[Math.max(0,Math.ceil((retry_at-updated_at)/1000)),Math.max(0,Math.ceil((retry_at-updated_at)/1000))+60]:status==='queued'?[30+Math.max(0,(position||1)-1)*90,180+Math.max(0,(position||1)-1)*180]:status==='reviewing'?[10,60]:[20,90]};
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    if (origin!==env.SITE_ORIGIN) return json({error:'Bu istek kaynağına izin verilmiyor.'},403);
    const cors={'Access-Control-Allow-Origin':env.SITE_ORIGIN,'Vary':'Origin','Cache-Control':'no-store'};
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
    if(request.method==='GET'&&new URL(request.url).pathname==='/health')return new Response(JSON.stringify({configured:Boolean(env.GROQ_API_KEY),model:contract.model}),{headers:{...cors,'Content-Type':'application/json'}});
    const url=new URL(request.url), match=url.pathname.match(/^\/analysis\/(\d{1,12})$/);
    if (!match || !['GET','POST'].includes(request.method)) return json({error:'Bulunamadı.'},404);
    // Client cannot provide prompts, arbitrary matches, model options or credentials.
    const ip=request.headers.get('CF-Connecting-IP')||'unknown';
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
    const client=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
    const id=env.ANALYSES.idFromName('shared-queue-v1');
    const response=await env.ANALYSES.get(id).fetch(new Request(`https://internal/analysis/${match[1]}${url.search}`,{method:request.method,headers:{'X-Client':client}}));
    const headers=new Headers(response.headers); for (const [key,value] of Object.entries(cors)) headers.set(key,value);
    return new Response(response.body,{status:response.status,headers});
  }
};

export class AnalysisQueue {
  constructor(ctx,env) {this.ctx=ctx;this.env=env;}
  async facts(id) {
    const url=new URL(this.env.STORIES_URL);url.searchParams.set('fresh',Date.now());
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Maç verisine ulaşılamadı.');
    const archive=await response.json(), item=archive.stories?.[id];
    if (!item?.facts?.fingerprint || !item.model_facts) return null;
    return item;
  }
  async fetch(request) {
    try {
      const id=new URL(request.url).pathname.split('/').pop(), item=await this.facts(id);
      if (!item) return json({error:'Doğrulanmış maç verisi bulunamadı.'},404);
      const expected=new URL(request.url).searchParams.get('fingerprint');
      if(expected && expected!==item.facts.fingerprint)
        return json({status:'data_changed',fingerprint:item.facts.fingerprint},409);
      if (item.status==='ready' && item.narrative?.fingerprint===item.facts.fingerprint) return json({status:'ready',narrative:item.narrative,fingerprint:item.facts.fingerprint});
      const key=`job:${id}:${item.facts.fingerprint}`;
      return await this.ctx.blockConcurrencyWhile(async()=>{
        let job=await this.ctx.storage.get(key);
        const waiting=await this.ctx.storage.get('queue')||[];
        const position=job?.status==='queued'?waiting.indexOf(key)+1:undefined;
        if (request.method==='GET') return json(publicJob(job,position));
        if (job && ['queued','generating','reviewing','waiting_provider','ready'].includes(job.status)) return json(publicJob(job,position),job.status==='ready'?200:202);
        if(!this.env.GROQ_API_KEY)return json({error:'AI servisinin sunucu anahtarı henüz bağlanmadı.'},503);
        if (job?.retry_at>Date.now()) return json(publicJob(job),429);
        const cooldown=await this.ctx.storage.get('provider_cooldown')||0;
        if(cooldown>Date.now())return json({status:'rate_limited',error:'Ücretsiz AI kotası doldu. Daha sonra yeniden dene.',retry_at:cooldown},429);
        const now=Date.now(), day=new Date(now).toISOString().slice(0,10);
        const quota=await this.ctx.storage.get('quota')||{day,count:0};
        if (quota.day!==day) {quota.day=day;quota.count=0;}
        if (quota.count>=Number(this.env.DAILY_GENERATION_LIMIT||80)) return json({status:'rate_limited',error:'Bugünün ücretsiz üretim sınırı doldu.',retry_at:Date.parse(`${day}T00:00:00Z`)+86400000},429);
        const clientKey=`client:${request.headers.get('X-Client')}`;
        const recent=(await this.ctx.storage.get(clientKey)||[]).filter(t=>now-t<600000);
        if (recent.length>=3) return json({status:'rate_limited',error:'Kısa sürede çok fazla analiz istendi. Birkaç dakika sonra yeniden dene.',retry_at:recent[0]+600000},429);
        const queue=await this.ctx.storage.get('queue')||[];
        if (queue.length>=10) return json({status:'rate_limited',error:'Analiz sırası dolu. Birkaç dakika sonra yeniden dene.',retry_at:now+60000},429);
        const retainedDraft=job?.status==='rate_limited'&&job.draft?validateProse(job.draft,item.facts,item.model_facts):undefined;
        job={draft:retainedDraft,status:'queued',fingerprint:item.facts.fingerprint,facts:item.facts,model_facts:item.model_facts,started_at:now,updated_at:now,attempt:0};
        quota.count++;recent.push(now);queue.push(key);
        await this.ctx.storage.put({[key]:job,quota,[clientKey]:recent,queue});
        if (await this.ctx.storage.getAlarm()===null) await this.ctx.storage.setAlarm(now+100);
        return json(publicJob(job,queue.length),202);
      });
    } catch {return json({error:'Analiz servisine ulaşılamadı. Tekrar deneyebilirsin.'},503);}
  }
  async complete(messages,schema,name,review=false) {
    const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{'Authorization':`Bearer ${this.env.GROQ_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:contract.model,messages,response_format:{type:'json_schema',json_schema:{name,strict:true,schema}},
        reasoning_effort:'high',temperature:review?0:0.3,max_completion_tokens:4096}),
      signal:AbortSignal.timeout(120000)
    });
    if (response.status===429) {const error=new Error('AI sağlayıcısının ücretsiz kotası doldu.');error.quota=true;const delay=Number(response.headers.get('retry-after'));error.retryMs=Number.isFinite(delay)&&delay>0?Math.max(20000,Math.min(86400000,delay*1000)):60000;throw error;}
    if (!response.ok) throw new Error('AI sağlayıcısına ulaşılamadı.');
    const choice=(await response.json()).choices?.[0];
    if (choice?.finish_reason!=='stop') throw new Error('Model yanıtı tamamlanamadı.');
    return JSON.parse(choice.message.content);
  }
  async alarm() {
    const queue=await this.ctx.storage.get('queue')||[], key=queue[0]; if (!key) return;
    const job=await this.ctx.storage.get(key);
    try {
      if (!job || ['ready','failed','rate_limited'].includes(job.status)) return;
      if(job.status==='waiting_provider'){if(job.retry_at>Date.now()){await this.ctx.storage.setAlarm(job.retry_at);return;}job.status=job.resume_status;delete job.resume_status;job.updated_at=Date.now();await this.ctx.storage.put(key,job);}
      const cooldown=await this.ctx.storage.get('provider_cooldown')||0;
      if(cooldown>Date.now()){const e=new Error('Kota');e.quota=true;e.retryMs=cooldown-Date.now();throw e;}
      if(job.status==='queued'&&job.draft){job.status='reviewing';job.updated_at=Date.now();await this.ctx.storage.put(key,job);}
      if (job.status==='queued' || job.status==='generating') {
        job.status='generating';job.updated_at=Date.now();await this.ctx.storage.put(key,job);
        const messages=[{role:'system',content:contract.system},{role:'user',content:JSON.stringify(job.model_facts)}];
        if (job.feedback) messages.push({role:'user',content:`Önceki denemenin hatasını düzelt: ${job.feedback}`});
        const draft=await this.complete(messages,contract.schema,'match_story');
        job.draft=validateProse(draft,job.facts,job.model_facts);job.status='waiting_provider';job.resume_status='reviewing';job.updated_at=Date.now();job.retry_at=Date.now()+60000;
        await this.ctx.storage.put(key,job);
        // Separate alarm provides durable progress and avoids background-response timeouts.
        await this.ctx.storage.setAlarm(job.retry_at); return;
      }
      const review=await this.complete([{role:'system',content:contract.review_system},{role:'user',content:JSON.stringify({facts:job.model_facts,prose:job.draft})}],{
        type:'object',properties:{approved:{type:'boolean'},reason:{type:'string'}},required:['approved','reason'],additionalProperties:false
      },'factual_review',true);
      if (review.approved!==true) throw new Error(`Anlam kontrolü: ${String(review.reason).slice(0,200)}`);
      job.narrative={...job.draft,fingerprint:job.fingerprint,story_version:contract.story_version,prompt_version:contract.prompt_version,provider:'groq',model:contract.model,generated_at:new Date().toISOString()};
      job.status='ready'; delete job.draft; delete job.feedback;
    } catch (error) {
      if(error.quota && error.retryMs<=120000 && (job.quota_retries||0)<2){
        job.quota_retries=(job.quota_retries||0)+1;job.resume_status=job.status;job.status='waiting_provider';job.updated_at=Date.now();job.retry_at=Date.now()+Math.max(20000,error.retryMs);
        await this.ctx.storage.put('provider_cooldown',job.retry_at);await this.ctx.storage.put(key,job);await this.ctx.storage.setAlarm(job.retry_at);return;
      }
      if (error.quota) {job.status='rate_limited';job.error='Ücretsiz AI kotası doldu. Daha sonra tekrar deneyebilirsin.';job.retry_at=Date.now()+(error.retryMs||60000);await this.ctx.storage.put('provider_cooldown',job.retry_at);}
      else if (job.attempt<1) {
        job.attempt++;job.feedback=String(error.message).slice(0,200);job.status='generating';job.updated_at=Date.now();
        await this.ctx.storage.put(key,job); await this.ctx.storage.setAlarm(Date.now()+20000);return;
      } else {job.status='failed';job.error='Yorum kalite kontrollerini geçemedi veya servis yanıt vermedi. Yeniden deneyebilirsin.';job.retry_at=Date.now()+60000;}
    } finally {
      if (!job || ['ready','failed','rate_limited'].includes(job.status)) {
        if (job) {job.updated_at=Date.now();await this.ctx.storage.put(key,job);}
        // Read queue afresh: other visitors may have appended while Groq was running.
        await this.ctx.blockConcurrencyWhile(async()=>{
          const latest=await this.ctx.storage.get('queue')||[];
          await this.ctx.storage.put('queue',latest.filter(k=>k!==key));
          if (latest.some(k=>k!==key)) await this.ctx.storage.setAlarm(Date.now()+20000);
        });
      }
    }
  }
}
