import {LANGUAGES,message,prompts,englishModelFacts} from './language.mjs';
import contract from './contract.json' with {type:'json'};
import {validateProse} from './quality.mjs';
import {providers,completeWithProviders,compactFacts} from './providers.mjs';

const json=(data,status=200)=>Response.json(data,{status});
const phases={queued:'Sırada bekliyor',generating:'Maçın hikâyesi yazılıyor',reviewing:'Veriler ve yorum karşılaştırılıyor',waiting_provider:'AI sağlayıcısının sırası bekleniyor',ready:'Analiz hazır',failed:'Analiz tamamlanamadı',rate_limited:'Ücretsiz kota doldu'};
export function publicJob(job, position) {
  if (!job) return {status:'missing'};
  const {status,started_at,updated_at,narrative,fingerprint,error,retry_at,attempt,resume_status}=job;
  const language=job.language||'tr';
  const issue=job.last_failure||job.feedback||'';
  const failure_code=status==='failed' ? (/tamamlanamadı/.test(issue)?'incomplete_output':/uzunluk/.test(issue)?'story_length':/cümle/.test(issue)?'sentence_count':/bölüm/.test(issue)?'section_order':/biçim/.test(issue)?'schema':/sayı/.test(issue)?'number':/iddia/.test(issue)?'unsupported_claim':/kanıt|Kanıt/.test(issue)?'evidence':/manşet/.test(issue)?'style':/HTTP/.test(issue)?'provider_http':/Anlam kontrolü/.test(issue)?'editor_rejected':'unknown') : undefined;
  return {status,language,failure_code,phase:status==='queued'&&position?(language==='en'?`Queue position: ${position}`:`${position}. sırada bekliyor`):message(status==='generating'&&attempt>0?'Hikâye gözden geçiriliyor':phases[status],language),queue_position:position,eta_reference_at:status==='queued'&&position?Date.now():updated_at,started_at,updated_at,narrative,fingerprint,error:message(error,language),retry_at,attempt,resume_status,
    // No fabricated percentage/countdown: estimates stay an explicit range.
    estimated_seconds: status==='waiting_provider'?[Math.max(0,Math.ceil((retry_at-updated_at)/1000)),Math.max(0,Math.ceil((retry_at-updated_at)/1000))+60]:status==='queued'?[30+Math.max(0,(position||1)-1)*90,180+Math.max(0,(position||1)-1)*180]:status==='reviewing'?[10,60]:[20,90]};
}
export default {
  async fetch(request,env) {
    const language=new URL(request.url).searchParams.get('lang')||'tr';
    const origin=request.headers.get('Origin');
    if (origin!==env.SITE_ORIGIN) return json({error:message('Bu istek kaynağına izin verilmiyor.',language)},403);
    const cors={'Access-Control-Allow-Origin':env.SITE_ORIGIN,'Vary':'Origin','Cache-Control':'no-store'};
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
    if(request.method==='GET'&&new URL(request.url).pathname==='/health')return new Response(JSON.stringify({configured:providers(env).length>0,providers:providers(env),model:providers(env)[0]?.model,story_version:contract.story_version,prompt_version:contract.prompt_version,languages:LANGUAGES}),{headers:{...cors,'Content-Type':'application/json'}});
    const url=new URL(request.url), match=url.pathname.match(/^\/analysis\/(\d{1,12})$/);
    if (!match || !['GET','POST'].includes(request.method)) return json({error:message('Bulunamadı.',language)},404);
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
    const params=new URL(request.url).searchParams, language=params.get('lang')||'tr';
    if(!LANGUAGES.includes(language))return json({error:message('Unsupported language. Use tr or en.',language)},400);
    try {
      const id=new URL(request.url).pathname.split('/').pop(), item=await this.facts(id);
      if (!item) return json({error:message('Doğrulanmış maç verisi bulunamadı.',language)},404);
      if (item.facts.version!==contract.story_version ||
          (params.has('story_version') && Number(params.get('story_version'))!==contract.story_version) ||
          (params.has('prompt_version') && Number(params.get('prompt_version'))!==contract.prompt_version))
        return json({error:message('AI Review güncelleniyor. Sayfayı yenileyip biraz sonra tekrar dene.',language)},503);
      const expected=new URL(request.url).searchParams.get('fingerprint');
      if(expected && expected!==item.facts.fingerprint)
        return json({status:'data_changed',fingerprint:item.facts.fingerprint},409);
      const narrative=item.narratives?.[language]||(language==='tr'?item.narrative:null);
      if (item.status==='ready' && narrative && (narrative.language||'tr')===language && narrative.fingerprint===item.facts.fingerprint && narrative.prompt_version===contract.prompt_version && narrative.story_version===contract.story_version) {
        const {headline,summary,cards}=narrative;
        validateProse({headline,summary,cards},item.facts,language==='en'?englishModelFacts(item.facts):item.model_facts,language);
        return json({status:'ready',narrative,language,fingerprint:item.facts.fingerprint});
      }
      const key=`job:v${contract.prompt_version}:lang1:${language}:${id}:${item.facts.fingerprint}`;
      return await this.ctx.blockConcurrencyWhile(async()=>{
        let job=await this.ctx.storage.get(key);
        if(!job&&language==='tr') {
          // Reuse existing Turkish results and let in-flight legacy jobs finish once.
          const legacy=await this.ctx.storage.get(`job:v${contract.prompt_version}:${id}:${item.facts.fingerprint}`);
          if(legacy?.prompt_version===contract.prompt_version&&legacy.fingerprint===item.facts.fingerprint&&['queued','generating','reviewing','waiting_provider','ready'].includes(legacy.status)) {
            if(legacy.status==='ready') {
              const {headline,summary,cards}=legacy.narrative;validateProse({headline,summary,cards},item.facts,item.model_facts);
              job={...legacy,language:'tr'};await this.ctx.storage.put(key,job);
            } else return json(publicJob({...legacy,language:'tr'}),202);
          }
        }
        const waiting=await this.ctx.storage.get('queue')||[];
        const position=job?.status==='queued'?waiting.indexOf(key)+1:undefined;
        if (request.method==='GET') return json(publicJob(job,position));
        if (job && ['queued','generating','reviewing','waiting_provider','ready'].includes(job.status)) return json(publicJob(job,position),job.status==='ready'?200:202);
        if(!providers(this.env).length)return json({error:message('AI servisinin sunucu anahtarı henüz bağlanmadı.',language)},503);
        if (job?.retry_at>Date.now()) return json(publicJob(job),429);
        const now=Date.now(), day=new Date(now).toISOString().slice(0,10);
        const quota=await this.ctx.storage.get('quota')||{day,count:0};
        if (quota.day!==day) {quota.day=day;quota.count=0;}
        if (quota.count>=Number(this.env.DAILY_GENERATION_LIMIT||80)) return json({status:'rate_limited',error:message('Bugünün ücretsiz üretim sınırı doldu.',language),retry_at:Date.parse(`${day}T00:00:00Z`)+86400000},429);
        const clientKey=`client:${request.headers.get('X-Client')}`;
        const recent=(await this.ctx.storage.get(clientKey)||[]).filter(t=>now-t<600000);
        if (recent.length>=3) return json({status:'rate_limited',error:message('Kısa sürede çok fazla analiz istendi. Birkaç dakika sonra yeniden dene.',language),retry_at:recent[0]+600000},429);
        const queue=await this.ctx.storage.get('queue')||[];
        if (queue.length>=10) return json({status:'rate_limited',error:message('Analiz sırası dolu. Birkaç dakika sonra yeniden dene.',language),retry_at:now+60000},429);
        const retainedDraft=job?.status==='rate_limited'&&job.draft?validateProse(job.draft,item.facts,item.model_facts,language):undefined;
        job={language,draft:retainedDraft,prompt_version:contract.prompt_version,status:'queued',fingerprint:item.facts.fingerprint,facts:item.facts,model_facts:item.model_facts,started_at:now,updated_at:now,attempt:0};
        quota.count++;recent.push(now);queue.push(key);
        await this.ctx.storage.put({[key]:job,quota,[clientKey]:recent,queue});
        const alarm=await this.ctx.storage.getAlarm();
        if (alarm===null || alarm>now+100) await this.ctx.storage.setAlarm(now+100);
        return json(publicJob(job,queue.length),202);
      });
    } catch {return json({error:message('Analiz servisine ulaşılamadı. Tekrar deneyebilirsin.',language)},503);}
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
      if(job.prompt_version!==contract.prompt_version){job.status='failed';job.error=message('Yazım kuralları güncellendi. Yeni kurallarla yeniden analiz isteyebilirsin.',job.language||'tr');return;}
      if(job.status==='waiting_provider'){if(job.retry_at>Date.now()){await this.ctx.storage.setAlarm(job.retry_at);return;}job.status=job.resume_status;delete job.resume_status;job.updated_at=Date.now();await this.ctx.storage.put(key,job);}
      const language=job.language||'tr',policy=prompts(language);
      const modelInput=compactFacts(language==='en'?englishModelFacts(job.facts):job.model_facts);
      if(language==='en')modelInput.event_scope='Selected events: all shot goals and the strongest xG chances in each period. Other shots are omitted from this list; aggregate statistics cover all shots. Event IDs are evidence IDs.';
      if(job.status==='queued'&&job.draft){job.status='reviewing';job.updated_at=Date.now();await this.ctx.storage.put(key,job);}
      if (job.status==='queued' || job.status==='generating') {
        job.status='generating';job.updated_at=Date.now();await this.ctx.storage.put(key,job);
        const messages=[{role:'system',content:policy.system},{role:'user',content:JSON.stringify(modelInput)}];
        if (job.feedback) {
          if(job.revision)messages.push({role:'assistant',content:JSON.stringify(job.revision)});
          messages.push({role:'user',content:language==='en'?`Correct only the incorrect parts of the draft, preserving accurate events. Review feedback: ${job.feedback}. Return the complete story using the same JSON contract.`:`Taslağın yalnızca hatalı bölümlerini düzelt; doğru olayları koru. Hata: ${job.feedback}. Bütün hikâyeyi aynı JSON sözleşmesiyle döndür.`});
        }
        const draft=await this.complete(messages,contract.schema,'match_story');
        job.generation=this.lastCompletion||providers(this.env)[0];
        if(draft&&JSON.stringify(draft).length<20000)job.revision=draft;
        job.draft=validateProse(draft,job.facts,language==='en'?englishModelFacts(job.facts):job.model_facts,language);job.status='waiting_provider';job.resume_status='reviewing';job.updated_at=Date.now();job.retry_at=Date.now()+100;
        await this.ctx.storage.put(key,job);
        // Separate alarm provides durable progress and avoids background-response timeouts.
        await this.schedule(); return;
      }
      const review=await this.complete([{role:'system',content:policy.review},{role:'user',content:JSON.stringify({facts:modelInput,prose:job.draft})}],{
        type:'object',properties:{approved:{type:'boolean'},reason:{type:'string'}},required:['approved','reason'],additionalProperties:false
      },'factual_review',true);
      if (review.approved!==true) throw new Error(`Anlam kontrolü: ${String(review.reason).slice(0,200)}`);
      job.narrative={...job.draft,language,fingerprint:job.fingerprint,story_version:contract.story_version,prompt_version:contract.prompt_version,...(job.generation||providers(this.env)[0]),review_provider:this.lastCompletion?.provider,review_model:this.lastCompletion?.model,generated_at:new Date().toISOString()};
      job.status='ready'; delete job.draft; delete job.revision; delete job.feedback; delete job.retry_at; delete job.resume_status;
    } catch (error) {
      job.last_failure=String(error.message).slice(0,400);
      console.warn(JSON.stringify({event:'analysis_check',job:key,stage:job.status,attempt:job.attempt,reason:job.last_failure}));
      if(error.quota || error.transient){
        job.resume_status=job.status;job.status='waiting_provider';job.updated_at=Date.now();job.retry_at=Date.now()+Math.max(20000,error.retryMs||60000);
        await this.ctx.storage.put(key,job);await this.schedule();return;
      }
      else if (job.attempt<1) {
        job.attempt++;job.feedback=String(error.message).slice(0,400);job.status='generating';job.updated_at=Date.now();
        await this.ctx.storage.put(key,job); await this.ctx.storage.setAlarm(Date.now()+20000);return;
      } else {job.status='failed';job.error=message('Yorum kalite kontrollerini geçemedi veya servis yanıt vermedi. Yeniden deneyebilirsin.',job.language||'tr');job.retry_at=Date.now()+60000;}
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
