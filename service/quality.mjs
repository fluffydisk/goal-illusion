// The prompt and reviewer contract are exported from the existing Python engine.
function validateShortProse(value, facts, modelFacts, checkTotals=true,language='tr') {
  if (!value || Object.keys(value).sort().join(',') !== 'evidence_ids,explanation,headline') throw new Error('Geçersiz yorum biçimi.');
  const allowed = new Set([0,1,2,facts.home.goals,facts.away.goals]);
  function collect(v) {
    if (typeof v === 'number') for (let n=0;n<=3;n++) allowed.add(Number(v.toFixed(n)));
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  }
  collect(modelFacts);
  collect(facts);
  for (const [key,min,max] of [['headline',8,180],['explanation',30,650]]) {
    const text=value[key];
    if (typeof text !== 'string' || text.trim().length<min || text.trim().length>max) throw new Error('Yorum beklenen uzunlukta değil.');
    if (/fırsat terazisi|dengenin içinden|ayrı bir hikâye|tek yönlülük|tabela[^.]*gizli|ağırlık verdiği sonuç/u.test(text.toLocaleLowerCase('tr-TR'))) throw new Error('Yorum soyut manşet dili içeriyor; bulguyu doğrudan açıkla.');
    let stripped=text;
    for (const team of [facts.home.name,facts.away.name]) stripped=stripped.split(team).join('');
    if(language==='en') {
      let languageText=stripped;
      for(const name of (facts.events||[]).map(event=>event.player).filter(Boolean))languageText=languageText.split(name).join('');
      if(/(?<![\p{L}])(?:şut(?:lar|ların|ları)?|maçın|takımların|fırsatlar|devre|beraberlik|gol beklentisi|ilk yarı|ikinci yarı)(?![\p{L}])/iu.test(languageText))throw new Error('English commentary contains Turkish prose.');
    }
    if (/[<>\n#*\[\]`]|https?:\/\//u.test(stripped)) throw new Error('Yorum biçimlendirme içeriyor.');
    for (const number of stripped.match(/\d+(?:[.,]\d+)?/g)||[]) if (!allowed.has(Number(number.replace(',','.')))) throw new Error('Veride bulunmayan sayı.');
    const lower=text.toLocaleLowerCase(language==='en'?'en-GB':'tr-TR');
    if(language==='en'&&/\b(?:pressing|tactics?|referee|guarantee|certain victory|pre[- ]match prediction|proved|dictated the result)\b/u.test(lower))throw new Error('Şut verisinden çıkarılamayan İngilizce iddia.');
    const unsupported=language==='en'?lower.match(/\b(?:luck(?:y|ily)?|unlucky|deserv\w*|possession|goalkeep\w*|defen\w*|dominat\w*|pressing|tactics?|referees?|guarantee\w*)\b/u):lower.match(/şanslı|şanssız|(?<![\p{L}\p{N}_])şans(?![\p{L}\p{N}_])|hak et|hakett|pres|kaleci|savunma|taktik|hakem|topa sahip|kesinlikle|luck|deserv|possession|goalkeeper|defen|dominat|baskın oyun|uzaklık|sonucu doğrula|şut başına gol oran|garanti|öngör|sonucu belirledi|kesin galibiyet|galibiyeti getirdi|skoru belirledi|kanıtladı|haklı çıkar|domine/u);
    if (unsupported) throw new Error(`Şut verisinden çıkarılamayan iddia: «${unsupported[0]}». Bu ifadeyi kaldırıp kaydedilmiş pozisyonları yorumla.`);
    if(language==='en'&&checkTotals&&facts.home.goals===facts.away.goals&&/\b(?:more|fewer) goals\b/u.test(lower))throw new Error('Eşit skora aykırı iddia.');
    if(language==='en'&&checkTotals&&facts.home.shots===facts.away.shots&&/\b(?:more|fewer) shots\b/u.test(lower))throw new Error('Eşit şut sayısına aykırı iddia.');
    if (checkTotals && facts.home.goals===facts.away.goals && /daha (az|fazla|çok) gol(?:le|ü|ler|leri)?\b(?!\s+(?:fırsat|beklenti|olasılık|pozisyon))/u.test(lower)) throw new Error('Eşit skora aykırı iddia.');
    if (checkTotals && facts.home.shots===facts.away.shots && /daha (az|fazla|çok) şut(?:la|u|lar|ları)?\b(?!\s+(?:kalite|beklenti|olasılık))/u.test(lower)) throw new Error('Eşit şut sayısına aykırı iddia.');
  }
  const ids=value.evidence_ids, known=new Set(facts.evidence.map(e=>e.id));
  if (!Array.isArray(ids) || ids.length<1 || ids.length>4 || new Set(ids).size!==ids.length || ids.some(id=>!known.has(id))) throw new Error('Kanıt bağlantıları geçersiz.');
  return {...value,headline:value.headline.trim(),explanation:value.explanation.trim()};
}

export function validateProse(value, facts, modelFacts, language='tr') {
  if(!['tr','en'].includes(language))throw new Error('Unsupported story language.');
  if (!value || Object.keys(value).sort().join(',') !== 'cards,headline,summary') throw new Error('Geçersiz story biçimi.');
  if (!Array.isArray(value.cards) || value.cards.length<5 || value.cards.length>7 ||
      value.cards.some(c=>!c || typeof c!=='object') ||
      JSON.stringify(value.cards.map(c=>c.type))!==JSON.stringify(facts.sections)) throw new Error('Story bölümleri eksik veya yanlış sırada.');
  const check=(title,text,ids,tmin,tmax,pmin,pmax,checkTotals=true)=>{
    if(typeof title!=='string'||title.trim().length<tmin||title.trim().length>tmax||
       typeof text!=='string'||text.trim().length<pmin||text.trim().length>pmax) throw new Error('Story beklenen uzunlukta değil.');
    validateShortProse({headline:title,explanation:text,evidence_ids:ids},facts,modelFacts,checkTotals,language);
  };
  const ids=[...new Set(value.cards.flatMap(c=>c.evidence_ids||[]))].slice(0,4);
  check(value.headline,value.summary,ids,15,120,30,280);
  for(const c of value.cards){
    if(Object.keys(c).sort().join(',')!=='evidence_ids,text,title,type')throw new Error('Geçersiz kart biçimi.');
    check(c.title,c.text,c.evidence_ids,8,90,80,650,false);
    let sentenceText=c.text;
    for(const name of [facts.home.name,facts.away.name,...(facts.events||[]).map(e=>e.player).filter(Boolean)]) sentenceText=sentenceText.split(name).join('Oyuncu');
    // Turkish ordinal minutes/halves are not sentence boundaries.
    sentenceText=sentenceText.replace(/(\d)\.(?=\s+(?:dakika|devre|yarı|uzatma))/gu,'$1');
    const sentences=(sentenceText.match(/[.!?](?=\s|$)/gu)||[]).length;
    if(sentences<2||sentences>4)throw new Error('Story kartları 2–4 cümle içermeli.');
  }
  return value;
}
