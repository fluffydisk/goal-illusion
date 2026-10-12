import contract from './contract.json' with {type:'json'};
import {validateProse} from './quality.mjs';
import {providers,completeWithProviders,compactFacts} from './providers.mjs';

const json=(data,status=200)=>Response.json(data,{status});
const phases={queued:'Sırada bekliyor',generating:'Maçın hikâyesi yazılıyor',reviewing:'Veriler ve yorum karşılaştırılıyor',waiting_provider:'AI sağlayıcısının sırası bekleniyor',ready:'Analiz hazır',failed:'Analiz tamamlanamadı',rate_limited:'Ücretsiz kota doldu'};
export function publicJob(job, position) {
  if (!job) return {status:'missing'};
  const {status,started_at,updated_at,narrative,fingerprint,error,retry_at,attempt,resume_status}=job;
  const issue=job.last_failure||job.feedback||'';
  const failure_code=status==='failed' ? (/tamamlanamadı/.test(issue)?'incomplete_output':/uzunluk/.test(issue)?'story_length':/cümle/.test(issue)?'sentence_count':/bölüm/.test(issue)?'section_order':/biçim/.test(issue)?'schema':/sayı/.test(issue)?'number':/iddia/.test(issue)?'unsupported_claim':/kanıt|Kanıt/.test(issue)?'evidence':/manşet/.test(issue)?'style':/HTTP/.test(issue)?'provider_http':/Anlam kontrolü/.test(issue)?'editor_rejected':'unknown') : undefined;
  return {status,failure_code,phase:status==='queued'&&position?`${position}. sırada bekliyor`:phases[status],queue_position:position,eta_reference_at:status==='queued'&&position?Date.now():updated_at,started_at,updated_at,narrative,fingerprint,error,retry_at,attempt,resume_status,
    // No fabricated percentage/countdown: estimates stay an explicit range.
    estimated_seconds: status==='waiting_provider'?[Math.max(0,Math.ceil((retry_at-updated_at)/1000)),Math.max(0,Math.ceil((retry_at-updated_at)/1000))+60]:status==='queued'?[30+Math.max(0,(position||1)-1)*90,180+Math.max(0,(position||1)-1)*180]:status==='reviewing'?[10,60]:[20,90]};
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    if (origin!==env.SITE_ORIGIN) return json({error:'Bu istek kaynağına izin verilmiyor.'},403);
    const cors={'Access-Control-Allow-Origin':env.SITE_ORIGIN,'Vary':'Origin','Cache-Control':'no-store'};
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
    if(request.method==='GET'&&new URL(request.url).pathname==='/health')return new Response(JSON.stringify({configured:providers(env).length>0,providers:providers(env),model:providers(env)[0]?.model,story_version:contract.story_version,prompt_version:contract.prompt_version}),{headers:{...cors,'Content-Type':'application/json'}});
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
      const params=new URL(request.url).searchParams;
      if (item.facts.version!==contract.story_version ||
          (params.has('story_version') && Number(params.get('story_version'))!==contract.story_version) ||
          (params.has('prompt_version') && Number(params.get('prompt_version'))!==contract.prompt_version))
        return json({error:'AI Review güncelleniyor. Sayfayı yenileyip biraz sonra tekrar dene.'},503);
      const expected=new URL(request.url).searchParams.get('fingerprint');
      if(expected && expected!==item.facts.fingerprint)
        return json({status:'data_changed',fingerprint:item.facts.fingerprint},409);
      if (item.status==='ready' && item.narrative?.fingerprint===item.facts.fingerprint && item.narrative.prompt_version===contract.prompt_version && item.narrative.story_version===contract.story_version) {
        const {headline,summary,cards}=item.narrative;
        validateProse({headline,summary,cards},item.facts,item.model_facts);
        return json({status:'ready',narrative:item.narrative,fingerprint:item.facts.fingerprint});
      }
      const key=`job:v${contract.prompt_version}:${id}:${item.facts.fingerprint}`;
      return await this.ctx.blockConcurrencyWhile(async()=>{
        let job=await this.ctx.storage.get(key);
        const waiting=await this.ctx.storage.get('queue')||[];
        const position=job?.status==='queued'?waiting.indexOf(key)+1:undefined;
        if (request.method==='GET') return json(publicJob(job,position));
        if (job && ['queued','generating','reviewing','waiting_provider','ready'].includes(job.status)) return json(publicJob(job,position),job.status==='ready'?200:202);
        if(!providers(this.env).length)return json({error:'AI servisinin sunucu anahtarı henüz bağlanmadı.'},503);
        if (job?.retry_at>Date.now()) return json(publicJob(job),429);
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
        job={draft:retainedDraft,prompt_version:contract.prompt_version,status:'queued',fingerprint:item.facts.fingerprint,facts:item.facts,model_facts:item.model_facts,started_at:now,updated_at:now,attempt:0};
        quota.count++;recent.push(now);queue.push(key);
        await this.ctx.storage.put({[key]:job,quota,[clientKey]:recent,queue});
        const alarm=await this.ctx.storage.getAlarm();
        if (alarm===null || alarm>now+100) await this.ctx.storage.setAlarm(now+100);
        return json(publicJob(job,queue.length),202);
      });
    } catch {return json({error:'Analiz servisine ulaşılamadı. Tekrar deneyebilirsin.'},503);}
  }
  async complete(messages,schema,name,review=false) {
    const result=await completeWithProviders(this.env,this.ctx.storage,messages,schema,name,review);
    this.lastCompletion={provider:result.provider,model:result.model};
    return result.value;
  }
  async schedule() {
    const keys=await this.ctx.storage.get('queue')||[];
    if(!keys.length)return;
    const jobs=await Promise.all(keys.map(key=>this.ctx.storage.get(key)));
    await this.ctx.storage.setAlarm(Math.min(...jobs.map(job=>job?.status==='waiting_provider'?Math.max(Date.now()+100,job.retry_at||0):Date.now()+100)));
  }

  async alarm() {
    const queue=await this.ctx.storage.get('queue')||[];
    const jobs=await Promise.all(queue.map(key=>this.ctx.storage.get(key)));
    const index=jobs.findIndex(job=>job?.status!=='waiting_provider'||!(job.retry_at>Date.now()));
    if(index<0){await this.schedule();return;}
    const key=queue[index]; if (!key) return;
    const job=await this.ctx.storage.get(key);
    try {
      if (!job || ['ready','failed','rate_limited'].includes(job.status)) return;
      if(job.prompt_version!==contract.prompt_version){job.status='failed';job.error='Yazım kuralları güncellendi. Yeni kurallarla yeniden analiz isteyebilirsin.';return;}
      if(job.status==='waiting_provider'){if(job.retry_at>Date.now()){await this.ctx.storage.setAlarm(job.retry_at);return;}job.status=job.resume_status;delete job.resume_status;job.updated_at=Date.now();await this.ctx.storage.put(key,job);}
      const modelInput=compactFacts(job.model_facts);
      if(job.status==='queued'&&job.draft){job.status='reviewing';job.updated_at=Date.now();await this.ctx.storage.put(key,job);}
      if (job.status==='queued' || job.status==='generating') {
        job.status='generating';job.updated_at=Date.now();await this.ctx.storage.put(key,job);
        const messages=[{role:'system',content:contract.system},{role:'user',content:JSON.stringify(modelInput)}];
        if (job.feedback) messages.push({role:'user',content:`Önceki denemenin hatasını düzelt: ${job.feedback}`});
        const draft=await this.complete(messages,contract.schema,'match_story');
        job.generation=this.lastCompletion||providers(this.env)[0];
        job.draft=validateProse(draft,job.facts,job.model_facts);job.status='waiting_provider';job.resume_status='reviewing';job.updated_at=Date.now();job.retry_at=Date.now()+100;
        await this.ctx.storage.put(key,job);
        // Separate alarm provides durable progress and avoids background-response timeouts.
        await this.schedule(); return;
      }
      const review=await this.complete([{role:'system',content:contract.review_system},{role:'user',content:JSON.stringify({facts:modelInput,prose:job.draft})}],{
        type:'object',properties:{approved:{type:'boolean'},reason:{type:'string'}},required:['approved','reason'],additionalProperties:false
      },'factual_review',true);
      if (review.approved!==true) throw new Error(`Anlam kontrolü: ${String(review.reason).slice(0,200)}`);
      job.narrative={...job.draft,fingerprint:job.fingerprint,story_version:contract.story_version,prompt_version:contract.prompt_version,...(job.generation||providers(this.env)[0]),review_provider:this.lastCompletion?.provider,review_model:this.lastCompletion?.model,generated_at:new Date().toISOString()};
      job.status='ready'; delete job.draft; delete job.feedback; delete job.retry_at; delete job.resume_status;
    } catch (error) {
      job.last_failure=String(error.message).slice(0,200);
      if(error.quota || error.transient){
        job.resume_status=job.status;job.status='waiting_provider';job.updated_at=Date.now();job.retry_at=Date.now()+Math.max(20000,error.retryMs||60000);
        await this.ctx.storage.put(key,job);await this.schedule();return;
      }
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
          if (latest.some(k=>k!==key)) await this.schedule();
        });
      }
    }
  }
}
