import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterShots} from '../web/shot-browser.mjs';
const record={match:{home_id:1,away_id:2},shots:[
 {team_id:1,period:1,elapsed_minutes:10,minute:10,xg:.1,player:'A',outcome:'Goal'},
 {team_id:2,period:2,elapsed_minutes:60,minute:60,xg:.6,player:'B',outcome:'Miss'},
 {team_id:1,period:3,elapsed_minutes:100,minute:100,xg:.3,player:'A',outcome:'Goal'}]};
test('shot filters compose across team, period, outcome and player',()=>{
 assert.equal(filterShots(record,{team:'home',outcome:'goals',player:'A'}).length,2);
 assert.equal(filterShots(record,{period:'extra'}).length,1);
 assert.equal(filterShots(record,{period:'2',outcome:'highxg'}).length,1);
 assert.equal(filterShots(record,{team:'away',outcome:'goals'}).length,0);
});
test('quality sort preserves source indices without touching the raw xG data',()=>{
 const before=JSON.stringify(record);assert.deepEqual(filterShots(record,{sort:'quality'}).map(s=>s.index),[1,2,0]);
 assert.equal(JSON.stringify(record),before);assert.equal(filterShots(record,{outcome:'highxg'}).length,2);
});
import {goalEvents} from '../web/shot-browser.mjs';
test('goal timeline keeps source order, source indices and omits fixed own goals',()=>{
 const before=JSON.stringify(record),goals=goalEvents({...record,home_fixed:1});
 assert.deepEqual(goals.map(g=>g.index),[0,2]);assert.equal(goals[1].minute,100);assert.equal(JSON.stringify(record),before);
 assert.deepEqual(goalEvents({...record,shots:[]}),[]);
});
