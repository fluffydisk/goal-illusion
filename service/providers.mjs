import contract from './contract.json' with {type:'json'};
export const GEMINI_MODEL='gemini-3.8-flash';
export function providers(env){return [env.GEMINI_API_KEY&&{provider:'gemini',model:GEMINI_MODEL},env.GROQ_API_KEY&&{provider:'groq',model:contract.model}].filter(Boolean);}
export function retryDelay(header,body,now=Date.now()){
  const seconds=Number(header);
  const date=Date.parse(header);
  const detail=body?.error?.details?.find(d=>typeof d.retryDelay==='string')?.retryDelay;
  const hinted=detail&&/^\d+(\.\d+)?s$/.test(detail)?parseFloat(detail)*1000:0;
  return Math.max(20000,Math.min(86400000,Math.max(Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)?date-now:0,hinted)||60000));
}
export async function completeWithProviders(env,storage,messages,schema,name,review=false,request=fetch){
  const available=providers(env), waits=[];
  let lastError;
  for(const source of available){
    const {provider,model}=source,key=`cooldown:${provider}`;
    // Migrate the old global Groq cooldown without blocking the new provider.
    const until=Math.max(await storage.get(key)||0,provider==='groq'?await storage.get('provider_cooldown')||0:0);
    if(until>Date.now()){waits.push(until);continue;}
    const gemini=provider==='gemini';
    const body=gemini?{
      systemInstruction:{parts:messages.filter(m=>m.role==='system').map(m=>({text:m.content}))},
      contents:messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),
      generationConfig:{responseMimeType:'application/json',responseJsonSchema:schema,maxOutputTokens:review?2048:4096,thinkingConfig:{thinkingLevel:'low'}}
    }:{model,messages,response_format:{type:'json_schema',json_schema:{name,strict:true,schema}},reasoning_effort:'low',temperature:review?0:0.3,max_completion_tokens:review?2048:4096};
    let response;
    try{
      response=await request(gemini?`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`:'https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',headers:{'Content-Type':'application/json',...(gemini?{'x-goog-api-key':env.GEMINI_API_KEY}:{Authorization:`Bearer ${env.GROQ_API_KEY}`})},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)
      });
    }catch{lastError=new Error('AI sağlayıcısına bağlantı kurulamadı.');lastError.transient=true;continue;}
    if(!response.ok){
      // Never retain or log raw provider errors, which can contain credentials/prompts.
      if(response.status===429||response.status>=500){
        const details=await response.json().catch(()=>null);
        const retryAt=Date.now()+retryDelay(response.headers.get('retry-after'),details);
        await storage.put(key,retryAt);waits.push(retryAt);continue;
      }
      lastError=new Error(`AI sağlayıcısına ulaşılamadı (HTTP ${response.status}).`);
      // An unavailable model/key may use the configured fallback, never another paid model.
      continue;
    }
    const result=await response.json();
    const choice=gemini?result.candidates?.[0]:result.choices?.[0];
    if((gemini?choice?.finishReason:choice?.finish_reason)!==(gemini?'STOP':'stop'))throw new Error('Model yanıtı tamamlanamadı.');
    const content=gemini?choice.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join(''):choice.message?.content;
    let value;try{value=JSON.parse(content);}catch{throw new Error('Geçersiz model yanıt biçimi.');}
    // Groq's small free token-per-minute budget needs pacing between the two calls.
    if(!gemini)await storage.put(key,Date.now()+60000);
    return {value,...source};
  }
  if(waits.length){const error=new Error('AI sağlayıcısının ücretsiz kotası bekleniyor.');error.quota=true;error.retryMs=Math.max(20000,Math.min(...waits)-Date.now());throw error;}
  throw lastError||new Error('AI servisinin sunucu anahtarı henüz bağlanmadı.');
}

// Full evidence stays in the archive/UI. Models receive aggregate evidence once,
// plus all goals and the strongest recorded opportunities from each period.
export function compactFacts(modelFacts){
  const events=modelFacts.events||[],ids=new Set(modelFacts.key_event_ids||[]);
  for(const event of events)if(event.goal)ids.add(event.id);
  for(const period of new Set(events.map(e=>e.period)))for(const event of events.filter(e=>e.period===period).sort((a,b)=>b.xg-a.xg).slice(0,2))ids.add(event.id);
  const selected=events.filter(e=>ids.has(e.id));
  const {evidence_ids:unusedIds,key_event_ids:unusedKeys,...rest}=modelFacts;
  return {...rest,evidence:(modelFacts.evidence||[]).filter(e=>!e.id.startsWith('shot_')),events:selected.map(({elapsed_minutes,...e})=>e),event_scope:'Seçilmiş pozisyonlar: tüm şut golleri ve devrelerin yüksek xG fırsatları. Diğer şutlar bu listede yoktur. Olayın id alanı kanıt kimliğidir; toplu istatistikler tüm şutları kapsar.'};
}
