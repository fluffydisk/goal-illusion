import {analyze} from './math.mjs';
import {ACTIVE, progressText, analysisRequest} from './ai-client.mjs?v=studio1';
import {loadAnalysisBundle, consistentAnalysis} from './analysis-data.mjs';
import {readyStory} from './story-presentation.mjs';
import {matchColors} from './team-colors.mjs';
import {createStoryViewer} from './story-viewer.mjs';
const $ = id => document.getElementById(id);
const pct = n => new Intl.NumberFormat('tr-TR',{style:'percent',maximumFractionDigits:1}).format(n);
const dec = n => n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
const colors = ['#6de4ae','#77b5f5'];
function el(tag, text, className) { const e=document.createElement(tag); e.textContent=text; if(className)e.className=className; return e; }
function svgNode(tag,attrs={}) { const e=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v); return e; }
function graphic(container,viewBox,label) {const svg=svgNode('svg',{viewBox,role:'img','aria-label':label}); $(container).replaceChildren(svg);return svg;}
let snapshot, available, stories, aiEndpoint='';
const dynamicStories=new Map(), jobs=new Map();
let selectedId, pollTimer, clockTimer, activeRequest;
const viewer=createStoryViewer();
let waitingIndex=0;
$('open-story').onclick=()=>{const d=available.find(d=>String(d.match.id)===selectedId);if(d&&hasStory(d))viewer.open(storyFor(d),d);};
$('next-fact').onclick=()=>{waitingIndex++;const d=available.find(d=>String(d.match.id)===selectedId);if(d)jobWidget(d);};
function stopPolling() {clearTimeout(pollTimer);clearInterval(clockTimer);activeRequest?.abort();}
function jobWidget(d) {
  const id=String(d.match.id), job=jobs.get(id), ready=hasStory(d);
  const active=!!job&&ACTIVE.has(job.status);
  $('story').classList.toggle('is-creating',active);
  $('ai-controls').hidden=ready;
  $('ai-progress').hidden=!job||!ACTIVE.has(job.status);
  $('generate-ai').hidden=!!job&&ACTIVE.has(job.status);
  $('generate-ai').disabled=!aiEndpoint||(!active&&job?.retry_at>Date.now());
  $('generate-ai').textContent=job&&['failed','rate_limited'].includes(job.status)?'Yeniden dene':'AI Review oluştur';
  $('ai-message').textContent=!aiEndpoint?'İstek üzerine analiz servisi henüz bağlanmadı.':job?.error||'Maçın akışı, önemli fırsatlar ve AI değerlendirmesi. Bir kez oluşturulur, yeniden okunabilir.';
  if(job?.retry_at>Date.now()&&!active)$('ai-message').textContent+=' Birazdan tekrar deneyebilirsin.';
  $('ai-phase').textContent=job?.connection_lost?'Bağlantı yeniden kuruluyor':job?.status==='submitting'?'Hikâyen için hazırlanıyoruz':job?.phase||'';
  $('ai-message').hidden=active;
  $('waiting-facts').hidden=!job||!ACTIVE.has(job.status);
  const notes=(storyFor(d)?.facts?.evidence||[]).filter(e=>!e.id.startsWith('shot_'));
  $('waiting-fact').textContent=notes.length?notes[waitingIndex%notes.length].text:'';
  $('waiting-count').textContent=notes.length?`${waitingIndex%notes.length+1} / ${notes.length}`:'';
  $('waiting-facts').hidden=!active||!notes.length;
  function tick() {
    if (!active) { $('generate-ai').disabled=!aiEndpoint||job?.retry_at>Date.now();return; }
    const text=progressText(job);$('ai-elapsed').textContent=text.elapsed;$('ai-estimate').textContent=job.connection_lost?(job.status==='submitting'?'İsteğinin durumunu kontrol ediyoruz. Yeniden tıklamana gerek yok.':'İşlem sunucuda devam ediyor. Durumu otomatik kontrol ediyoruz.'):text.remaining;
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
  const id=String(d.match.id); activeRequest?.abort();
  const controller=new AbortController();activeRequest=controller;
  try {
    const {result,data}=await consistentAnalysis({record:d,item:storyFor(d)},
      data=>analysisRequest(aiEndpoint,id,method,controller.signal,data.item.facts.fingerprint),
      async()=>{
        const bundle=await loadAnalysisBundle(controller.signal);
        controller.signal.throwIfAborted();
        if(selectedId!==id)throw new DOMException('Match changed','AbortError');
        snapshot=bundle.snapshot;stories=bundle;dynamicStories.clear();jobs.clear();
        available=snapshot.matches.filter(record=>String(record.league_id||'example')===$('league').value).sort((a,b)=>b.match.date.localeCompare(a.match.date));
        const record=available.find(record=>String(record.match.id)===id);
        if(!record)throw new Error('Bu maç güncel veri paketinde bulunamadı.');
        render(false);
        return {record,item:storyFor(record)};
      });
    controller.signal.throwIfAborted();
    if(selectedId!==id||activeRequest!==controller)return;
    d=data.record;
    jobs.set(id,result);
    if (result.status==='ready') {
      const fresh={...storyFor(d),status:'ready',narrative:result.narrative};
      if(!readyStory(fresh))throw new Error('AI Review servisi güncelleniyor. Yeni hikâye henüz kullanılamıyor.');
      dynamicStories.set(id,fresh);
    }
    const m=d.match,home=d.shots.filter(s=>s.team_id===m.home_id),away=d.shots.filter(s=>s.team_id===m.away_id);
    renderStory(d,analyze(home.map(s=>s.xg),away.map(s=>s.xg),d.home_fixed,d.away_fixed),[home,away].map(ss=>ss.reduce((n,s)=>n+s.xg,0)));
    if(result.status==='ready'){renderCoverage();const option=[...$('match').options].find(o=>o.value===id);if(option&&!option.text.endsWith('AI ✓'))option.text+=' · AI ✓';}
    if (ACTIVE.has(result.status)) pollTimer=setTimeout(()=>refreshJob(d),4000);
  } catch(error) {
    if (controller.signal.aborted||error.name==='AbortError'||selectedId!==id||activeRequest!==controller) return;
    // A lost poll/POST response is not a failed server job. Reconcile via GET;
    // never submit a second generation simply because the connection dropped.
    const previous=jobs.get(id);
    if(previous&&ACTIVE.has(previous.status)){
      jobs.set(id,{...previous,connection_lost:true});jobWidget(d);
      pollTimer=setTimeout(()=>refreshJob(d),8000);
    }else{
      jobs.set(id,{status:'failed',error:'Bağlantı kurulamadı. Durumu tekrar kontrol edebilirsin.'});
      jobWidget(d);
    }
  }
}
$('generate-ai').addEventListener('click',()=>{
  const d=available.find(d=>String(d.match.id)===$('match').value);if(!d||$('generate-ai').disabled||ACTIVE.has(jobs.get(String(d.match.id))?.status))return;
  jobs.set(String(d.match.id),{status:'submitting',phase:'İstek gönderiliyor…',started_at:Date.now(),updated_at:Date.now()});
  jobWidget(d);
  $('generate-ai').disabled=true;
  clearTimeout(pollTimer);refreshJob(d,'POST');
});
function storyFor(d) {return dynamicStories.get(String(d.match.id))||stories?.stories?.[d.match.id];}
function hasStory(d) {return readyStory(storyFor(d));}
function renderStory(d, a, sums) {
  const item=storyFor(d);
  const facts=item?.facts, valid=hasStory(d), prose=valid?item.narrative:null;
  const [homeAccent,awayAccent]=matchColors(d.match);
  $('story').style.setProperty('--home-accent',homeAccent);
  $('story').style.setProperty('--away-accent',awayAccent);
  $('story-label').textContent='AI REVIEW · MAÇIN HİKÂYESİ';
  $('story-match').textContent=`${d.match.home} ${d.home_score}–${d.away_score} ${d.match.away}`;
  $('story-headline').textContent=valid?prose.headline:'Son düdükten sonra, maçın hikâyesi.';
  $('story-explanation').textContent=valid?prose.summary:'Fırsatlar nasıl gelişti? Hangi pozisyonlar öne çıktı? Skor bize ne anlatıyor? Maçı bölüm bölüm keşfet.';
  $('open-story').hidden=!valid;
  jobWidget(d);
  const evidence=facts?.evidence||[
    {id:'chances',label:'Üretilen fırsatların kalitesi',text:`${d.match.home}: ${dec(sums[0])} xG · ${d.match.away}: ${dec(sums[1])} xG.`},
    {id:'outcomes',label:'Aynı şutlarla olası sonuçlar',text:`${d.match.home} galibiyeti ${pct(a.win)}, beraberlik ${pct(a.draw)}, ${d.match.away} galibiyeti ${pct(a.loss)}.`}
  ];
  $('all-evidence').replaceChildren(...evidence.map(e=>{const box=el('article','','evidence');box.append(el('h3',e.label),el('p',e.text));return box;}));
  $('story-note').textContent=valid?'Veriye dayalı AI hikâyesi · Her bölümde ilgili kanıtları inceleyebilirsin.':'Şutlara dayalı analiz, tüm oyun performansını ölçmez.';
  $('insight').textContent=valid?prose.summary:'Bu dağılım gerçekleşmiş şutlara koşulludur; maç öncesi tahmin veya kesin bir hak edilen skor değildir.';
}
function renderCoverage(){$('status').textContent=`${available.length} maç · ${available.filter(hasStory).length} AI yorumu hazır · ${snapshot.issues.length?`${snapshot.issues.length} maç/kaynak verisi güncellemede alınamadı; mevcut doğrulanmış maçlar gösteriliyor.`:'Tamamlanmış ve şut bazlı xG bulunan maçlar.'}`;}
function selectLeague() {
  available=snapshot.matches.filter(d=>String(d.league_id||'example')===$('league').value).sort((a,b)=>b.match.date.localeCompare(a.match.date));
  $('match').replaceChildren(...available.map(d=>new Option(`${d.match.date.slice(0,10)} · ${d.match.home} ${d.home_score}–${d.away_score} ${d.match.away}${hasStory(d)?' · AI ✓':''}`,d.match.id)));
  render();
}
function render(loadJob=true) {
  const d=available.find(d=>String(d.match.id)===$('match').value); if(!d)return;
  const changed=selectedId!==String(d.match.id);
  if(changed){stopPolling();viewer.close();waitingIndex=0;} selectedId=String(d.match.id);
  const m=d.match, home=d.shots.filter(s=>s.team_id===m.home_id), away=d.shots.filter(s=>s.team_id===m.away_id);
  const a=analyze(home.map(s=>s.xg),away.map(s=>s.xg),d.home_fixed,d.away_fixed);
  const sums=[home,away].map(shots=>shots.reduce((total,s)=>total+s.xg,0));
  $('home').textContent=m.home; $('away').textContent=m.away; $('score').textContent=`${d.home_score} – ${d.away_score}`;
  $('competition').textContent=`${m.competition} · ${m.season}`;
  $('date').textContent=new Date(`${m.date.slice(0,10)}T12:00:00`).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
  const actual=a.scores.find(s=>s.home===d.home_score&&s.away===d.away_score)?.probability||0;
  $('metrics').replaceChildren(...[
    ['Şutlardan toplam xG',`${dec(sums[0])} – ${dec(sums[1])}`,'Ev sahibi – deplasman'],
    ['Şut sayısı',`${home.length} – ${away.length}`,'Analize dahil edilen şutlar'],
    ['Gerçek skorun olasılığı',pct(actual),`${d.home_score}–${d.away_score} sonucu`],
    ['En olası skor',`${a.scores[0].home} – ${a.scores[0].away}`,`${pct(a.scores[0].probability)} olasılıkla`]
  ].map(([label,value,note])=>{const box=el('div','','metric');box.append(el('span',label),el('strong',value),el('small',note));return box;}));
  $('outcomes').replaceChildren(...[[m.home,a.win,colors[0]],['Beraberlik',a.draw,'#bac9c3'],[m.away,a.loss,colors[1]]].map(([name,p,color])=>{const box=el('div','','outcome'),label=el('div','','label'),bar=el('div','','bar'),fill=el('i','');label.append(el('span',name),el('b',pct(p)));fill.style.width=`${p*100}%`;fill.style.background=color;bar.append(fill);box.append(label,bar);return box;}));
  renderStory(d,a,sums);
  const table=document.createElement('table'),head=document.createElement('tr');head.append(el('th','Ev ↓ / Dep →'));
  const hn=Math.min(9,a.h.length),an=Math.min(9,a.a.length),max=a.scores[0].probability;
  for(let j=0;j<an;j++)head.append(el('th',String(j)));table.append(head);let shown=0;
  for(let i=0;i<hn;i++){const row=document.createElement('tr');row.append(el('th',String(i)));for(let j=0;j<an;j++){const p=a.h[i]*a.a[j];shown+=p;const cell=el('td',pct(p));cell.style.background=`rgba(109,228,174,${0.04+0.68*p/max})`;cell.title=`${i}–${j}: ${pct(p)}`;if(i===d.home_score&&j===d.away_score)cell.style.outline='2px solid white';row.append(cell);}table.append(row);}
  $('heatmap').replaceChildren(table);$('tail').textContent=`Beyaz çerçeve gerçek skor. Görünüm dışında kalan olasılık: ${pct(Math.max(0,1-shown))}.`;
  $('top').replaceChildren(...a.scores.filter(s=>s.probability>0).slice(0,5).map(s=>{const row=el('div','','toprow');row.append(el('b',`${s.home} – ${s.away}`),el('span',pct(s.probability)));return row;}));
  $('legend').replaceChildren(el('span',`● ${m.home}`),el('span',`● ${m.away}`));
  const pitch=graphic('pitch','-3 -3 126 86','Şutların xG değerleri ve sahadaki konumları');pitch.append(svgNode('rect',{width:120,height:80,fill:'#18372d',rx:1}));
  for(const [x,y,w,h] of [[0,0,120,80],[0,18,18,44],[102,18,18,44],[0,30,6,20],[114,30,6,20]])pitch.append(svgNode('rect',{x,y,width:w,height:h,fill:'none',stroke:'#73988b','stroke-width':.3}));
  pitch.append(svgNode('line',{x1:60,x2:60,y1:0,y2:80,stroke:'#73988b','stroke-width':.3}),svgNode('circle',{cx:60,cy:40,r:9.15,fill:'none',stroke:'#73988b','stroke-width':.3}));
  let missing=0;
  for(const s of d.shots){if(s.x===null||s.y===null){missing++;continue;}const side=s.team_id===m.home_id?0:1;
    const label=`${s.player} · ${s.minute}${s.added_minutes?'+'+s.added_minutes:''}′ · xG ${dec(s.xg)} · ${s.outcome==='Goal'?'Gol':s.outcome}`;
    const marker=s.outcome==='Goal'?svgNode('text',{x:s.x,y:s.y,'text-anchor':'middle','dominant-baseline':'central','font-size':4+8*Math.sqrt(s.xg),fill:colors[side]}):svgNode('circle',{cx:s.x,cy:s.y,r:1+3*Math.sqrt(s.xg),fill:colors[side],'fill-opacity':.75});
    if(s.outcome==='Goal')marker.textContent='★';marker.setAttribute('class','shot');marker.setAttribute('tabindex','0');marker.setAttribute('role','button');marker.setAttribute('aria-label',label);
    const title=svgNode('title');title.textContent=label;marker.append(title);const show=()=>{$('shot-detail').textContent=label;};marker.addEventListener('click',show);marker.addEventListener('focus',show);marker.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}});pitch.append(marker);
  }
  $('shot-detail').textContent=missing?`${missing} şutun konumu yok; xG hesabına dahil edildi.`:'Bir şut seç.';
  const timeline=graphic('timeline','0 0 620 230','İki takımın maç boyunca birikimli xG grafiği'),ymax=Math.max(...sums,1)*1.15,x=t=>45+t/d.timeline_end*550,y=v=>190-v/ymax*155;
  for(let i=0;i<=4;i++){const v=ymax*i/4;timeline.append(svgNode('line',{x1:45,x2:595,y1:y(v),y2:y(v),stroke:'#334746'}));const label=svgNode('text',{x:6,y:y(v)+4,fill:'#a6b7b4','font-size':11});label.textContent=dec(v);timeline.append(label);}
  for(const t of [0,...d.period_boundaries,d.timeline_end]){timeline.append(svgNode('line',{x1:x(t),x2:x(t),y1:35,y2:190,stroke:'#334746','stroke-dasharray':'4 4'}));const label=svgNode('text',{x:x(t),y:213,fill:'#a6b7b4','font-size':11,'text-anchor':'middle'});label.textContent=`${Math.round(t)}′`;timeline.append(label);}
  [home,away].forEach((shots,side)=>{let total=0,path=`M ${x(0)} ${y(0)}`;for(const s of shots){path+=` H ${x(s.elapsed_minutes)} V ${y(total+=s.xg)}`;if(s.outcome==='Goal'){timeline.append(svgNode('circle',{cx:x(s.elapsed_minutes),cy:y(total),r:4,fill:colors[side]}));}}path+=` H ${x(d.timeline_end)}`;timeline.append(svgNode('path',{d:path,fill:'none',stroke:colors[side],'stroke-width':2.5}));});
  $('warnings').textContent=d.warnings.join(' ');
  const link=el('a',d.source_name);link.href=d.source_url;link.target='_blank';link.rel='noopener noreferrer';$('source').replaceChildren('Maç verisi: ',link,'.');
  $('statsbomb').hidden=d.source_name!=='StatsBomb Open Data';
  if(!$('statsbomb').hidden){const license=el('a','StatsBomb veri lisansı');license.href='data/STATSBOMB_LICENSE.pdf';$('source').append(' ',license);}
  $('updated').textContent=`Veri dosyası güncellendi: ${new Date(snapshot.updated_at).toLocaleString('tr-TR')}${d.retrieved_at?' · Maç verisi alındı: '+new Date(d.retrieved_at).toLocaleString('tr-TR'):''}`;
  $('analysis').hidden=false;renderCoverage();
  const url=new URL(location.href);url.searchParams.set('match',m.id);history.replaceState(null,'',url);
  if(loadJob&&aiEndpoint&&!hasStory(d)){stopPolling();refreshJob(d);}
}
$('league').addEventListener('change',selectLeague);$('match').addEventListener('change',render);
$('share').addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:'Goal Illusion',url:location.href});else{await navigator.clipboard.writeText(location.href);$('share').textContent='Bağlantı kopyalandı ✓';}}catch{ $('status').textContent='Paylaşmak için adres çubuğundaki bağlantıyı kopyalayabilirsin.';}});
try{
 const bundle=await loadAnalysisBundle();snapshot=bundle.snapshot;stories=bundle;
 const leagues=[...new Set(snapshot.matches.map(d=>String(d.league_id||'example')))];
 $('league').replaceChildren(...leagues.map(id=>new Option(id==='71'?'Süper Lig · Türkiye':id==='54'?'Bundesliga · Almanya':'Dünya Kupası · örnek maç',id)));
 const requested=snapshot.matches.find(d=>String(d.match.id)===new URL(location.href).searchParams.get('match'));
 $('league').value=requested?String(requested.league_id||'example'):(leagues.includes('71')?'71':leagues[0]);selectLeague();
 if(requested){$('match').value=requested.match.id;render();}
 const configResponse=await fetch('data/site.json');if(configResponse.ok){const config=await configResponse.json();if(config.ai_endpoint){const endpoint=new URL(config.ai_endpoint);if(endpoint.protocol==='https:'||endpoint.hostname==='localhost'||endpoint.hostname==='127.0.0.1')aiEndpoint=endpoint.href.replace(/\/$/,'');}if(config.repository){$('repo').href=config.repository;$('repo').hidden=false;}render();}
}catch(error){$('status').textContent=`Veriler yüklenemedi. Sayfayı yenileyip tekrar dene. ${error.message}`;}
