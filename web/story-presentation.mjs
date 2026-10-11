export function statisticalTitle(data) {
  const match=data.match;
  const sum=id=>data.shots.filter(shot=>shot.team_id===id).reduce((total,shot)=>total+shot.xg,0);
  const number=value=>value.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
  return `${match.home} ${data.home_score}–${data.away_score} ${match.away} · xG: ${number(sum(match.home_id))}–${number(sum(match.away_id))}`;
}
