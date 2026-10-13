import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFavorites,saveFavorites,teamKey,matchKey,isFavorite,toggleFavorite} from '../web/preferences.mjs';
import {filterMatches} from '../web/match-browser.mjs';
const record={source_name:'FotMob',match:{id:1,home_id:10,away_id:20,home:'Home',away:'Away',season:'2026/2027',date:'2026-10-11'}};
test('favorite teams include home and away games; saved matches are independent',()=>{
 const favorites=readFavorites();toggleFavorite(favorites.teams,teamKey(record,20));assert.equal(isFavorite(record,favorites),true);
 toggleFavorite(favorites.teams,teamKey(record,20));assert.equal(isFavorite(record,favorites),false);
 toggleFavorite(favorites.matches,matchKey(record));assert.equal(isFavorite(record,favorites),true);
 assert.equal(isFavorite({...record,source_name:'StatsBomb'},favorites),false);
});
test('storage roundtrip and denied/corrupt storage do not lose session state',()=>{
 let stored;const storage={setItem(_,value){stored=value;},getItem(){return stored;}};
 const favorites=readFavorites(storage);favorites.teams.add('FotMob:10');assert.equal(saveFavorites(favorites,storage),true);assert.equal(readFavorites(storage).teams.has('FotMob:10'),true);
 assert.equal(readFavorites({getItem(){return '{bad';}}).teams.size,0);
 assert.equal(saveFavorites(favorites,{setItem(){throw Error('denied');}}),false);assert.equal(favorites.teams.has('FotMob:10'),true);
});
test('date bounds, seasons and favorites combine without changing input',()=>{
 const records=[record,{...record,match:{...record.match,id:2,date:'2026-09-01',season:'2025/2026'}}];
 assert.equal(filterMatches(records,{from:'2026-10-11',to:'2026-10-11'}).length,1);
 assert.equal(filterMatches(records,{from:'2026-10-12',to:'2026-10-11'}).length,0);
 assert.equal(filterMatches(records,{season:'2025/2026'}).length,1);
 const favorites=readFavorites();favorites.matches.add(matchKey(record));assert.equal(filterMatches(records,{favorites}).length,1);assert.equal(records.length,2);
});
import {applyFavoriteChange} from '../web/preferences.mjs';
test('favorite changes merge the latest stored selection instead of overwriting another tab',()=>{
 let raw='{"teams":["FotMob:20"],"matches":["FotMob:99"]}';const storage={getItem(){return raw;},setItem(_,value){raw=value;}};
 const stale={teams:new Set(),matches:new Set()};applyFavoriteChange(stale,'teams','FotMob:10',true,storage);
 assert.equal(stale.teams.has('FotMob:20'),true);assert.equal(stale.matches.has('FotMob:99'),true);assert.equal(stale.teams.has('FotMob:10'),true);
 applyFavoriteChange(stale,'teams','FotMob:10',false,storage);assert.equal(stale.teams.has('FotMob:10'),false);
});
import {favoritesBackup,parseFavoritesBackup} from '../web/preferences.mjs';
test('portable favorites validate source IDs and schema, with no executable or arbitrary keys',()=>{
 const input={teams:new Set(['FotMob:10']),matches:new Set(['StatsBomb Open Data:3869118'])},parsed=parseFavoritesBackup(favoritesBackup(input));
 assert.deepEqual(parsed,input);
 for(const text of ['{}','{"kind":"goal-illusion-favorites","format_version":1,"teams":["javascript:alert(1)"],"matches":[]}','x'.repeat(200001)])assert.throws(()=>parseFavoritesBackup(text));
});
