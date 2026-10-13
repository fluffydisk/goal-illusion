import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTeam} from '../web/team-summary.mjs';
function record(id,date,home,away,hs,as,shots,source='FotMob') {return {source_name:source,match:{id,date,home_id:home,away_id:away,home:`Team ${home}`,away:`Team ${away}`},home_score:hs,away_score:as,shots};}
const records=[
 record(1,'2026-10-01',10,20,1,0,[{team_id:10,xg:.3},{team_id:20,xg:.4}]),
 record(2,'2026-10-02',20,10,2,1,[{team_id:20,xg:1.2},{team_id:10,xg:.5}]),
 record(3,'2026-10-03',10,20,0,0,[]),
 // An own-goal contribution affects score totals, but has no invented shot/xG.
 record(4,'2026-10-04',10,20,1,0,[]),
 record(1,'2026-10-05',10,20,9,0,[],'StatsBomb'),
];
test('home/away form and averages use recorded shots, with own goals only in scores',()=>{
 const before=JSON.stringify(records),s=summarizeTeam(records,'FotMob:10');
 assert.equal(s.matches,4);assert.deepEqual([s.wins,s.draws,s.losses],[2,1,1]);
 assert.deepEqual([s.goalsFor,s.goalsAgainst],[3,2]);assert.equal(s.averageXgFor,.2);assert.equal(s.averageXgAgainst,.4);
 assert.deepEqual(s.series.map(g=>g.xgFor),[0,0,.5,.3]);
 assert.deepEqual(s.form.map(g=>g.outcome),['win','draw','loss','win']);assert.equal(s.form[2].opponent,'Team 20');assert.equal(JSON.stringify(records),before);
});
test('empty and duplicate records never inflate totals or divide by zero',()=>{
 const empty=summarizeTeam(records,'FotMob:999');assert.equal(empty.matches,0);assert.equal(empty.averageXgFor,null);assert.equal(empty.form.length,0);
 assert.equal(summarizeTeam([...records,records[0]],'FotMob:10').matches,4);
 const many=Array.from({length:8},(_,i)=>record(i,`2026-10-${String(i+1).padStart(2,'0')}`,10,20,0,0,[]));
 assert.equal(summarizeTeam(many,'FotMob:10').form.length,5);
});
