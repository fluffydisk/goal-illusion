import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {statisticalTitle} from '../web/story-presentation.mjs';
const matches=JSON.parse(readFileSync(new URL('../web/data/matches.json',import.meta.url))).matches;
test('heading shows the actual score and xG in home/away order',()=>{
  assert.equal(statisticalTitle(matches.find(d=>String(d.match.id)==='5904724')),'Başakşehir 1–1 Kasımpaşa · xG: 0,76–1,69');
  assert.equal(statisticalTitle(matches.find(d=>String(d.match.id)==='5904744')),'Gençlerbirliği 1–2 Kasımpaşa · xG: 1,19–1,32');
});
test('empty shot lists show zero xG, including when goals came from own goals',()=>{
  assert.equal(statisticalTitle({match:{home:'Ev',away:'Konuk',home_id:1,away_id:2},shots:[],home_score:1,away_score:0}),'Ev 1–0 Konuk · xG: 0,00–0,00');
});

import {readyStory,cardDuration} from '../web/story-presentation.mjs';
const facts={fingerprint:'f',sections:['opening','match_flow','chances','verdict','closing'],evidence:[{id:'chances'}]};
const narrative={headline:'Maçın ana çıkarımı',summary:'Maçın özeti',fingerprint:'f',story_version:2,prompt_version:9,cards:facts.sections.map(type=>({type,title:'Kart başlığı',text:'Kart metni',evidence_ids:['chances']}))};
test('only the current complete story can be opened',()=>{
 const item={status:'ready',facts,narrative};assert.equal(readyStory(item),true);
 for(const n of [{...narrative,story_version:1},{...narrative,prompt_version:8},{...narrative,fingerprint:'old'},{...narrative,cards:narrative.cards.slice(1)},{...narrative,cards:[null,...narrative.cards.slice(1)]},{...narrative,cards:narrative.cards.map(c=>({...c,evidence_ids:['unknown']}))}])assert.equal(readyStory({...item,narrative:n}),false);
});
test('story reading time scales with text and stays within 10–25 seconds',()=>{
 assert.equal(cardDuration({title:'Kısa',text:'Metin'}),10000);
 assert.equal(cardDuration({title:'Uzun',text:'kelime '.repeat(100)}),25000);
 assert.ok(cardDuration({title:'Başlık',text:'kelime '.repeat(40)})>10000);
});
