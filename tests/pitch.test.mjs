import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pitchPosition} from '../web/pitch.mjs';
const match={home_id:1,away_id:2};
test('home shots and goals keep their source positions; away rotates on both axes',()=>{
 for(const outcome of ['Goal','SavedShot'])for(const period of [1,2,3,4]) {
  const shot={x:110,y:25,team_id:1,outcome,period};
  assert.deepEqual(pitchPosition(shot,match),{x:110,y:25});
  assert.deepEqual(pitchPosition({...shot,team_id:2},match),{x:10,y:55});
  assert.deepEqual(shot,{x:110,y:25,team_id:1,outcome,period});
 }
});
test('missing locations and unknown teams never invent a marker',()=>{
 for(const shot of [{x:null,y:0,team_id:1},{x:0,y:null,team_id:2},{x:NaN,y:50,team_id:1},{x:10,y:20,team_id:3}])assert.equal(pitchPosition(shot,match),null);
 assert.deepEqual(pitchPosition({x:120,y:80,team_id:2},match),{x:0,y:0});
});
