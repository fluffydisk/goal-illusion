export function statisticalTitle(data) {
  const match=data.match;
  const sum=id=>data.shots.filter(shot=>shot.team_id===id).reduce((total,shot)=>total+shot.xg,0);
  const number=value=>value.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
  return `${match.home} ${data.home_score}–${data.away_score} ${match.away} · xG: ${number(sum(match.home_id))}–${number(sum(match.away_id))}`;
}

export const STORY_VERSION=2, PROMPT_VERSION=9;
export const sectionLabels={opening:'Ana çıkarım',first_half:'İlk yarı',second_half:'İkinci yarı',match_flow:'Maçın akışı',extra_time:'Uzatma',chances:'Önemli fırsatlar',verdict:'Skorun değerlendirmesi',closing:'Son yorum'};
export function readyStory(item) {
  const n=item?.narrative, f=item?.facts;
  return !!(item?.status==='ready'&&f&&n&&n.fingerprint===f.fingerprint&&n.story_version===STORY_VERSION&&n.prompt_version===PROMPT_VERSION&&
    typeof n.headline==='string'&&typeof n.summary==='string'&&Array.isArray(n.cards)&&n.cards.length>=5&&n.cards.length<=7&&
    JSON.stringify(n.cards.map(c=>c?.type))===JSON.stringify(f.sections)&&n.cards.every(c=>typeof c.title==='string'&&typeof c.text==='string'&&Array.isArray(c.evidence_ids)&&c.evidence_ids.length>0&&c.evidence_ids.every(id=>f.evidence.some(e=>e.id===id))));
}
export function cardDuration(card) {return Math.min(25000,Math.max(10000,(card.title+' '+card.text).trim().split(/\s+/u).length*350+2500));}
