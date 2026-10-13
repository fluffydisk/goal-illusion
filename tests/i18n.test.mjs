import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {t,setLanguage,locale} from '../web/i18n.mjs';
import {evidenceFor} from '../web/evidence.mjs';
import {readyStory} from '../web/story-presentation.mjs';
import {analysisRequest,progressText} from '../web/ai-client.mjs';
const bundle=JSON.parse(readFileSync(new URL('../web/data/analysis.json',import.meta.url)));
test('locale selection translates templates and preserves names',()=>{
 try {setLanguage('en');assert.equal(locale(),'en-GB');assert.equal(t`Geçen süre: ${10} sn`,'Elapsed: 10 s');assert.equal(t('Fenerbahçe'),'Fenerbahçe');assert.match(progressText({status:'waiting_provider',started_at:0,retry_at:180000},60000).remaining,/2 min/);assert.throws(()=>setLanguage('de'));
 } finally {setLanguage('tr');}
 assert.equal(t('Şut haritası'),'Şut haritası');
});
test('English evidence preserves every ID, shot event and fixed goal contribution',()=>{
 for(const item of Object.values(bundle.stories)){
  const before=JSON.stringify(item.facts),en=evidenceFor(item.facts,'en');
  assert.deepEqual(en.map(e=>e.id),item.facts.evidence.map(e=>e.id));
  assert.equal(JSON.stringify(item.facts),before);
  const fixed=en.find(e=>e.id==='own_goals');if(fixed)assert.match(fixed.text,/fixed goals/);
  for(const e of en)assert.ok(e.label&&e.text);
 }
 const facts=Object.values(bundle.stories)[0].facts;
 const narrative={language:'en',headline:'Headline',summary:'Summary',fingerprint:facts.fingerprint,story_version:2,prompt_version:9,cards:facts.sections.map(type=>({type,title:'Title',text:'Text',evidence_ids:['chances']}))};
 assert.equal(readyStory({status:'ready',facts,narrative},'en'),true);
 assert.equal(readyStory({status:'ready',facts,narrative},'tr'),false);
 assert.equal(readyStory({status:'ready',facts,narrative:{...narrative,language:undefined}},'en'),false);
});
test('English requests never start a Turkish job on an old server',async()=>{
 const original=globalThis.fetch;let requests=[];
 try {
  setLanguage('en');globalThis.fetch=async url=>{requests.push(url);return Response.json({prompt_version:9});};
  await assert.rejects(analysisRequest('https://old.example',1,'POST'),/not enabled/);
  assert.equal(requests.length,1);assert.match(requests[0],/health$/);
  globalThis.fetch=async url=>{requests.push(url);return Response.json(url.endsWith('/health')?{languages:['tr','en']}:{status:'missing',language:'en'});};
  assert.equal((await analysisRequest('https://new.example',1,'GET',undefined,'fp')).language,'en');
  assert.match(requests.at(-1),/lang=en/);
 } finally {globalThis.fetch=original;setLanguage('tr');}
});
