import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchKey, teamsFor, filterMatches, leagueLabel} from '../web/match-browser.mjs';
const records=[
  {match:{id:1,home_id:10,away_id:20,home:'Beşiktaş',away:'Çaykur Rizespor',date:'2026-09-10'}},
  {match:{id:2,home_id:30,away_id:10,home:'Fenerbahçe',away:'Beşiktaş',date:'2026-09-12'}},
  {league_id:99,match:{id:3,home_id:40,away_id:30,home:'Bayern München',away:'Fenerbahçe',date:'2026-09-11',competition:'New league'}}
];
test('search handles Turkish characters and German accents',()=>{
  assert.equal(searchKey(' BEŞİKTAŞ '),'besiktas');
  assert.equal(searchKey('IĞDIR München Straße'),'igdir munchen strasse');
  assert.deepEqual(filterMatches(records,{query:'besiktas'}).map(r=>r.match.id),[2,1]);
  assert.deepEqual(filterMatches(records,{query:'munchen fenerbahce'}).map(r=>r.match.id),[3]);
});
test('team filter includes home and away games and combines with search',()=>{
  assert.deepEqual(filterMatches(records,{team:'10'}).map(r=>r.match.id),[2,1]);
  assert.deepEqual(filterMatches(records,{team:'10',query:'rizespor'}).map(r=>r.match.id),[1]);
  assert.deepEqual(filterMatches(records,{query:'unknown'}),[]);
  assert.deepEqual(records.map(r=>r.match.id),[1,2,3]);
});
test('team catalogue deduplicates IDs and supports future leagues',()=>{
  assert.equal(teamsFor(records).length,4);
  assert.equal(teamsFor(records).find(t=>t.id==='10').name,'Beşiktaş');
  assert.equal(leagueLabel(records,'99'),'New league');
  assert.equal(leagueLabel(records,'71'),'Süper Lig');
});
test('venue filtering follows the selected team and ignores unrelated source identities',()=>{
 assert.deepEqual(filterMatches(records,{team:'10',venue:'home'}).map(r=>r.match.id),[1]);
 assert.deepEqual(filterMatches(records,{team:'10',venue:'away'}).map(r=>r.match.id),[2]);
 assert.equal(filterMatches(records,{venue:'home'}).length,3);
 const sourced=records.map(r=>({...r,source_name:'FotMob'}));
 assert.deepEqual(filterMatches(sourced,{team:'FotMob:10',venue:'away'}).map(r=>r.match.id),[2]);
 assert.equal(filterMatches(sourced,{team:'StatsBomb:10',venue:'home'}).length,0);
});
