import {analyze} from './math.mjs';
const $ = id => document.getElementById(id);
const pct = n => new Intl.NumberFormat('tr-TR',{style:'percent',maximumFractionDigits:1}).format(n);
const dec = n => n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
const colors = ['#6de4ae','#77b5f5'];
function el(tag, text, className) { const e=document.createElement(tag); e.textContent=text; if(className)e.className=className; return e; }
function svgNode(tag,attrs={}) { const e=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v); return e; }
function graphic(container,viewBox,label) {const svg=svgNode('svg',{viewBox,role:'img','aria-label':label}); $(container).replaceChildren(svg);return svg;}
let snapshot, available, stories;
function renderStory(d, a, sums) {
  const item=stories?.source_updated_at===snapshot.updated_at?stories.stories?.[d.match.id]:null;
  const facts=item?.facts, prose=item?.status==='ready'?item.narrative:null;
  const valid=prose&&facts&&prose.fingerprint===facts.fingerprint&&
    typeof prose.headline==='string'&&typeof prose.explanation==='string'&&
    Array.isArray(prose.evidence_ids)&&prose.evidence_ids.length>=2&&
    prose.evidence_ids.every(id=>facts.evidence.some(e=>e.id===id));
  $('story-label').textContent=valid?'MAÇIN HİKÂYESİ · AI YORUMU':'MAÇIN BULGULARI';
  $('story-headline').textContent=valid?prose.headline:'Bu maçın AI yorumu henüz hazır değil.';
  $('story-explanation').textContent=valid?prose.explanation:'Şut verilerinden hesaplanan bulguları ve ayrıntılı analizi aşağıda inceleyebilirsin.';
  const evidence=facts?.evidence||[
    {id:'chances',label:'Üretilen fırsatların kalitesi',text:`${d.match.home}: ${dec(sums[0])} xG · ${d.match.away}: ${dec(sums[1])} xG.`},
    {id:'outcomes',label:'Aynı şutlarla olası sonuçlar',text:`${d.match.home} galibiyeti ${pct(a.win)}, beraberlik ${pct(a.draw)}, ${d.match.away} galibiyeti ${pct(a.loss)}.`}
  ];
  const selected=valid?prose.evidence_ids.map(id=>evidence.find(e=>e.id===id)).filter(Boolean):evidence.slice(0,3);
  $('story-evidence').replaceChildren(...selected.map(e=>{const box=el('article','','evidence');box.append(el('h3',e.label),el('p',e.text));return box;}));
  $('all-evidence').replaceChildren(...evidence.map(e=>{const box=el('article','','evidence');box.append(el('h3',e.label),el('p',e.text));return box;}));
  $('story-note').textContent=valid?'AI yorumu, aşağıdaki şut verilerine dayanır. Sayısal kanıtlar doğrudan hesaplanır; analiz tüm oyun performansını ölçmez.':'Şutlara dayalı analiz, tüm oyun performansını ölçmez.';
  $('insight').textContent=valid?prose.explanation:'Bu dağılım gerçekleşmiş şutlara koşulludur; maç öncesi tahmin veya kesin bir hak edilen skor değildir.';
}
function selectLeague() {
  available=snapshot.matches.filter(d=>String(d.league_id||'example')===$('league').value).sort((a,b)=>b.match.date.localeCompare(a.match.date));
  $('match').replaceChildren(...available.map(d=>new Option(`${d.match.date.slice(0,10)} · ${d.match.home} ${d.home_score}–${d.away_score} ${d.match.away}`,d.match.id)));
  render();
}
function render() {
  const d=available.find(d=>String(d.match.id)===$('match').value); if(!d)return;
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
  $('analysis').hidden=false;$('status').textContent=`${available.length} maç · ${snapshot.issues.length?`${snapshot.issues.length} maç/kaynak verisi güncellemede alınamadı; mevcut doğrulanmış maçlar gösteriliyor.`:'Tamamlanmış ve şut bazlı xG bulunan maçlar.'}`;
  const url=new URL(location.href);url.searchParams.set('match',m.id);history.replaceState(null,'',url);
}
$('league').addEventListener('change',selectLeague);$('match').addEventListener('change',render);
$('share').addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:'Goal Illusion',url:location.href});else{await navigator.clipboard.writeText(location.href);$('share').textContent='Bağlantı kopyalandı ✓';}}catch{ $('status').textContent='Paylaşmak için adres çubuğundaki bağlantıyı kopyalayabilirsin.';}});
try{
 const response=await fetch('data/matches.json');if(!response.ok)throw new Error('Veri dosyası okunamadı');snapshot=await response.json();
 try {const sr=await fetch('data/stories.json');if(sr.ok)stories=await sr.json();}catch{stories=null;}
 const leagues=[...new Set(snapshot.matches.map(d=>String(d.league_id||'example')))];
 $('league').replaceChildren(...leagues.map(id=>new Option(id==='71'?'Süper Lig · Türkiye':id==='54'?'Bundesliga · Almanya':'Dünya Kupası · örnek maç',id)));
 const requested=snapshot.matches.find(d=>String(d.match.id)===new URL(location.href).searchParams.get('match'));
 $('league').value=requested?String(requested.league_id||'example'):(leagues.includes('71')?'71':leagues[0]);selectLeague();
 if(requested){$('match').value=requested.match.id;render();}
 const configResponse=await fetch('data/site.json');if(configResponse.ok){const config=await configResponse.json();if(config.repository){$('repo').href=config.repository;$('repo').hidden=false;}}
}catch(error){$('status').textContent=`Veriler yüklenemedi. Sayfayı yenileyip tekrar dene. ${error.message}`;}
