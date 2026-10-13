import {analyze} from './math.mjs';

// Reuse the exact shot-based model; display/export do not introduce new estimates.
export function matchMetrics(record) {
  const {match}=record;
  const team=(id,name,goals,fixed)=>{
    const shots=record.shots.filter(shot=>shot.team_id===id);
    const xg=shots.reduce((total,shot)=>total+shot.xg,0);
    return {id,name,goals,fixedGoals:fixed,shotGoals:goals-fixed,shots:shots.length,xg,
      xgPerShot:shots.length?xg/shots.length:null,
      firstHalfXg:shots.filter(shot=>shot.period===1).reduce((sum,shot)=>sum+shot.xg,0),
      secondHalfXg:shots.filter(shot=>shot.period===2).reduce((sum,shot)=>sum+shot.xg,0),
      extraTimeXg:shots.filter(shot=>shot.period>=3).reduce((sum,shot)=>sum+shot.xg,0)};
  };
  const home=team(match.home_id,match.home,record.home_score,record.home_fixed),away=team(match.away_id,match.away,record.away_score,record.away_fixed);
  const analysis=analyze(record.shots.filter(s=>s.team_id===home.id).map(s=>s.xg),record.shots.filter(s=>s.team_id===away.id).map(s=>s.xg),record.home_fixed,record.away_fixed);
  return {home,away,outcomes:{home:analysis.win,draw:analysis.draw,away:analysis.loss},
    actualScoreProbability:analysis.scores.find(s=>s.home===home.goals&&s.away===away.goals)?.probability||0,
    mostLikelyScore:analysis.scores[0],topScores:analysis.scores.filter(s=>s.probability>0).slice(0,5)};
}
