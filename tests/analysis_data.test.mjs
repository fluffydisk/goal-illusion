import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consistentAnalysis,loadAnalysisBundle} from '../web/analysis-data.mjs';
const data=fp=>({record:{match:{id:1}},item:{facts:{fingerprint:fp}}});
test('matching data returns immediately without refresh',async()=>{
  const answer=await consistentAnalysis(data('a'),async()=>({status:'ready',fingerprint:'a'}),()=>assert.fail());
  assert.equal(answer.result.status,'ready');
});
test('corrected match reloads once and retries with the new fingerprint',async()=>{
  const fingerprints=[];let loads=0;
  const answer=await consistentAnalysis(data('old'),async d=>{
    fingerprints.push(d.item.facts.fingerprint);
    return {status:d.item.facts.fingerprint==='old'?'data_changed':'queued',fingerprint:'new'};
  },async()=>{loads++;return data('new');});
  assert.deepEqual(fingerprints,['old','new']);assert.equal(loads,1);assert.equal(answer.result.status,'queued');
});
test('old server ready response cannot attach prose to updated shots',async()=>{
  let calls=0,loads=0;
  await assert.rejects(consistentAnalysis(data('new'),async()=>{calls++;return {status:'ready',fingerprint:'old'};},async()=>{loads++;return data('new');}),/güncelleniyor/);
  assert.equal(calls,2);assert.equal(loads,1);
});
test('missing local evidence never accepts unrelated remote prose',async()=>{
  await assert.rejects(consistentAnalysis({item:null},()=>assert.fail(),()=>assert.fail()),/doğrulanmış/);
});
test('navigation abort propagates without a second analysis request',async()=>{
  let requests=0;
  await assert.rejects(consistentAnalysis(data('old'),async()=>{requests++;return {fingerprint:'new'};},async()=>{throw new DOMException('Navigation','AbortError');}),{name:'AbortError'});
  assert.equal(requests,1);
});
test('bundle bypasses cache and rejects mismatched snapshots',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{
      assert.match(url,/analysis.json\?fresh=/);assert.equal(options.cache,'no-store');
      return Response.json({snapshot:{matches:[],updated_at:'new'},source_updated_at:'old'});
    };
    await assert.rejects(loadAnalysisBundle(),/veri paketi/);
    globalThis.fetch=async()=>Response.json({snapshot:{matches:[],updated_at:'new'},source_updated_at:'new'});
    assert.equal((await loadAnalysisBundle()).source_updated_at,'new');
  } finally {globalThis.fetch=original;}
});
