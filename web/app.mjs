import {initializePwa,refreshPwaLabels} from './pwa.mjs';
import {analysisDocument,shotsCsv,summaryCsv,comparisonCsv,teamCsv} from './export-data.mjs';
import {matchMetrics} from './match-metrics.mjs';
import {summarizeTeam} from './team-summary.mjs';
import {filterShots,outcomeLabel,goalEvents} from './shot-browser.mjs';
import {themePreference,setTheme} from './theme.mjs';
import {readFavorites,saveFavorites,teamKey,matchKey,applyFavoriteChange,favoritesStorageKey,favoritesBackup,parseFavoritesBackup} from './preferences.mjs';
import {evidenceFor} from './evidence.mjs';
import {t, locale, language, setLanguage, translatePage} from './i18n.mjs';
import {pitchPosition} from './pitch.mjs';
import {leagueKey, leagueLabel, teamsFor, filterMatches} from './match-browser.mjs';
import {analyze} from './math.mjs';
import {ACTIVE, progressText, analysisRequest} from './ai-client.mjs?v=mvp4';
import {loadAnalysisBundle, consistentAnalysis} from './analysis-data.mjs';
import {readyStory} from './story-presentation.mjs';
import {createStoryViewer} from './story-viewer.mjs';
const $ = id => document.getElementById(id);
const pct = n => new Intl.NumberFormat(locale(),{style:'percent',maximumFractionDigits:1}).format(n);
const dec = n => n.toLocaleString(locale(),{minimumFractionDigits:2,maximumFractionDigits:2});
const colors = ['var(--home)','var(--away)'];
function el(tag, text, className) { const e=document.createElement(tag); e.textContent=text; if(className)e.className=className; return e; }
function svgNode(tag,attrs={}) { const e=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v); return e; }
function graphic(container,viewBox,label) {const svg=svgNode('svg',{viewBox,role:'img','aria-label':label}); $(container).replaceChildren(svg);return svg;}
let snapshot, available, stories, aiEndpoint='',cachedBundle=false;
const dynamicStories=new Map(), jobs=new Map();
let preferenceStorage;try{preferenceStorage=localStorage;}catch{}
const favorites=readFavorites(preferenceStorage);
let favoritesUndo=null;
let selectedId, pollTimer, clockTimer, activeRequest,visibleMatchIds=[];
translatePage();
$('language').value=language();$('theme').value=themePreference();
$('theme').addEventListener('change',()=>setTheme($('theme').value));
window.addEventListener('themechange',event=>{$('theme').value=event.detail;});
initializePwa();
const viewer=createStoryViewer();
const mobileLayout=matchMedia('(max-width: 740px)');
$('match-picker').open=!mobileLayout.matches;
mobileLayout.addEventListener('change',event=>{$('match-picker').open=!event.matches;});
$('match-picker').addEventListener('toggle',()=>{$('mobile-matches').setAttribute('aria-expanded',String($('match-picker').open));});
$('mobile-matches').onclick=()=>{$('match-picker').open=true;$('match-picker').querySelector('summary').focus();$('match-picker').scrollIntoView({block:'start'});};
let waitingIndex=0;
$('open-story').onclick=()=>{const d=available.find(d=>String(d.match.id)===selectedId);if(d&&hasStory(d))viewer.open(storyFor(d),d);};
$('next-fact').onclick=()=>{waitingIndex++;const d=available.find(d=>String(d.match.id)===selectedId);if(d)jobWidget(d);};
function updateNetworkNote() {
  const offline=!navigator.onLine;$('network-note').hidden=!offline&&!cachedBundle;
  $('network-note').textContent=offline?t('Çevrimdışısın. Kayıtlı doğrulanmış veri sürümü gösteriliyor; yeni AI yorumu üretilemez.'):cachedBundle?t('Veri paketi ağdan yenilenemedi. Kayıtlı doğrulanmış sürüm gösteriliyor.'):'';
}
window.addEventListener('offline',()=>{
  stopPolling();updateNetworkNote();const record=available?.find(d=>String(d.match.id)===selectedId);
  if(record){const job=jobs.get(jobKey(selectedId));if(job&&ACTIVE.has(job.status))jobs.set(jobKey(selectedId),{...job,connection_lost:true});jobWidget(record);}
});
window.addEventListener('online',()=>{
  updateNetworkNote();const record=available?.find(d=>String(d.match.id)===selectedId);if(record&&aiEndpoint&&!hasStory(record))refreshJob(record);
});
updateNetworkNote();
function stopPolling() {clearTimeout(pollTimer);clearInterval(clockTimer);activeRequest?.abort();}
function jobWidget(d) {
  const id=String(d.match.id), job=jobs.get(jobKey(id)), ready=hasStory(d);
  const active=!!job&&ACTIVE.has(job.status);
  $('story').classList.toggle('is-creating',active);
  $('ai-controls').hidden=ready;
  $('ai-progress').hidden=!job||!ACTIVE.has(job.status);
  $('generate-ai').hidden=!!job&&ACTIVE.has(job.status);
  $('generate-ai').disabled=cachedBundle||!navigator.onLine||!aiEndpoint||job?.unsupported_language||(!active&&job?.retry_at>Date.now());
  $('generate-ai').textContent=job&&['failed','rate_limited'].includes(job.status)?t('Yeniden dene'):t('AI yorumu oluştur');
  $('ai-message').textContent=!aiEndpoint?t('İstek üzerine analiz servisi henüz bağlanmadı.'):job?.error||t('İlk yorum istek üzerine hazırlanır. Hazır yorumlar tekrar okunabilir.');
  if(job?.retry_at>Date.now()&&!active)$('ai-message').textContent+=t(' Birazdan tekrar deneyebilirsin.');
  $('ai-phase').textContent=job?.connection_lost?t('Bağlantı yeniden kuruluyor'):job?.status==='submitting'?t('Analiz isteği gönderiliyor'):job?.phase||'';
  $('ai-message').hidden=active;
  $('waiting-facts').hidden=!job||!ACTIVE.has(job.status);
  const facts=storyFor(d)?.facts;
  const notes=(facts?evidenceFor(facts,language()):[]).filter(e=>!e.id.startsWith('shot_'));
  $('waiting-fact').textContent=notes.length?notes[waitingIndex%notes.length].text:'';
  $('waiting-count').textContent=notes.length?`${waitingIndex%notes.length+1} / ${notes.length}`:'';
  $('waiting-facts').hidden=!active||!notes.length;
  function tick() {
    if (!active) { $('generate-ai').disabled=cachedBundle||!navigator.onLine||!aiEndpoint||job?.unsupported_language||job?.retry_at>Date.now();return; }
    const text=progressText(job);$('ai-elapsed').textContent=text.elapsed;$('ai-estimate').textContent=job.connection_lost?(job.status==='submitting'?t('İsteğinin durumunu kontrol ediyoruz. Yeniden tıklamana gerek yok.'):t('İşlem sunucuda devam ediyor. Durumu otomatik kontrol ediyoruz.')):text.remaining;
  }
  clearInterval(clockTimer);tick();
  if (active||job?.retry_at>Date.now()) clockTimer=setInterval(tick,1000);
  const stages=['queued','generating','reviewing','ready'], current=Math.max(0,stages.indexOf(job?.resume_status||job?.status));
  for (const step of document.querySelectorAll('.ai-steps li')) {
    step.classList.toggle('current',step.dataset.stage===stages[current]);
    if(step.dataset.stage===stages[current])step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');
    step.classList.toggle('completed',stages.indexOf(step.dataset.stage)<current);
  }
}
async function refreshJob(d,method='GET') {
  if (!aiEndpoint || hasStory(d)) return;
  const id=String(d.match.id), requestLanguage=language(); activeRequest?.abort();
  const controller=new AbortController();activeRequest=controller;
  try {
    const {result,data}=await consistentAnalysis({record:d,item:storyFor(d)},
      data=>analysisRequest(aiEndpoint,id,method,controller.signal,data.item.facts.fingerprint),
      async()=>{
        const bundle=await loadAnalysisBundle(controller.signal);
        controller.signal.throwIfAborted();
        if(selectedId!==id)throw new DOMException('Match changed','AbortError');
        snapshot=bundle.snapshot;stories=bundle;cachedBundle=bundle.cache_status==='cached';updateNetworkNote();dynamicStories.clear();jobs.clear();
        available=filterMatches(leagueMatches());
        const previousTeam=$('team').value;
        $('team').replaceChildren(new Option(t('Tüm takımlar'),''),...teamsFor(available).map(team=>new Option(team.name,team.id)));
        $('team').value=teamsFor(available).some(team=>team.id===previousTeam)?previousTeam:'';
        $('match').replaceChildren(...available.map(record=>new Option(record.match.home+' – '+record.match.away,record.match.id)));
        $('match').value=id;seasonOptions();renderMatchList();
        const record=available.find(record=>String(record.match.id)===id);
        if(!record)throw new Error(t('Bu maç güncel veri paketinde bulunamadı.'));
        render(false);
        return {record,item:storyFor(record)};
      });
    controller.signal.throwIfAborted();
    if(selectedId!==id||language()!==requestLanguage||activeRequest!==controller)return;
    d=data.record;
    jobs.set(jobKey(id),result);
    if (result.status==='ready') {
      const fresh={...storyFor(d),status:'ready',narrative:result.narrative};
      if(!readyStory(fresh,requestLanguage))throw new Error(t('AI Review servisi güncelleniyor. Yeni hikâye henüz kullanılamıyor.'));
      dynamicStories.set(jobKey(id),fresh);
    }
    const m=d.match,home=d.shots.filter(s=>s.team_id===m.home_id),away=d.shots.filter(s=>s.team_id===m.away_id);
    renderStory(d,analyze(home.map(s=>s.xg),away.map(s=>s.xg),d.home_fixed,d.away_fixed),[home,away].map(ss=>ss.reduce((n,s)=>n+s.xg,0)));
    if(result.status==='ready')renderCoverage();
    if (ACTIVE.has(result.status)) pollTimer=setTimeout(()=>refreshJob(d),4000);
  } catch(error) {
    if (controller.signal.aborted||error.name==='AbortError'||selectedId!==id||language()!==requestLanguage||activeRequest!==controller) return;
    // A lost poll/POST response is not a failed server job. Reconcile via GET;
    // never submit a second generation simply because the connection dropped.
    const previous=jobs.get(jobKey(id));
    if(previous&&ACTIVE.has(previous.status)){
      jobs.set(jobKey(id),{...previous,connection_lost:true});jobWidget(d);
      pollTimer=setTimeout(()=>refreshJob(d),8000);
    }else{
      jobs.set(jobKey(id),{status:'failed',unsupported_language:!!error.unsupportedLanguage,error:error.unsupportedLanguage?error.message:t('Bağlantı kurulamadı. Durumu tekrar kontrol edebilirsin.')});
      jobWidget(d);
    }
  }
}
$('generate-ai').addEventListener('click',()=>{
  const d=available.find(d=>String(d.match.id)===$('match').value);if(!d||$('generate-ai').disabled||ACTIVE.has(jobs.get(jobKey(d.match.id))?.status))return;
  jobs.set(jobKey(d.match.id),{status:'submitting',phase:t('İstek gönderiliyor…'),started_at:Date.now(),updated_at:Date.now()});
  jobWidget(d);
  $('generate-ai').disabled=true;
  clearTimeout(pollTimer);refreshJob(d,'POST');
});
function jobKey(id) {return `${language()}:${id}`;}
function storyFor(d) {
  const item=stories?.stories?.[d.match.id];
  const narrative=item?.narratives?.[language()]||(language()==='tr'?item?.narrative:null);
  return dynamicStories.get(jobKey(d.match.id))||{...item,narrative,status:item?.status};
}
function hasStory(d) {return readyStory(storyFor(d),language());}
function renderStory(d, a, sums) {
  const item=storyFor(d);
  const facts=item?.facts, valid=hasStory(d), prose=valid?item.narrative:null;
  $('story-label').textContent=t('AI MAÇ YORUMU');
  $('story-match').textContent=`${d.match.home} ${d.home_score}–${d.away_score} ${d.match.away}`;
  $('story-headline').textContent=valid?prose.headline:t('Maçın şut verilerine dayalı yorum');
  $('story-explanation').textContent=valid?prose.summary:t('Maçın akışını ve önemli fırsatları, hesaplanan istatistiklerle birlikte incele.');
  $('open-story').hidden=!valid;
  jobWidget(d);
  const evidence=(facts?evidenceFor(facts,language()):null)||[
    {id:'chances',label:t('Üretilen fırsatların kalitesi'),text:`${d.match.home}: ${dec(sums[0])} xG · ${d.match.away}: ${dec(sums[1])} xG.`},
    {id:'outcomes',label:t('Aynı şutlarla olası sonuçlar'),text:language()==='en'?`${d.match.home} win ${pct(a.win)}, draw ${pct(a.draw)}, ${d.match.away} win ${pct(a.loss)}.`:`${d.match.home} galibiyeti ${pct(a.win)}, beraberlik ${pct(a.draw)}, ${d.match.away} galibiyeti ${pct(a.loss)}.`}
  ];
  $('all-evidence').replaceChildren(...evidence.map(e=>{const box=el('article','','evidence');box.append(el('h3',e.label),el('p',e.text));return box;}));
  $('story-note').textContent=valid?t('Şut verilerine dayalı AI yorumu · İlgili veriler her bölümde incelenebilir.'):t('Şutlara dayalı analiz, tüm oyun performansını ölçmez.');
  $('insight').textContent=valid?prose.summary:t('Bu dağılım gerçekleşmiş şutlara koşulludur; maç öncesi tahmin veya kesin bir hak edilen skor değildir.');
}
function renderCoverage(){
  const coverage=snapshot.coverage?.filter(entry=>$('league').value==='all'||String(entry.id)===$('league').value)||[];
  $('coverage-summary').hidden=!coverage.length;
  const known=coverage.filter(entry=>entry.completed!==undefined);
  const incomplete=known.filter(entry=>entry.available<entry.completed);
  $('coverage-summary').textContent=coverage.some(entry=>entry.status==='unavailable')?t('Kaynağa şu anda ulaşılamıyor; önceki doğrulanmış kayıtlar gösteriliyor.'):incomplete.length?t`${known.reduce((n,e)=>n+e.available,0)} / ${known.reduce((n,e)=>n+e.completed,0)} maç doğrulandı. Diğer maçlar sonraki güncellemelerde eklenir.`:t('Bu liglerdeki tamamlanmış maçların şut verisi doğrulandı.');
  const issueCount=coverage.length?coverage.reduce((count,entry)=>count+(entry.issues||0),0):$('league').value==='example'?0:snapshot.issues.length;
  $('status').textContent=t`${available.length} maç · ${available.filter(hasStory).length} AI yorumu hazır · ${issueCount?t`${issueCount} maç/kaynak verisi güncellemede alınamadı; mevcut doğrulanmış maçlar gösteriliyor.`:t('Tamamlanmış ve şut bazlı xG bulunan maçlar.')}`;
}
function renderMatchList() {
  const from=$('date-from').value,to=$('date-to').value;
  $('venue-filter').hidden=!$('team').value;if(!$('team').value)$('venue').value='';
  $('filter-error').hidden=!(from&&to&&from>to);$('filter-error').textContent=t('Başlangıç tarihi bitişten sonra olamaz.');
  const filtered=filterMatches(available,{team:$('team').value,query:$('team-search').value,season:$('season').value,from,to,favorites:$('favorites-only').checked?favorites:null,venue:$('venue').value});
  $('clear-favorites').hidden=!favorites.teams.size&&!favorites.matches.size;$('favorite-actions').hidden=false;$('export-favorites').disabled=!favorites.teams.size&&!favorites.matches.size;
  $('favorites-note').hidden=!$('favorites-only').checked;
  $('match-count').textContent=t`${filtered.length} maç`;
  $('filter-summary').textContent=t`${filtered.length} maç bulundu.`;
  $('no-matches').hidden=filtered.length>0;
  $('reset-filters').hidden=!$('team').value&&!$('team-search').value&&!$('season').value&&!from&&!to&&!$('favorites-only').checked&&!$('venue').value;
  const nodes=[];let day='';
  for(const d of filtered){
    const date=d.match.date.slice(0,10);
    if(date!==day){day=date;nodes.push(el('h3',new Date(`${date}T12:00:00`).toLocaleDateString(locale(),{day:'numeric',month:'long',year:'numeric'}),'match-day'));}
    const row=el('button','','match-row');row.type='button';row.dataset.matchId=String(d.match.id);
    row.setAttribute('aria-label',`${d.match.home} ${d.home_score}–${d.away_score} ${d.match.away}, ${date}`);
    row.setAttribute('aria-current',String(String(d.match.id)===String($('match').value)));
    const teams=el('span','','row-teams'),scores=el('span','','row-scores');
    teams.append(el('span',d.match.home),el('span',d.match.away));scores.append(el('b',String(d.home_score)),el('b',String(d.away_score)));
    row.append(el('span',t('MS'),'row-status'),teams,scores);
    row.onclick=()=>{
      chooseMatch(d.match.id);
      if(mobileLayout.matches){$('match-picker').open=false;$('match-picker').querySelector('summary').focus();}
    };
    const entry=el('div','','match-entry'),star=el('button','','match-save');star.type='button';star.dataset.matchId=String(d.match.id);
    const saved=favorites.matches.has(matchKey(d));star.textContent=saved?'★':'☆';star.setAttribute('aria-pressed',String(saved));star.setAttribute('aria-label',t`${d.match.home} – ${d.match.away}: maçı kaydet`);
    star.onclick=()=>{changeFavorite('matches',matchKey(d),star.getAttribute('aria-pressed')!=='true');renderMatchList();updateFavoriteButtons();const replacement=$('match-list').querySelector(`.match-save[data-match-id="${d.match.id}"]`);(replacement||$('favorites-only')).focus();};
    entry.append(row,star);nodes.push(entry);
  }
  visibleMatchIds=filtered.map(d=>String(d.match.id));$('match-list').replaceChildren(...nodes);updateMatchStepper();renderTeamSummary(filtered);
}
function renderTeamSummary(records) {
  const key=$('team').value;$('team-summary').hidden=!key;if(!key)return;
  $('team-export-status').textContent='';
  const summary=summarizeTeam(records,key),name=summary.name||$('team').selectedOptions[0]?.textContent||'';
  $('team-summary-title').textContent=t`${name} · ${summary.matches} kayıtlı maç`;
  $('team-summary-empty').hidden=summary.matches>0;$('export-team-csv').disabled=!summary.matches;
  $('export-team-csv').onclick=()=>{
    const name=`goal-illusion-team-${key.replace(/[^a-zA-Z0-9-]/g,'-')}.csv`;
    downloadText(teamCsv(records,key),name,'text/csv;charset=utf-8');$('team-export-status').textContent=t`${name} indirmesi başlatıldı.`;
  };
  $('team-form-label').hidden=!summary.matches;$('team-trend').hidden=!summary.matches;renderTeamTrend(summary);
  const metrics=summary.matches?[
    [t('Galibiyet / Beraberlik / Mağlubiyet'),`${summary.wins} / ${summary.draws} / ${summary.losses}`],
    [t('Atılan / Yenilen gol'),`${summary.goalsFor} / ${summary.goalsAgainst}`],
    [t('Maç başına üretilen xG'),dec(summary.averageXgFor)],
    [t('Maç başına rakip xG'),dec(summary.averageXgAgainst)],
  ]:[];
  $('team-summary-metrics').replaceChildren(...metrics.map(([label,value])=>{const box=el('div','','team-stat');box.append(el('span',label),el('strong',value));return box;}));
  const labels={win:t('Galibiyet'),draw:t('Beraberlik'),loss:t('Mağlubiyet')};
  $('team-form').replaceChildren(...summary.form.map(({record,outcome,goalsFor,goalsAgainst,opponent})=>{
    const button=el('button','','form-match');button.type='button';button.dataset.outcome=outcome;
    const date=new Date(`${record.match.date.slice(0,10)}T12:00:00`).toLocaleDateString(locale(),{day:'numeric',month:'short'});
    const label=t`${labels[outcome]} · ${goalsFor}–${goalsAgainst} · ${opponent} · ${date}`;button.setAttribute('aria-label',label);
    button.append(el('span',labels[outcome],'form-outcome'),el('b',`${goalsFor}–${goalsAgainst}`),el('span',opponent,'form-opponent'),el('small',date));
    button.onclick=()=>chooseMatch(record.match.id);return button;
  }));
}
function renderTeamTrend(summary) {
  const points=summary.series.slice(0,12).reverse();$('team-trend-chart').replaceChildren();if(!points.length)return;
  const svg=graphic('team-trend-chart','0 0 620 220',t('Takımın kayıtlı maçlarında üretilen ve rakip xG'));svg.setAttribute('role','group');
  const max=Math.max(1,...points.flatMap(point=>[point.xgFor,point.xgAgainst]))*1.15;
  const x=index=>points.length===1?320:45+index/(points.length-1)*550,y=value=>175-value/max*145;
  for(let i=0;i<=4;i++){
    const value=max*i/4;svg.append(svgNode('line',{x1:45,x2:595,y1:y(value),y2:y(value),stroke:'var(--line)'}));
    const label=svgNode('text',{x:5,y:y(value)+4,fill:'var(--muted)','font-size':11});label.textContent=dec(value);svg.append(label);
  }
  for(const [key,color] of [['xgFor','var(--home)'],['xgAgainst','var(--away)']]){
    const path=points.map((point,index)=>`${index?'L':'M'} ${x(index)} ${y(point[key])}`).join(' ');svg.append(svgNode('path',{d:path,fill:'none',stroke:color,'stroke-width':2}));
  }
  points.forEach((point,index)=>{
    const date=new Date(`${point.record.match.date.slice(0,10)}T12:00:00`).toLocaleDateString(locale(),{day:'numeric',month:'short'});
    if([0,Math.floor((points.length-1)/2),points.length-1].includes(index)){
      const label=svgNode('text',{x:x(index),y:200,fill:'var(--muted)','font-size':11,'text-anchor':'middle'});label.textContent=date;svg.append(label);
    }
    const group=svgNode('g',{role:'button',tabindex:'0','aria-label':t`${compareTitle(point.record)} · Üretilen xG ${dec(point.xgFor)}, rakip xG ${dec(point.xgAgainst)}`});
    for(const [key,color] of [['xgFor','var(--home)'],['xgAgainst','var(--away)']])group.append(svgNode('circle',{cx:x(index),cy:y(point[key]),r:4,fill:color,stroke:'var(--panel)','stroke-width':1}));
    const select=()=>chooseMatch(point.record.match.id);group.addEventListener('click',select);group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}});svg.append(group);
  });
}
function updateMatchStepper(){
  const index=visibleMatchIds.indexOf(String($('match').value));
  $('newer-match').disabled=index<=0;$('older-match').disabled=index<0||index>=visibleMatchIds.length-1;
}
for(const [id,step] of [['newer-match',-1],['older-match',1]])$(id).onclick=()=>{const index=visibleMatchIds.indexOf(selectedId),next=visibleMatchIds[index+step];if(index>=0&&next)chooseMatch(next);};
function markSelectedMatch() {
  updateMatchStepper();
  for(const row of $('match-list').querySelectorAll('.match-row'))row.setAttribute('aria-current',String(row.dataset.matchId===selectedId));
}
function leagueMatches(){return snapshot.matches.filter(record=>$('league').value==='all'||leagueKey(record)===$('league').value);}
function leagueOptions() {
  const present=new Set(snapshot.matches.map(leagueKey));
  const ids=[...(snapshot.catalog||[]).map(league=>String(league.id)).filter(id=>present.has(id)),...[...present].filter(id=>!snapshot.catalog?.some(league=>String(league.id)===id))];
  return [new Option(t('Tüm ligler'),'all'),...ids.map(id=>new Option(leagueLabel(snapshot.matches,id,snapshot.catalog),id))];
}
function seasonOptions() {
  const previous=$('season').value,seasons=[...new Set(available.map(d=>d.match.season))].sort().reverse();
  $('season').replaceChildren(new Option(t('Tüm sezonlar'),''),...seasons.map(season=>new Option(season,season)));
  $('season').value=seasons.includes(previous)?previous:'';$('season-filter').hidden=seasons.length<2;
}
function changeFavorite(kind,key,selected) {
  favoritesUndo=null;$('undo-favorites').hidden=true;
  try{if(!applyFavoriteChange(favorites,kind,key,selected,preferenceStorage))$('favorite-action-status').textContent=t('Tercihler bu oturumda kullanılabilir; tarayıcı depolamaya izin vermiyor.');}
  catch{$('favorite-action-status').textContent=t('En fazla 500 takım ve 500 maç kaydedilebilir. Önce birkaç favoriyi çıkar.');}
}
function persistFavorites(){
  if(!saveFavorites(favorites,preferenceStorage)){$('status').textContent=t('Tercihler bu oturumda kullanılabilir; tarayıcı depolamaya izin vermiyor.');}
}
function updateFavoriteButtons() {
  const d=available.find(d=>String(d.match.id)===selectedId);if(!d)return;
  for(const [side,id,name] of [['home',d.match.home_id,d.match.home],['away',d.match.away_id,d.match.away]]) {
    const saved=favorites.teams.has(teamKey(d,id)),button=$(`favorite-${side}`);button.textContent=saved?'★':'☆';button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',saved?t`${name}: favorilerden çıkar`:t`${name}: favorilere ekle`);
  }
  const saved=favorites.matches.has(matchKey(d));$('save-match').textContent=saved?t('★ Kaydedildi'):t('☆ Maçı kaydet');$('save-match').setAttribute('aria-pressed',String(saved));
}
for(const side of ['home','away'])$(`favorite-${side}`).onclick=()=>{
  const d=available.find(d=>String(d.match.id)===selectedId);if(!d)return;changeFavorite('teams',teamKey(d,d.match[`${side}_id`]),$(`favorite-${side}`).getAttribute('aria-pressed')!=='true');updateFavoriteButtons();renderMatchList();
};
$('save-match').onclick=()=>{const d=available.find(d=>String(d.match.id)===selectedId);if(!d)return;changeFavorite('matches',matchKey(d),$('save-match').getAttribute('aria-pressed')!=='true');updateFavoriteButtons();renderMatchList();};
$('clear-favorites').onclick=()=>{
  let latest=favorites;try{if(preferenceStorage&&preferenceStorage.getItem(favoritesStorageKey)!==null)latest=readFavorites(preferenceStorage);}catch{}
  favoritesUndo={teams:new Set(latest.teams),matches:new Set(latest.matches)};
  favorites.teams.clear();favorites.matches.clear();persistFavorites();$('undo-favorites').hidden=false;
  $('favorite-action-status').textContent=t('Favoriler temizlendi. Geri alabilirsin.');renderMatchList();updateFavoriteButtons();$('undo-favorites').focus();
};
$('undo-favorites').onclick=()=>{
  if(!favoritesUndo)return;
  let latest=favorites;try{if(preferenceStorage&&preferenceStorage.getItem(favoritesStorageKey)!==null)latest=readFavorites(preferenceStorage);}catch{}
  const teams=new Set([...latest.teams,...favoritesUndo.teams]),matches=new Set([...latest.matches,...favoritesUndo.matches]);
  if(teams.size>500||matches.size>500){$('favorite-action-status').textContent=t('En fazla 500 takım ve 500 maç kaydedilebilir. Önce birkaç favoriyi çıkar.');return;}
  favorites.teams=teams;favorites.matches=matches;favoritesUndo=null;persistFavorites();
  $('undo-favorites').hidden=true;$('favorite-action-status').textContent=t('Favoriler geri yüklendi.');renderMatchList();updateFavoriteButtons();$('clear-favorites').focus();
};
$('export-favorites').onclick=()=>downloadText(favoritesBackup(favorites),'goal-illusion-favorites.json','application/json;charset=utf-8');
$('import-favorites').addEventListener('change',async()=>{
  const file=$('import-favorites').files?.[0];if(!file)return;
  try {
    if(file.size>200000)throw new Error('too large');
    const imported=parseFavoritesBackup(await file.text());
    let latest=favorites;try{if(preferenceStorage&&preferenceStorage.getItem(favoritesStorageKey)!==null)latest=readFavorites(preferenceStorage);}catch{}
    const teams=new Set([...latest.teams,...imported.teams]),matches=new Set([...latest.matches,...imported.matches]);if(teams.size>500||matches.size>500)throw new Error('too many');favorites.teams=teams;favorites.matches=matches;favoritesUndo=null;$('undo-favorites').hidden=true;persistFavorites();renderMatchList();updateFavoriteButtons();
    $('favorite-action-status').textContent=t('Favori yedeği mevcut seçimlere eklendi.');
  } catch {$('favorite-action-status').textContent=t('Favori dosyası okunamadı. Bu uygulamadan alınmış, 200 KB altındaki JSON yedeğini seç.');}
  finally{$('import-favorites').value='';}
});
window.addEventListener('storage',event=>{
  if(event.key!==favoritesStorageKey||!snapshot)return;
  const next=readFavorites(preferenceStorage);favorites.teams=next.teams;favorites.matches=next.matches;renderMatchList();updateFavoriteButtons();
});
for(const id of ['favorites-only','season','date-from','date-to','venue'])$(id).addEventListener('change',renderMatchList);
function selectLeague(renderSelection=true) {
  available=filterMatches(leagueMatches());
  $('team').replaceChildren(new Option(t('Tüm takımlar'),''),...teamsFor(available).map(team=>new Option(team.name,team.id)));
  $('team-search').value='';$('season').value='';seasonOptions();
  $('match').replaceChildren(...available.map(d=>new Option(`${d.match.date.slice(0,10)} · ${d.match.home} ${d.home_score}–${d.away_score} ${d.match.away}`,d.match.id)));
  renderMatchList();if(renderSelection)render();
}
function clearFilters() {$('team').value='';$('team-search').value='';$('season').value='';$('venue').value='';$('date-from').value='';$('date-to').value='';$('favorites-only').checked=false;renderMatchList();}
$('team').addEventListener('change',renderMatchList);
$('team-search').addEventListener('input',renderMatchList);
$('reset-filters').addEventListener('click',clearFilters);
$('clear-search').addEventListener('click',()=>{clearFilters();$('team-search').focus();});
function setupShotFilters(d,changed) {
  const team=$('shot-team').value,period=$('shot-period').value,player=$('shot-player').value;
  $('shot-team').replaceChildren(new Option(t('İki takım'),''),new Option(d.match.home,'home'),new Option(d.match.away,'away'));
  $('shot-period').replaceChildren(new Option(t('Tüm devreler'),''),new Option(t('İlk yarı'),'1'),new Option(t('İkinci yarı'),'2'),...(d.duration>90?[new Option(t('Uzatma'),'extra')]:[]));
  $('shot-player').replaceChildren(new Option(t('Tüm oyuncular'),''),...[...new Set(d.shots.map(shot=>shot.player))].sort((a,b)=>a.localeCompare(b,locale())).map(name=>new Option(name,name)));
  $('shot-team').value=changed?'':team;$('shot-period').value=changed?'':period;$('shot-player').value=changed?'':player;
  if(changed){$('shot-outcome').value='';$('shot-sort').value='time';}
}
function drawPitch(d) {
  const m=d.match;
  $('legend').replaceChildren(el('span',`● ${m.home} →`),el('span',`← ${m.away} ●`));
  const pitch=graphic('pitch','-3 -3 126 86',t('Şutların xG değerleri ve sahadaki konumları'));pitch.append(svgNode('rect',{width:120,height:80,fill:'#18372d',rx:1}));
  for(const [x,y,w,h] of [[0,0,120,80],[0,18,18,44],[102,18,18,44],[0,30,6,20],[114,30,6,20]])pitch.append(svgNode('rect',{x,y,width:w,height:h,fill:'none',stroke:'#73988b','stroke-width':.3}));
  pitch.append(svgNode('line',{x1:60,x2:60,y1:0,y2:80,stroke:'#73988b','stroke-width':.3}),svgNode('circle',{cx:60,cy:40,r:9.15,fill:'none',stroke:'#73988b','stroke-width':.3}));
  const filtered=filterShots(d,{team:$('shot-team').value,period:$('shot-period').value,outcome:$('shot-outcome').value,player:$('shot-player').value,sort:$('shot-sort').value});
  $('shot-summary').textContent=t`${filtered.length} / ${d.shots.length} şut gösteriliyor.`;
  pitch.setAttribute('role','group');pitch.setAttribute('aria-describedby','shot-keyboard-help');
  let missing=0;
  for(const s of filtered){const position=pitchPosition(s,m);if(!position){missing++;continue;}const side=s.team_id===m.home_id?0:1;
    const label=`${s.player||t('Oyuncu bilgisi yok')} · ${s.minute}${s.added_minutes?'+'+s.added_minutes:''}′ · xG ${dec(s.xg)} · ${t(outcomeLabel(s.outcome))}`;
    const marker=s.outcome==='Goal'?svgNode('text',{x:position.x,y:position.y,'text-anchor':'middle','dominant-baseline':'central','font-size':4+8*Math.sqrt(s.xg),fill:side===0?'#7abaff':'#ffd08c'}):svgNode('circle',{cx:position.x,cy:position.y,r:1+3*Math.sqrt(s.xg),fill:side===0?'#7abaff':'#ffd08c','fill-opacity':.75});
    if(s.outcome==='Goal')marker.textContent='★';marker.setAttribute('class','shot');marker.dataset.team=side===0?'home':'away';marker.dataset.goal=String(s.outcome==='Goal');marker.dataset.index=String(s.index);marker.setAttribute('tabindex','0');marker.setAttribute('role','button');marker.setAttribute('aria-label',label);
    const title=svgNode('title');title.textContent=label;marker.append(title);const show=()=>{$('shot-detail').textContent=label;for(const node of pitch.querySelectorAll('.shot'))node.classList.toggle('selected-shot',node===marker);};marker.addEventListener('click',show);marker.addEventListener('focus',show);marker.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}});pitch.append(marker);
  }
  pitch.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const markers=[...pitch.querySelectorAll('.shot')],current=event.target.closest('.shot'),index=markers.indexOf(current);if(index<0)return;
    const next=event.key==='Home'?0:event.key==='End'?markers.length-1:Math.max(0,Math.min(markers.length-1,index+(event.key==='ArrowRight'?1:-1)));
    event.preventDefault();markers[next]?.focus();
  });
  $('shot-detail').textContent=!filtered.length?t('Bu filtrelerle şut bulunamadı.'):missing?t`${missing} şutun konumu yok; xG hesabına dahil edildi.`:t('Bir şut seç.');
  const table=el('table'),head=el('tr');
  for(const label of [t('Dakika'),t('Oyuncu'),t('Takım'),t('Sonuç'),'xG'])head.append(el('th',label));
  const thead=el('thead'),tbody=el('tbody');thead.append(head);table.append(thead,tbody);
  for(const shot of filtered){
    const row=el('tr'),minute=el('td'),button=el('button',`${shot.minute}${shot.added_minutes?'+'+shot.added_minutes:''}′`);button.type='button';
    button.setAttribute('aria-label',t`${shot.player}: şut detayını göster`);
    button.onclick=()=>{
      const marker=pitch.querySelector(`[data-index="${shot.index}"]`);
      if(marker){marker.dispatchEvent(new Event('click'));marker.focus();}
      else $('shot-detail').textContent=t`${shot.player}: bu şutun konumu kaynakta bulunmuyor.`;
    };
    minute.append(button);row.append(minute,el('td',shot.player||t('Oyuncu bilgisi yok')),el('td',shot.team_id===m.home_id?m.home:m.away),el('td',t(outcomeLabel(shot.outcome))),el('td',dec(shot.xg)));tbody.append(row);
  }
  $('shot-table').replaceChildren(table);
}
for(const id of ['shot-team','shot-period','shot-player','shot-outcome','shot-sort'])$(id).addEventListener('change',()=>{const d=available.find(d=>String(d.match.id)===selectedId);if(d)drawPitch(d);});
function focusShot(record,index) {
  for(const id of ['shot-team','shot-period','shot-player','shot-outcome'])$(id).value='';
  drawPitch(record);
  const marker=$('pitch').querySelector(`[data-index="${index}"]`);
  if(marker){marker.focus();marker.dispatchEvent(new Event('click'));}
  else $('shot-detail').textContent=t('Bu şutun konumu kaynakta bulunmuyor.');
  $('shot-map').scrollIntoView({block:'start'});
}
function renderGoals(record) {
  const goals=goalEvents(record);$('goal-events-empty').hidden=goals.length>0;$('goal-own-note').hidden=!(record.home_fixed||record.away_fixed);
  $('goal-events').replaceChildren(...goals.map(shot=>{
    const team=shot.team_id===record.match.home_id?record.match.home:record.match.away;
    const button=el('button','','goal-event');button.type='button';
    button.append(el('b',`${shot.minute}${shot.added_minutes?'+'+shot.added_minutes:''}′`),el('span',`${shot.player||t('Oyuncu bilgisi yok')} · ${team}`),el('strong',`${dec(shot.xg)} xG`));
    button.setAttribute('aria-label',t`${shot.player} · ${team}: golün şut detayını göster`);button.onclick=()=>focusShot(record,shot.index);return button;
  }));
}
function render(loadJob=true) {
  const d=available.find(d=>String(d.match.id)===$('match').value); if(!d)return;
  const changed=selectedId!==String(d.match.id);
  if(changed){stopPolling();viewer.close();waitingIndex=0;$('export-status').textContent='';} selectedId=String(d.match.id);
  const m=d.match, home=d.shots.filter(s=>s.team_id===m.home_id), away=d.shots.filter(s=>s.team_id===m.away_id);
  const a=analyze(home.map(s=>s.xg),away.map(s=>s.xg),d.home_fixed,d.away_fixed);
  const sums=[home,away].map(shots=>shots.reduce((total,s)=>total+s.xg,0));
  markSelectedMatch();updateFavoriteButtons();
  const initials=name=>name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toLocaleUpperCase('tr-TR');
  $('home-mark').textContent=initials(m.home);$('away-mark').textContent=initials(m.away);
  $('home').textContent=m.home; $('away').textContent=m.away; $('score').textContent=`${d.home_score} – ${d.away_score}`;
  $('competition').textContent=`${m.competition} · ${m.season}`;
  $('date').textContent=new Date(`${m.date.slice(0,10)}T12:00:00`).toLocaleDateString(locale(),{day:'numeric',month:'long',year:'numeric'});
  const actual=a.scores.find(s=>s.home===d.home_score&&s.away===d.away_score)?.probability||0;
  $('metrics').replaceChildren(...[
    [t('Şutlardan toplam xG'),`${dec(sums[0])} – ${dec(sums[1])}`,t('Ev sahibi – deplasman')],
    [t('Şut sayısı'),`${home.length} – ${away.length}`,t('Analize dahil edilen şutlar')],
    [t('Gerçek skorun olasılığı'),pct(actual),t`${d.home_score}–${d.away_score} sonucu`],
    [t('En olası skor'),`${a.scores[0].home} – ${a.scores[0].away}`,t`${pct(a.scores[0].probability)} olasılıkla`]
  ].map(([label,value,note])=>{const box=el('div','','metric');box.append(el('span',label),el('strong',value),el('small',note));return box;}));
  $('outcomes').replaceChildren(...[[m.home,a.win,colors[0]],[t('Beraberlik'),a.draw,'#94a0b1'],[m.away,a.loss,colors[1]]].map(([name,p,color])=>{const box=el('div','','outcome'),label=el('div','','label'),bar=el('div','','bar'),fill=el('i','');label.append(el('span',name),el('b',pct(p)));fill.style.width=`${p*100}%`;fill.style.background=color;bar.append(fill);box.append(label,bar);return box;}));
  renderStory(d,a,sums);
  const table=document.createElement('table'),head=document.createElement('tr');head.append(el('th',t('Ev ↓ / Dep →')));
  table.setAttribute('aria-label',t`${m.home} – ${m.away}: olası skor dağılımı`);
  const caption=el('caption',t('Satırlar ev sahibi, sütunlar deplasman gol sayısını gösterir.'),'sr-only');table.append(caption);
  const hn=Math.min(9,a.h.length),an=Math.min(9,a.a.length),max=a.scores[0].probability;
  for(let j=0;j<an;j++){const heading=el('th',String(j));heading.scope='col';head.append(heading);};table.append(head);let shown=0;
  for(let i=0;i<hn;i++){const row=document.createElement('tr');const heading=el('th',String(i));heading.scope='row';row.append(heading);for(let j=0;j<an;j++){const p=a.h[i]*a.a[j];shown+=p;const cell=el('td',pct(p));cell.style.background=`rgba(23,104,197,${0.04+0.35*p/max})`;cell.title=`${i}–${j}: ${pct(p)}`;if(i===d.home_score&&j===d.away_score){cell.style.outline='2px solid var(--text)';cell.setAttribute('aria-label',t`Gerçek skor ${i}–${j}: ${pct(p)}`);}row.append(cell);}table.append(row);}
  $('heatmap').replaceChildren(table);$('tail').textContent=t`Koyu çerçeve gerçek skor. Görünüm dışında kalan olasılık: ${pct(Math.max(0,1-shown))}.`;
  $('top').replaceChildren(...a.scores.filter(s=>s.probability>0).slice(0,5).map(s=>{const row=el('div','','toprow');row.append(el('b',`${s.home} – ${s.away}`),el('span',pct(s.probability)));return row;}));
  setupShotFilters(d,changed);drawPitch(d);
  const timeline=graphic('timeline','0 0 620 230',t('İki takımın maç boyunca birikimli xG grafiği')),ymax=Math.max(...sums,1)*1.15,x=t=>45+t/d.timeline_end*550,y=v=>190-v/ymax*155;
  for(let i=0;i<=4;i++){const v=ymax*i/4;timeline.append(svgNode('line',{x1:45,x2:595,y1:y(v),y2:y(v),stroke:'var(--line)'}));const label=svgNode('text',{x:6,y:y(v)+4,fill:'var(--muted)','font-size':11});label.textContent=dec(v);timeline.append(label);}
  for(const t of [0,...d.period_boundaries,d.timeline_end]){timeline.append(svgNode('line',{x1:x(t),x2:x(t),y1:35,y2:190,stroke:'var(--line)','stroke-dasharray':'4 4'}));const label=svgNode('text',{x:x(t),y:213,fill:'var(--muted)','font-size':11,'text-anchor':'middle'});label.textContent=`${Math.round(t)}′`;timeline.append(label);}
  [home,away].forEach((shots,side)=>{let total=0,path=`M ${x(0)} ${y(0)}`;for(const s of shots){path+=` H ${x(s.elapsed_minutes)} V ${y(total+=s.xg)}`;if(s.outcome==='Goal'){timeline.append(svgNode('circle',{cx:x(s.elapsed_minutes),cy:y(total),r:4,fill:colors[side]}));}}path+=` H ${x(d.timeline_end)}`;timeline.append(svgNode('path',{d:path,fill:'none',stroke:colors[side],'stroke-width':2.5}));});
  renderGoals(d);
  $('warnings').textContent=d.warnings.map(warning=>language()==='tr'?warning:t(warning)===warning?'A source data warning is available in Turkish: '+warning:t(warning)).join(' ');
  const link=el('a',d.source_name);link.href=d.source_url;link.target='_blank';link.rel='noopener noreferrer';$('source').replaceChildren(t('Maç verisi: '),link,'.');
  $('statsbomb').hidden=d.source_name!=='StatsBomb Open Data';
  if(!$('statsbomb').hidden){const license=el('a',t('StatsBomb veri lisansı'));license.href='data/STATSBOMB_LICENSE.pdf';$('source').append(' ',license);}
  $('updated').textContent=t`Veri dosyası güncellendi: ${new Date(snapshot.updated_at).toLocaleString(locale())}${d.retrieved_at?t(' · Maç verisi alındı: ')+new Date(d.retrieved_at).toLocaleString(locale()):''}`;
  $('analysis').hidden=false;renderCoverage();renderDataCoverage();renderComparison();document.title=`${m.home} ${d.home_score}–${d.away_score} ${m.away} · Goal Illusion`;
  const url=new URL(location.href);url.searchParams.set('match',m.id);url.searchParams.set('lang',language());history.replaceState(null,'',url);
  if(loadJob&&aiEndpoint&&!hasStory(d)){stopPolling();refreshJob(d);}
}
function downloadText(content,name,type) {
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),link=el('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function downloadData(kind) {
  const record=available.find(d=>String(d.match.id)===selectedId);if(!record)return;
  const context={datasetUpdatedAt:snapshot.updated_at,fingerprint:storyFor(record)?.facts?.fingerprint};
  const content=kind==='json'?JSON.stringify(analysisDocument(record,context),null,2):kind==='shots'?shotsCsv(record):summaryCsv(record);
  const name=`goal-illusion-${record.match.id}-${kind}.${kind==='json'?'json':'csv'}`;
  downloadText(content,name,kind==='json'?'application/json;charset=utf-8':'text/csv;charset=utf-8');
  $('export-status').textContent=t`${name} indirmesi başlatıldı.`;
}
$('export-json').onclick=()=>downloadData('json');$('export-shots').onclick=()=>downloadData('shots');$('export-summary').onclick=()=>downloadData('summary');
function renderDataCoverage() {
  const entries=snapshot.coverage||[];$('coverage-unavailable').hidden=entries.length>0;
  $('coverage-updated').textContent=t`Son veri güncellemesi: ${new Date(snapshot.updated_at).toLocaleString(locale())}`;
  const states={ok:t('Tam'),partial:t('Kısmi'),unavailable:t('Kaynak erişilemiyor')};
  $('coverage-rows').replaceChildren(...entries.map(entry=>{
    const catalog=snapshot.catalog?.find(league=>league.id===entry.id),row=el('tr'),name=el('th');name.scope='row';
    const link=el('a',leagueLabel(snapshot.matches,String(entry.id),snapshot.catalog));link.href=`https://www.fotmob.com/leagues/${entry.id}/overview/${catalog?.source_slug||''}`;link.target='_blank';link.rel='noopener noreferrer';name.append(link);
    row.append(name,el('td',entry.season||'—'),el('td',String(entry.available??'—')),el('td',String(entry.completed??'—')),el('td',states[entry.status]||t('Bilinmiyor')));return row;
  }));
}
$('coverage-link').onclick=()=>{$('data-coverage').open=true;};
function compareTitle(d) {return `${d.match.date.slice(0,10)} · ${d.match.home} ${d.home_score}–${d.away_score} ${d.match.away}`;}
function renderComparison() {
  if(!snapshot||!$('comparison').open)return;
  const current=available.find(d=>String(d.match.id)===selectedId);if(!current)return;
  const previous=$('compare-match').value||new URL(location.href).searchParams.get('compare');
  const candidates=filterMatches(snapshot.matches,{query:$('compare-search').value}).filter(d=>String(d.match.id)!==selectedId);
  $('compare-match').replaceChildren(...candidates.map(d=>new Option(compareTitle(d),d.match.id)));
  if(candidates.some(d=>String(d.match.id)===previous))$('compare-match').value=previous;
  const other=candidates.find(d=>String(d.match.id)===$('compare-match').value);
  $('comparison-empty').hidden=!!other;$('compare-match').disabled=!other;$('export-comparison').disabled=!other;$('comparison-export-status').textContent='';
  $('export-comparison').onclick=()=>{if(!other)return;const name=`goal-illusion-compare-${current.match.id}-${other.match.id}.csv`;downloadText(comparisonCsv([current,other]),name,'text/csv;charset=utf-8');$('comparison-export-status').textContent=t`${name} indirmesi başlatıldı.`;};
  $('comparison-model-note').hidden=!other||current.source_name===other.source_name;
  $('comparison-table').replaceChildren();
  const url=new URL(location.href);if(other)url.searchParams.set('compare',other.match.id);else url.searchParams.delete('compare');history.replaceState(null,'',url);
  if(!other)return;
  const left=matchMetrics(current),right=matchMetrics(other),table=el('table'),thead=el('thead'),head=el('tr'),tbody=el('tbody');
  head.append(el('th',t('İstatistik')),el('th',compareTitle(current)),el('th',compareTitle(other)));thead.append(head);
  const optional=value=>value===null?t('Tanımsız'):dec(value);
  const rows=[
    [t('Skor'),m=>`${m.home.goals} – ${m.away.goals}`],
    [t('Ev sahibi xG'),m=>dec(m.home.xg)],[t('Deplasman xG'),m=>dec(m.away.xg)],
    [t('Şut sayısı'),m=>`${m.home.shots} – ${m.away.shots}`],
    [t('Şut başına xG'),m=>`${optional(m.home.xgPerShot)} – ${optional(m.away.xgPerShot)}`],
    [t('Gerçek skorun olasılığı'),m=>pct(m.actualScoreProbability)],
    [t('Ev sahibi galibiyet olasılığı'),m=>pct(m.outcomes.home)],
    [t('Beraberlik olasılığı'),m=>pct(m.outcomes.draw)],
    [t('Deplasman galibiyet olasılığı'),m=>pct(m.outcomes.away)],
    [t('En olası skor'),m=>`${m.mostLikelyScore.home} – ${m.mostLikelyScore.away}`],
  ];
  for(const [label,format] of rows){const row=el('tr'),heading=el('th',label);heading.scope='row';row.append(heading,el('td',format(left)),el('td',format(right)));tbody.append(row);}
  for(const cell of head.children)cell.scope='col';table.append(thead,tbody);$('comparison-table').append(table);
}
$('compare-link').onclick=()=>{$('comparison').open=true;renderComparison();};
$('comparison').addEventListener('toggle',()=>{
  if($('comparison').open)renderComparison();
  else{const url=new URL(location.href);url.searchParams.delete('compare');history.replaceState(null,'',url);}
});
for(const id of ['compare-search','compare-match'])$(id).addEventListener(id==='compare-search'?'input':'change',renderComparison);
function relocalizeControls() {
  translatePage();refreshPwaLabels();updateNetworkNote();$('language').value=language();
  const league=$('league').value,team=$('team').value;
  $('league').replaceChildren(...leagueOptions());$('league').value=league;
  $('team').replaceChildren(new Option(t('Tüm takımlar'),''),...teamsFor(available).map(team=>new Option(team.name,team.id)));$('team').value=team;
  $('share').textContent=t('Maçı paylaş ↗');seasonOptions();renderMatchList();
}
function chooseMatch(id,{push=true}={}) {
  const record=snapshot.matches.find(record=>String(record.match.id)===String(id));if(!record)return;
  if(!available.some(record=>String(record.match.id)===String(id))){$('league').value=leagueKey(record);selectLeague(false);}
  const url=new URL(location.href);url.searchParams.set('match',record.match.id);url.searchParams.set('lang',language());
  if(push&&String(id)!==selectedId)history.pushState(null,'',url);
  $('match').value=record.match.id;$('route-notice').hidden=true;render();
}
function restoreLocation() {
  if(!snapshot)return;
  const url=new URL(location.href),id=url.searchParams.get('match'),record=snapshot.matches.find(d=>String(d.match.id)===id);
  stopPolling();viewer.close();
  if(['tr','en'].includes(url.searchParams.get('lang'))){setLanguage(url.searchParams.get('lang'));relocalizeControls();}
  const compare=url.searchParams.get('compare');
  $('comparison').open=snapshot.matches.some(d=>String(d.match.id)===compare&&String(d.match.id)!==id);
  $('compare-search').value='';$('compare-match').replaceChildren();
  if(record)chooseMatch(record.match.id,{push:false});
  else{$('route-notice').hidden=false;$('route-notice').textContent=t('Bağlantıdaki maç mevcut veri paketinde bulunamadı.');}
}
window.addEventListener('popstate',restoreLocation);
$('language').addEventListener('change',()=>{stopPolling();viewer.close();setLanguage($('language').value);relocalizeControls();render();});
$('league').addEventListener('change',()=>{selectLeague(false);chooseMatch($('match').value);});
$('match').addEventListener('change',()=>chooseMatch($('match').value));
$('match-list').addEventListener('keydown',event=>{
  const current=event.target.closest('.match-row');if(!current||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const rows=[...$('match-list').querySelectorAll('.match-row')],index=rows.indexOf(current);
  const next=event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)));
  event.preventDefault();rows[next]?.focus();
});
$('share').addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:'Goal Illusion',url:location.href});else{await navigator.clipboard.writeText(location.href);$('share').textContent=t('Bağlantı kopyalandı ✓');}}catch{ $('status').textContent=t('Paylaşmak için adres çubuğundaki bağlantıyı kopyalayabilirsin.');}});
try{
 const bundle=await loadAnalysisBundle();snapshot=bundle.snapshot;stories=bundle;cachedBundle=bundle.cache_status==='cached';updateNetworkNote();
 const leagues=[...new Set(snapshot.matches.map(d=>String(d.league_id||'example')))];
 $('league').replaceChildren(...leagueOptions());
 const requestedId=new URL(location.href).searchParams.get('match');
 const requested=snapshot.matches.find(d=>String(d.match.id)===requestedId);
 $('league').value=requested?String(requested.league_id||'example'):(leagues.includes('71')?'71':leagues[0]);selectLeague(false);
 if(requested)$('match').value=requested.match.id;render();
 if(!requested&&requestedId){$('route-notice').hidden=false;$('route-notice').textContent=t('Bağlantıdaki maç mevcut veri paketinde bulunamadı.');}
 if(snapshot.matches.some(d=>String(d.match.id)===new URL(location.href).searchParams.get('compare')&&String(d.match.id)!==selectedId)){$('comparison').open=true;renderComparison();}
 const configResponse=await fetch('data/site.json');if(configResponse.ok){const config=await configResponse.json();if(config.ai_endpoint){const endpoint=new URL(config.ai_endpoint);if(endpoint.protocol==='https:'||endpoint.hostname==='localhost'||endpoint.hostname==='127.0.0.1')aiEndpoint=endpoint.href.replace(/\/$/,'');}if(config.repository){$('repo').href=config.repository;$('repo').hidden=false;}render();}
}catch(error){$('status').textContent=t`Veriler yüklenemedi. Sayfayı yenileyip tekrar dene. ${error.message}`;}
