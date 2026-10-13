export function filterShots(record,{team='',period='',outcome='',player='',sort='time'}={}) {
  const teamId=team==='home'?record.match.home_id:team==='away'?record.match.away_id:null;
  return record.shots.map((shot,index)=>({...shot,index})).filter(shot=>
    (teamId===null||shot.team_id===teamId)&&(!period||(period==='extra'?shot.period>=3:String(shot.period)===period))&&
    (!outcome||(outcome==='goals'?shot.outcome==='Goal':outcome==='highxg'?shot.xg>=0.3:true))&&(!player||shot.player===player))
    .sort((a,b)=>sort==='quality'?b.xg-a.xg||a.elapsed_minutes-b.elapsed_minutes:a.elapsed_minutes-b.elapsed_minutes||a.index-b.index);
}
export function outcomeLabel(outcome) {
  return {Goal:'Gol',Miss:'İsabetsiz',Wayward:'İsabetsiz','Off T':'İsabetsiz',Over:'İsabetsiz',
    Blocked:'Engellendi',BlockedShot:'Engellendi',AttemptSaved:'Kurtarıldı',Saved:'Kurtarıldı',SavedShot:'Kurtarıldı',
    'Saved Off Target':'Kurtarıldı','Saved to Post':'Direğe kurtarıldı',Post:'Direkten döndü'}[outcome]||outcome;
}
export function goalEvents(record) {
  return record.shots.map((shot,index)=>({...shot,index})).filter(shot=>shot.outcome==='Goal')
    .sort((a,b)=>a.elapsed_minutes-b.elapsed_minutes||a.index-b.index);
}
