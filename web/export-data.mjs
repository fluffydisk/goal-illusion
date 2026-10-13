import {matchMetrics} from './match-metrics.mjs';

export function csvCell(value) {
  if(value===null||value===undefined)return '';
  let text=String(value);
  // Team/player names are external data. Protect spreadsheet consumers from formulas.
  if(typeof value==='string'&&/^[\s]*[=+\-@]|^[\t\r\n]/u.test(value))text="'"+text;
  return /[",\r\n]/u.test(text)?`"${text.replaceAll('"','""')}"`:text;
}
export const csvRows=rows=>'\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
export function analysisDocument(record,{datasetUpdatedAt=null,fingerprint=null,exportedAt=new Date().toISOString()}={}) {
  return {format_version:1,exported_at:exportedAt,dataset_updated_at:datasetUpdatedAt,fingerprint,
    match:record.match,league_id:record.league_id||null,metrics:matchMetrics(record),shots:record.shots,
    duration:record.duration,timeline_end:record.timeline_end,period_boundaries:record.period_boundaries,
    source:{name:record.source_name,url:record.source_url,retrieved_at:record.retrieved_at,
      licence:record.source_name==='StatsBomb Open Data'?'StatsBomb Open Data licence; see data/STATSBOMB_LICENSE.pdf':null},
    warnings:record.warnings,warnings_language:'tr',
    model:{name:'Poisson-binomial',conditional_on:'Recorded shots',independent_shots:true,
      fixed_own_goal_contributions:{home:record.home_fixed,away:record.away_fixed},penalty_shootouts_included:false,
      limitations:'Not a pre-match prediction or a definitive deserved score. Rebounds, dependent chances and unrecorded play are not modelled.'},
    coordinates:{width:120,height:80,orientation:'Both teams normalized towards the right goal. Away positions are rotated 180 degrees only in the UI.'}};
}
export function shotsCsv(record) {
  return csvRows([
    ['match_id','date','team_id','team','player','period','minute','added_minutes','elapsed_minutes','x_right_goal','y_right_goal','xg','outcome','source_name','source_url'],
    ...record.shots.map(shot=>[record.match.id,record.match.date,shot.team_id,shot.team_id===record.match.home_id?record.match.home:record.match.away,
      shot.player,shot.period,shot.minute,shot.added_minutes,shot.elapsed_minutes,shot.x,shot.y,shot.xg,shot.outcome,record.source_name,record.source_url])]);
}
export function summaryCsv(record) {return comparisonCsv([record]);}
export function comparisonCsv(records) {
  return csvRows([
    ['match_id','date','competition','season','side','team','goals','fixed_goals','shot_goals','shots','xg','xg_per_shot','first_half_xg','second_half_xg','extra_time_xg','win_probability','draw_probability','actual_score_probability','source_name','source_url'],
    ...records.flatMap(record=>{const metrics=matchMetrics(record);return ['home','away'].map(side=>{const team=metrics[side];return [record.match.id,record.match.date,record.match.competition,record.match.season,side,team.name,
      team.goals,team.fixedGoals,team.shotGoals,team.shots,team.xg,team.xgPerShot,team.firstHalfXg,team.secondHalfXg,team.extraTimeXg,metrics.outcomes[side],metrics.outcomes.draw,metrics.actualScoreProbability,record.source_name,record.source_url];});})]);
}
export function teamCsv(records,key) {
  const seen=new Set(),games=records.filter(record=>{
    const match=record.match,source=`${record.source_name}:${match.id}`;
    if(seen.has(source)||![`${record.source_name}:${match.home_id}`,`${record.source_name}:${match.away_id}`].includes(key))return false;
    seen.add(source);return true;
  }).sort((a,b)=>a.match.date.localeCompare(b.match.date)||String(a.match.id).localeCompare(String(b.match.id)));
  return csvRows([
    ['match_id','date','competition','season','venue','team','opponent','goals_for','goals_against','shots_for','shots_against','xg_for','xg_against','xg_per_shot_for','fixed_goals_for','fixed_goals_against','conditional_win_probability','conditional_draw_probability','source_name','source_url'],
    ...games.map(record=>{
      const metrics=matchMetrics(record),side=`${record.source_name}:${record.match.home_id}`===key?'home':'away',other=side==='home'?'away':'home',team=metrics[side],opponent=metrics[other];
      return [record.match.id,record.match.date,record.match.competition,record.match.season,side,team.name,opponent.name,team.goals,opponent.goals,team.shots,opponent.shots,team.xg,opponent.xg,team.xgPerShot,team.fixedGoals,opponent.fixedGoals,metrics.outcomes[side],metrics.outcomes.draw,record.source_name,record.source_url];
    })]);
}
