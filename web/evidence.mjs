// Deterministic English evidence uses the same numeric facts and stable IDs as Turkish.
export function evidenceFor(facts, language='tr') {
  if(language==='tr')return facts.evidence;
  const n=value=>value.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
  const p=value=>new Intl.NumberFormat('en-GB',{style:'percent',maximumFractionDigits:1}).format(value);
  const h=facts.home,a=facts.away,teams=[h,a],join=fn=>teams.map(fn).join(' · ');
  const extra=facts.sections.includes('extra_time');
  const entries={
    chances:['Chance quality',`${h.name}: ${n(h.xg)} xG · ${a.name}: ${n(a.xg)} xG.`],
    outcomes:['Outcome probabilities from the same shots',`${h.name} win ${p(facts.outcomes.home)}, draw ${p(facts.outcomes.draw)}, ${a.name} win ${p(facts.outcomes.away)}.`],
    finishing:['Shot conversion',join(team=>`${team.name}: ${team.shot_goals} shot goals / ${n(team.xg)} xG`)+'. Own goals excluded; this difference alone is not a measure of skill or luck.'],
    quality:['Quality per shot',join(team=>`${team.name}: ${team.shots} shots, ${team.xg_per_shot===null?'average undefined':`average ${n(team.xg_per_shot)} xG`}`)+'.'],
    halves:['Chances by period',join(team=>`${team.name}: first half ${n(team.first_half_xg)}, second half ${n(team.second_half_xg)} xG${extra?`, extra time ${n(team.extra_time_xg)} xG`:''}`)+'.'],
    own_goals:['Own goals',`${h.fixed_goals} fixed goals for ${h.name}, ${a.fixed_goals} for ${a.name}; excluded from shot quality.`],
  };
  if(facts.observed_margin_tail!==null){
    const margin=h.goals-a.goals,winner=margin>0?h:a;
    entries.margin=['Score margin probability',`From the same shots, ${winner.name} has a ${p(facts.observed_margin_tail)} probability of winning by at least ${Math.abs(margin)} goals.`];
  }
  const events=new Map(facts.events.map(event=>[event.id,event]));
  return facts.evidence.map(entry=>{
    const event=events.get(entry.id);
    if(event)return {id:entry.id,label:`${event.minute}${event.added_minutes?'+'+event.added_minutes:''}′ · ${event.team}`,text:`${event.player||'Player unavailable'}: ${event.goal?'goal':'non-goal shot'}, ${n(event.xg)} xG.`};
    if(!entries[entry.id])throw new Error(`Unknown evidence ID: ${entry.id}`);
    const [label,text]=entries[entry.id];return {id:entry.id,label,text};
  });
}
