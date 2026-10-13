import {evidenceFor} from './evidence.mjs';
import {t, locale, language} from './i18n.mjs';
const chartColors=['var(--home)','var(--away)'];
import {cardDuration,sectionLabels} from './story-presentation.mjs';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const number=n=>n.toLocaleString(locale(),{maximumFractionDigits:2});
export function createStoryViewer() {
  const dialog=make('dialog',null,'story-dialog');dialog.setAttribute('aria-labelledby','viewer-title');
  const shell=make('div',null,'viewer-shell'),progress=make('nav',null,'story-segments');progress.setAttribute('aria-label',t('Hikâye bölümleri'));
  const toolbar=make('div',null,'viewer-toolbar'),match=make('span'),pause=make('button',t('Duraklat')),close=make('button',t('Kapat ×'));
  pause.type=close.type='button';toolbar.append(match,pause,close);
  const stage=make('article',null,'story-stage'),label=make('p',null,'eyebrow'),title=make('h2'),body=make('p',null,'story-body'),visual=make('div',null,'story-visual');title.id='viewer-title';
  const evidence=make('details',null,'story-proof'),summary=make('summary',t('Veriye bak')),proof=make('div');evidence.append(summary,proof);
  const footer=make('div',null,'viewer-footer'),prev=make('button',t('← Önceki')),count=make('span'),next=make('button',t('Sonraki →'));prev.type=next.type='button';footer.append(prev,count,next);
  const note=make('p',t('Gerçekleşen şutlara dayalı AI yorumu. Maçın tüm oyun performansını ölçmez.'),'viewer-note');
  stage.append(label,title,body,visual,evidence);shell.append(progress,toolbar,stage,note,footer);dialog.append(shell);document.body.append(dialog);
  let item,record,index=0,elapsed=0,last=0,raf,paused=false,ended=false,origin,touch;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function updatePause(){pause.textContent=paused?t('Oynat'):t('Duraklat');pause.setAttribute('aria-pressed',String(paused));}
  function drawVisual(card) {
    visual.replaceChildren();const f=item.facts;const accents=chartColors;
    const bars=(values,caption)=>{
      visual.append(make('p',caption,'visual-caption'));const max=Math.max(...values.map(v=>v[1]),1);
      values.forEach(([name,value],i)=>{const row=make('div',null,'story-bar-row'),head=make('div');head.append(make('span',name),make('strong',number(value)));const bar=make('div',null,'story-bar'),fill=make('i');fill.style.width=`${value/max*100}%`;fill.style.background=values.length===3?(i===1?'#bac9c3':accents[i===0?0:1]):accents[i];bar.append(fill);row.append(head,bar);visual.append(row);});
    };
    if(card.type==='chances'){
      visual.append(make('p',t('Öne çıkan kayıtlı pozisyonlar'),'visual-caption'));
      const ids=new Set(card.evidence_ids);let events=f.events.filter(e=>ids.has(e.id));
      if(!events.length)events=f.events.filter(e=>f.key_event_ids.includes(e.id));
      for(const e of events.slice(0,3)){const row=make('div',null,'story-event');row.append(make('strong',`${e.minute}${e.added_minutes?'+'+e.added_minutes:''}′`),make('span',`${e.player||t('Oyuncu bilgisi yok')} · ${e.team}`),make('b',`${e.goal?t('Gol · '):''}${number(e.xg)} xG`));visual.append(row);}
      if(!events.length)visual.append(make('p',t('Bu maç için kayıtlı şut bulunmuyor.')));
    } else if(card.type==='verdict'){
      bars([[f.home.name,f.outcomes.home*100],[t('Beraberlik'),f.outcomes.draw*100],[f.away.name,f.outcomes.away*100]],t('Aynı şutlarla sonuç olasılığı (%)'));
    } else if(['first_half','second_half','extra_time'].includes(card.type)){
      const key={first_half:'first_half_xg',second_half:'second_half_xg',extra_time:'extra_time_xg'}[card.type];
      bars([[f.home.name,f.home[key]],[f.away.name,f.away[key]]],t`${t(sectionLabels[card.type])} · toplam xG`);
    } else if(card.type==='match_flow'||card.type==='closing') {
      const ns='http://www.w3.org/2000/svg',node=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
      const svg=node('svg',{viewBox:'0 0 500 155',role:'img','aria-label':t('Maç boyunca biriken xG')}),max=Math.max(f.home.xg,f.away.xg,1),end=record.timeline_end||90;
      svg.append(node('path',{d:'M 15 10 V 130 H 480',fill:'none',stroke:'var(--line)'}));
      [f.home,f.away].forEach((team,i)=>{let sum=0,d='M 15 130';for(const e of f.events.filter(e=>e.team===team.name)){sum+=e.xg;d+=` H ${15+e.elapsed_minutes/end*465} V ${130-sum/max*110}`;}d+=' H 480';svg.append(node('path',{d,fill:'none',stroke:accents[i],'stroke-width':3}));});
      const legend=make('div',null,'story-chart-legend');[f.home,f.away].forEach((t,i)=>{const entry=make('span',`● ${t.name} ${number(t.xg)} xG`);entry.style.color=accents[i];legend.append(entry);});
      visual.append(make('p',t('Maç boyunca biriken xG'),'visual-caption'),svg,legend);
    } else bars([[f.home.name,f.home.xg],[f.away.name,f.away.xg]],t('Üretilen fırsatlar · toplam xG'));
  }
  function paint() {
    const card=item.narrative.cards[index];elapsed=0;ended=false;stage.scrollTop=0;evidence.open=false;
    label.textContent=t`AI YORUMU / ${t(sectionLabels[card.type])}`;title.textContent=card.title;body.textContent=card.text;
    proof.replaceChildren(...card.evidence_ids.map(id=>{const e=evidenceFor(item.facts,language()).find(e=>e.id===id);return make('p',`${e.label}: ${e.text}`);}));
    progress.replaceChildren(...item.narrative.cards.map((c,i)=>{const b=make('button');b.type='button';b.setAttribute('aria-label',`${i+1}. ${t(sectionLabels[c.type])}`);b.setAttribute('aria-current',i===index?'step':'false');const fill=make('i');fill.style.width=i<index?'100%':'0%';b.append(fill);b.onclick=()=>go(i);return b;}));
    count.textContent=`${index+1} / ${item.narrative.cards.length}`;prev.disabled=index===0;next.textContent=index===item.narrative.cards.length-1?t('Baştan izle ↺'):t('Sonraki →');drawVisual(card);updatePause();
  }
  function go(i){index=Math.max(0,Math.min(i,item.narrative.cards.length-1));paint();}
  function frame(t){
    const delta=last?Math.min(t-last,250):0;last=t;
    if(!paused&&!document.hidden&&!evidence.open&&!ended){
      elapsed+=delta;const duration=cardDuration(item.narrative.cards[index]);progress.children[index].firstChild.style.width=`${Math.min(100,elapsed/duration*100)}%`;
      if(elapsed>=duration){if(index<item.narrative.cards.length-1)go(index+1);else{ended=true;paused=true;updatePause();}}
    }
    if(dialog.open)raf=requestAnimationFrame(frame);
  }
  pause.onclick=()=>{paused=!paused;if(ended&&!paused){elapsed=0;ended=false;}updatePause();};
  close.onclick=()=>dialog.close();prev.onclick=()=>go(index-1);next.onclick=()=>{if(index===item.narrative.cards.length-1){paused=reduced.matches;go(0);}else go(index+1);};
  dialog.addEventListener('close',()=>{cancelAnimationFrame(raf);document.body.classList.remove('story-open');origin?.focus();});
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();next.click();}if(e.key==='ArrowLeft'){e.preventDefault();prev.click();}if(e.key===' '&&e.target===dialog){e.preventDefault();pause.click();}});
  stage.addEventListener('touchstart',e=>{touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
  stage.addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy))dx<0?next.click():prev.click();touch=null;},{passive:true});
  document.addEventListener('visibilitychange',()=>{last=0;});
  return {open(newItem,newRecord){
    progress.setAttribute('aria-label',t('Hikâye bölümleri'));close.textContent=t('Kapat ×');summary.textContent=t('Veriye bak');prev.textContent=t('← Önceki');note.textContent=t('Gerçekleşen şutlara dayalı AI yorumu. Maçın tüm oyun performansını ölçmez.');
    item=newItem;record=newRecord;const accents=chartColors;dialog.style.setProperty('--home-accent',accents[0]);dialog.style.setProperty('--away-accent',accents[1]);origin=document.activeElement;index=0;paused=reduced.matches;last=0;match.textContent=`${record.match.home} ${record.home_score}–${record.away_score} ${record.match.away}`;paint();dialog.showModal();document.body.classList.add('story-open');close.focus();raf=requestAnimationFrame(frame);},close(){if(dialog.open)dialog.close();}};
}
