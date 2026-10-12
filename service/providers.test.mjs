import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {completeWithProviders,compactFacts,retryDelay,GEMINI_MODEL} from './providers.mjs';
const schema={type:'object',properties:{approved:{type:'boolean'}},required:['approved'],additionalProperties:false};
const messages=[{role:'system',content:'Review'},{role:'user',content:'Facts'}];
const env={GEMINI_API_KEY:'gemini-secret',GROQ_API_KEY:'groq-secret'};
function storage(){const values=new Map();return {get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)};}
const gemini=()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private reasoning'},{text:'{"approved":true}'}]}}]});
test('Gemini primary uses JSON schema, low thinking and smaller independent review budget',async()=>{
 const seen=[];const request=async(url,options)=>{seen.push({url,body:JSON.parse(options.body),headers:options.headers});return gemini();};
 const store=storage();const result=await completeWithProviders(env,store,messages,schema,'story',false,request);
 await completeWithProviders(env,store,messages,schema,'review',true,request);
 assert.equal(result.provider,'gemini');assert.equal(result.model,GEMINI_MODEL);assert.deepEqual(result.value,{approved:true});
 assert.ok(seen[0].url.includes(GEMINI_MODEL));assert.ok(!seen[0].url.includes('secret'));
 assert.deepEqual(seen[0].body.generationConfig.responseJsonSchema,schema);
 assert.equal(seen[0].body.generationConfig.thinkingConfig.thinkingLevel,'low');
 assert.ok(seen[1].body.generationConfig.maxOutputTokens<seen[0].body.generationConfig.maxOutputTokens);
});
test('quota falls back once and persists provider-specific cooldown across requests',async()=>{
 const store=storage(),calls=[];
 const request=async url=>{calls.push(url);return url.includes('googleapis')?new Response('{}',{status:429,headers:{'retry-after':'3600'}}):Response.json({choices:[{finish_reason:'stop',message:{content:'{"approved":true}'}}]});};
 const result=await completeWithProviders(env,store,messages,schema,'review',true,request);
 assert.equal(result.provider,'groq');assert.equal(calls.length,2);
 await assert.rejects(completeWithProviders(env,store,messages,schema,'review',true,request),e=>e.quota&&e.retryMs>0);
 assert.equal(calls.length,2);
});
test('old Groq cooldown does not block Gemini',async()=>{
 const store=storage();await store.put('provider_cooldown',Date.now()+3600000);
 assert.equal((await completeWithProviders(env,store,messages,schema,'review',true,async()=>gemini())).provider,'gemini');
});
test('incomplete or invalid model output never bypasses quality through fallback',async()=>{
 let calls=0;
 await assert.rejects(completeWithProviders(env,storage(),messages,schema,'review',true,async()=>{calls++;return Response.json({candidates:[{finishReason:'MAX_TOKENS'}]});}),/tamamlanamadı/);
 assert.equal(calls,1);
});
test('unavailable primary can use fallback without exposing raw error body',async()=>{
 const result=await completeWithProviders(env,storage(),messages,schema,'review',true,async url=>url.includes('googleapis')?new Response('secret',{status:403}):Response.json({choices:[{finish_reason:'stop',message:{content:'{"approved":true}'}}]}));
 assert.equal(result.provider,'groq');
});
test('retry hints support seconds, HTTP dates and Gemini structured delays',()=>{
 assert.equal(retryDelay('3600',null),3600000);
 assert.equal(retryDelay(null,{error:{details:[{retryDelay:'120.5s'}]}}),120500);
 assert.equal(retryDelay(new Date(180000).toUTCString(),null,0),180000);
});
test('compact facts preserve every goal, period opportunities, aggregates and source order',()=>{
 const archive=JSON.parse(readFileSync(new URL('../web/data/stories.json',import.meta.url)));
 let before=0,after=0;
 for(const item of Object.values(archive.stories)){
  const original=item.model_facts,result=compactFacts(original);before+=JSON.stringify(original).length;after+=JSON.stringify(result).length;
  assert.deepEqual(result.sections,original.sections);assert.deepEqual(result.ev_sahibi,original.ev_sahibi);
  const ids=result.events.map(e=>e.id);
  for(const event of original.events.filter(e=>e.goal))assert.ok(ids.includes(event.id));
  assert.deepEqual(ids,original.events.filter(e=>ids.includes(e.id)).map(e=>e.id));
  assert.ok(result.evidence.every(e=>!e.id.startsWith('shot_')));
 }
 assert.ok(after<before*.8,`input reduction ${1-after/before}`);
});
