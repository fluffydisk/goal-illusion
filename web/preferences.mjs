// Preferences stay on this device. Storage denial never prevents match analysis.
const KEY='goal-illusion-favorites';
export function readFavorites(storage) {
  try {
    const value=JSON.parse(storage?.getItem(KEY)||'{}');
    const valid=list=>new Set(Array.isArray(list)?list.filter(v=>typeof v==='string'&&v.length<120).slice(0,500):[]);
    return {teams:valid(value.teams),matches:valid(value.matches)};
  } catch{return {teams:new Set(),matches:new Set()};}
}
export function saveFavorites(value,storage) {
  try {storage?.setItem(KEY,JSON.stringify({teams:[...value.teams],matches:[...value.matches]}));return !!storage;}catch{return false;}
}
export const teamKey=(record,id)=>`${record.source_name}:${id}`;
export const matchKey=record=>`${record.source_name}:${record.match.id}`;
export const isFavorite=(record,favorites)=>favorites.matches.has(matchKey(record))||favorites.teams.has(teamKey(record,record.match.home_id))||favorites.teams.has(teamKey(record,record.match.away_id));
export function toggleFavorite(set,key) {if(set.has(key))set.delete(key);else set.add(key);}
export const favoritesStorageKey=KEY;
export function applyFavoriteChange(current,kind,key,selected,storage) {
  let latest=current;
  try {if(storage){const raw=storage.getItem(KEY);if(raw!==null)latest=readFavorites(storage);}}catch{}
  const next={teams:new Set(latest.teams),matches:new Set(latest.matches)};
  if(selected)next[kind].add(key);else next[kind].delete(key);
  if(next[kind].size>500)throw new RangeError('Favorite limit exceeded');
  current.teams=next.teams;current.matches=next.matches;
  return saveFavorites(current,storage);
}
const favoriteId=value=>typeof value==='string'&&/^(?:FotMob|StatsBomb Open Data):\d{1,12}$/.test(value);
export function favoritesBackup(value) {
  return JSON.stringify({kind:'goal-illusion-favorites',format_version:1,teams:[...value.teams].filter(favoriteId),matches:[...value.matches].filter(favoriteId)},null,2);
}
export function parseFavoritesBackup(text) {
  if(typeof text!=='string'||text.length>200000)throw new Error('Invalid favorites file');
  const value=JSON.parse(text.replace(/^\uFEFF/,''));
  if(value?.kind!=='goal-illusion-favorites'||value.format_version!==1||![value.teams,value.matches].every(list=>Array.isArray(list)&&list.length<=500&&list.every(favoriteId)))throw new Error('Invalid favorites file');
  return {teams:new Set(value.teams),matches:new Set(value.matches)};
}
