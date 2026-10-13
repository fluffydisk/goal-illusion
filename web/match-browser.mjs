import {isFavorite,teamKey} from './preferences.mjs';
import {t, locale} from './i18n.mjs';
// Match discovery uses only verified records in the published bundle.
export const leagueKey = record => String(record.league_id || 'example');
export function leagueLabel(records, id, catalog=[]) {
  const labels = {'71':'Süper Lig', '54':'Bundesliga', example:t('Dünya Kupası · örnek')};
  return catalog.find(league=>String(league.id)===id)?.name || labels[id] || records.find(record => leagueKey(record) === id)?.match.competition || t('Diğer maçlar');
}
export function searchKey(value) {
  return String(value).toLocaleLowerCase('tr-TR').replaceAll('ı','i')
    .normalize('NFD').replace(/\p{M}/gu, '').replaceAll('ß','ss').trim();
}
export function teamsFor(records) {
  const teams = new Map();
  for (const record of records) {
    const {match}=record;
    teams.set(record.source_name?teamKey(record,match.home_id):String(match.home_id), match.home);
    teams.set(record.source_name?teamKey(record,match.away_id):String(match.away_id), match.away);
  }
  return [...teams].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,locale()));
}
export function teamSide(record,team) {
  if(!team)return null;
  const id=(side)=>team.includes(':')?teamKey(record,record.match[`${side}_id`]):String(record.match[`${side}_id`]);
  return id('home')===team?'home':id('away')===team?'away':null;
}
export function filterMatches(records, {team='', query='', season='', from='', to='', favorites=null, venue=''} = {}) {
  const terms = searchKey(query).split(/\s+/).filter(Boolean);
  return records.filter(record => {const {match}=record,side=teamSide(record,team);return (!team||side!==null)&&(!venue||!team||side===venue)
    && (!season||match.season===season)&&(!from||match.date.slice(0,10)>=from)&&(!to||match.date.slice(0,10)<=to)&&(!favorites||isFavorite(record,favorites))
    && terms.every(term=>searchKey(`${match.home} ${match.away}`).includes(term));})
    .sort((a,b)=>b.match.date.localeCompare(a.match.date) || String(a.match.id).localeCompare(String(b.match.id)));
}
