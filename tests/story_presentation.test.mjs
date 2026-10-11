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
