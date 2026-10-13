import {teamKey,matchKey} from './preferences.mjs';

// Descriptive totals over recorded matches only; no predictions or new xG model.
export function summarizeTeam(records,key) {
  const seen=new Set();
  const games=records.filter(record=>{
    if(![teamKey(record,record.match.home_id),teamKey(record,record.match.away_id)].includes(key)||seen.has(matchKey(record)))return false;
    seen.add(matchKey(record));return true;
  }).sort((a,b)=>b.match.date.localeCompare(a.match.date)||String(a.match.id).localeCompare(String(b.match.id)));
  const result={name:'',matches:games.length,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,xgFor:0,xgAgainst:0,shotsFor:0,shotsAgainst:0,form:[],series:[]};
  for(const record of games) {
    const home=teamKey(record,record.match.home_id)===key;
    const own=home?record.match.home_id:record.match.away_id,opponent=home?record.match.away_id:record.match.home_id;
    if(!result.name)result.name=home?record.match.home:record.match.away;
    const goalsFor=home?record.home_score:record.away_score,goalsAgainst=home?record.away_score:record.home_score;
    const outcome=goalsFor>goalsAgainst?'win':goalsFor<goalsAgainst?'loss':'draw';
    result[{win:'wins',draw:'draws',loss:'losses'}[outcome]]++;
    result.goalsFor+=goalsFor;result.goalsAgainst+=goalsAgainst;
    let xgFor=0,xgAgainst=0;
    for(const shot of record.shots) {
      if(shot.team_id===own){result.xgFor+=shot.xg;xgFor+=shot.xg;result.shotsFor++;}
      else if(shot.team_id===opponent){result.xgAgainst+=shot.xg;xgAgainst+=shot.xg;result.shotsAgainst++;}
    }
    result.series.push({record,xgFor,xgAgainst});
    if(result.form.length<5)result.form.push({record,outcome,goalsFor,goalsAgainst,opponent:home?record.match.away:record.match.home});
  }
  result.averageXgFor=result.matches?result.xgFor/result.matches:null;
  result.averageXgAgainst=result.matches?result.xgAgainst/result.matches:null;
  return result;
}
