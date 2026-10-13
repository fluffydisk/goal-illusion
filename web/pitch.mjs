// Source coordinates are normalized towards the right goal for both teams.
// Rotate the away team 180 degrees for a full-pitch match view.
export function pitchPosition(shot, match) {
  if (!Number.isFinite(shot.x) || !Number.isFinite(shot.y)) return null;
  if (shot.team_id===match.home_id) return {x:shot.x,y:shot.y};
  if (shot.team_id===match.away_id) return {x:120-shot.x,y:80-shot.y};
  return null;
}
