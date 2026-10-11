// The prompt and reviewer contract are exported from the existing Python engine.
export function validateProse(value, facts, modelFacts) {
  if (!value || Object.keys(value).sort().join(',') !== 'evidence_ids,explanation,headline') throw new Error('Geçersiz yorum biçimi.');
  const allowed = new Set([0,1,2,facts.home.goals,facts.away.goals]);
  function collect(v) {
    if (typeof v === 'number') for (let n=0;n<=3;n++) allowed.add(Number(v.toFixed(n)));
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  }
  collect(modelFacts);
  collect(facts);
  for (const [key,min,max] of [['headline',15,180],['explanation',30,500]]) {
    const text=value[key];
    if (typeof text !== 'string' || text.trim().length<min || text.trim().length>max) throw new Error('Yorum beklenen uzunlukta değil.');
    if (/fırsat terazisi|dengenin içinden|ayrı bir hikâye|tek yönlülük|tabela[^.]*gizli|ağırlık verdiği sonuç/u.test(text.toLocaleLowerCase('tr-TR'))) throw new Error('Yorum soyut manşet dili içeriyor; bulguyu doğrudan açıkla.');
    let stripped=text;
    for (const team of [facts.home.name,facts.away.name]) stripped=stripped.split(team).join('');
    if (/[<>\n#*\[\]`]|https?:\/\//u.test(stripped)) throw new Error('Yorum biçimlendirme içeriyor.');
    for (const number of stripped.match(/\d+(?:[.,]\d+)?/g)||[]) if (!allowed.has(Number(number.replace(',','.')))) throw new Error('Veride bulunmayan sayı.');
    const lower=text.toLocaleLowerCase('tr-TR');
    if (/şanslı|şanssız|\bşans\b|hak et|hakett|pres|kaleci|savunma|taktik|hakem|topa sahip|kesinlikle|luck|deserv|possession|goalkeeper|defen|dominat|baskın oyun|uzaklık|sonucu doğrula|şut başına gol oran|garanti|öngör|sonucu belirledi|kesin galibiyet|galibiyeti getirdi|skoru belirledi|kanıtladı|haklı çıkar|domine/u.test(lower)) throw new Error('Şut verisinden çıkarılamayan iddia.');
    if (facts.home.goals===facts.away.goals && /daha (az|fazla|çok) gol(?:le|ü|ler|leri)?\b(?!\s+(?:fırsat|beklenti|olasılık|pozisyon))/u.test(lower)) throw new Error('Eşit skora aykırı iddia.');
    if (facts.home.shots===facts.away.shots && /daha (az|fazla|çok) şut(?:la|u|lar|ları)?\b(?!\s+(?:kalite|beklenti|olasılık))/u.test(lower)) throw new Error('Eşit şut sayısına aykırı iddia.');
  }
  const ids=value.evidence_ids, known=new Set(facts.evidence.map(e=>e.id));
  if (!Array.isArray(ids) || ids.length<2 || ids.length>4 || new Set(ids).size!==ids.length || ids.some(id=>!known.has(id))) throw new Error('Kanıt bağlantıları geçersiz.');
  return {...value,headline:value.headline.trim(),explanation:value.explanation.trim()};
}
