import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchMetrics} from '../web/match-metrics.mjs';
const record={match:{home_id:1,away_id:2,home:'H',away:'A'},home_score:2,away_score:1,home_fixed:1,away_fixed:0,
 shots:[{team_id:1,period:1,xg:.25},{team_id:1,period:2,xg:.75},{team_id:2,period:3,xg:.5}]};
test('comparison uses the exact conditional distribution and preserves fixed goals',()=>{
 const before=JSON.stringify(record),metrics=matchMetrics(record);
 assert.equal(metrics.home.xg,1);assert.equal(metrics.home.xgPerShot,.5);assert.equal(metrics.home.shotGoals,1);assert.equal(metrics.away.extraTimeXg,.5);
 assert.equal(metrics.actualScoreProbability,.3125);assert.equal(metrics.outcomes.home+metrics.outcomes.draw+metrics.outcomes.away,1);assert.equal(JSON.stringify(record),before);
});
test('no shots means undefined average, not a fabricated zero-quality shot',()=>{
 const metrics=matchMetrics({...record,shots:[],home_score:1,away_score:0});assert.equal(metrics.home.xg,0);assert.equal(metrics.home.xgPerShot,null);assert.equal(metrics.actualScoreProbability,1);
});
