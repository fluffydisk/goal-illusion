# İstek üzerine AI servisi

Pages statik arayüz olarak kalır. Bu Worker ziyaretçi isteğini alır; SQLite-backed
Durable Object sırayı, aşamaları ve tamamlanmış yorumları kalıcı olarak saklar.
Bulunmayan yorum için GET yalnızca durumu okur; POST üretim başlatır. Aynı maç/veri
parmak izi için eşzamanlı POST'lar aynı işi döndürür. Sunucu yalnızca yayımlanmış maç
kanıtlarını okur; istemciden prompt, model veya istatistik kabul etmez.

## Kurulum

```bash
cd service
npm ci
npx wrangler login
python ../scripts/deploy_ai_service.py
npx wrangler secret put GROQ_API_KEY
```

Son komutta Groq anahtarını gizli terminal girdisine yapıştır. Anahtarı kaynak koda,
`.dev.vars` hariç dosyalara, GitHub issue'larına veya site yapılandırmasına yazma.
İstersen Cloudflare dashboard → Workers & Pages → goal-illusion-ai → Settings →
Variables and Secrets → Add yolunda `GROQ_API_KEY`, tür **Secret** olarak ekle.
`web/data/site.json` içinde `ai_endpoint` değerine dağıtımın `https://…workers.dev`
adresini yaz. Pages'i tekrar yayımla. Yeni hesapta workers.dev alt alanı açılması
gerekebilir. Ücretsiz SQLite Durable Objects kullanılır; ücretli plana geçilmez.

`wrangler.jsonc` içindeki SITE_ORIGIN ve STORIES_URL kendi yayın adresinle eşleşmeli.
Prompt değişirse `uv run python scripts/export_ai_contract.py` çalıştır ve Worker'ı
tekrar dağıt. Sitedeki `model_facts` alanı Python motorunun aynı girdisidir.

## Akış ve kalite

Sıradaki iş bir Durable Object alarmıyla başlar. Yorum üretimi ve ayrı editör kontrolü
farklı alarmlarda gerçekleşir; üretimden sonra ücretsiz dakika kotası için 60 sn beklenir; tarayıcı kapanırsa iş sunucuda sürer. Her API çağrısında
120 sn zaman aşımı vardır. Kontrol geçmeyen metne düzeltme için en fazla bir yeni
deneme verilir; başarısız metin hazır olarak saklanmaz. Güçlü model değiştirilmez.
İstemci 4 saniyede bir gerçek aşamayı okur. Süre tahminidir; Groq bir tamamlanma yüzdesi
ve kesin bitiş zamanı sağlamaz.

Günde 80 üretim başlangıcı, istemci/IP hash'i başına 10 dakikada 3 yeni istek ve en
fazla 10 sıradaki iş vardır. Ham IP saklanmaz. CORS tek siteye izin verir; CORS kimlik
doğrulama değildir, üretim sınırları ve sağlayıcı kotası ücretsiz kullanımı sınırlar.
Kısa süreli kota sınırında taslak korunur, widget bekleme aşamasını gösterir ve kontrol en fazla iki kez otomatik sürdürülür. Uzun süreli kota sınırında yeniden deneme zamanı verilir; sonraki manuel denemede mevcut taslak kullanılarak doğruluk kontrolü sürdürülür. Sonuçlar yalnızca maç/veri parmak izi
bazında yeniden kullanılır. Sağlayıcı anahtarı veya yanıt hata gövdesi loglanmaz.

## Doğrulama

```bash
npm test
npx wrangler deploy --dry-run
```

Testler sıra birleşmesini, GET'in üretim yapmamasını, bağımsız editör şartını,
reddedilen metnin yayımlanmamasını, parmak izi değişimini, kota davranışını ve arşiv
metinlerinin JavaScript kalite kontrolünü kapsar. Gerçek Groq uçtan uca doğrulaması
secret bağlandıktan sonra yorum bulunmayan bir maça tıklanarak yapılır.

`GET /health` yalnızca sunucu anahtarının bağlanıp bağlanmadığını bildirir; anahtar değeri döndürülmez.
Manuel `Check on-demand AI quality` GitHub işi, Worker’ın gerçek Groq çağrılarını
test eder. Üretilen deneme metni siteye veya ortak analiz önbelleğine yayımlanmaz.

## Story v2 geçişi

Yanıtın `narrative` alanı artık `headline`, `summary`, `cards` ve kaynak/sürüm
metadatası içerir. Kart alanları `type`, `title`, `text`, `evidence_ids` şeklindedir.
Bölüm sırası kanıt paketindeki `sections` alanından gelir. Zaman, oyuncu ve takım
bağlantıları `events` ile; kendi kalesine goller ayrı sabit katkı olarak iletilir.

Önce `scripts/export_ai_contract.py`, `scripts/generate_stories.py --provider groq
--evidence-only` ve `scripts/build_analysis_bundle.py` ile paketleri hazırlayın.
Pages ve Worker birlikte yayımlanmalıdır. Geçiş sırasında sürümler uyuşmazsa API
üretim kotası harcamadan geçici güncelleme hatası döndürür. Eski işler ve kısa
metinler yeni hikâye gibi sunulmaz; eski arşiv topluca yeniden üretilmez.

Tek çağrıda bütün hikâye, ayrı çağrıda bütün kartların editör kontrolü yapılır.
Token sınırı uzun hikâyeler için 8192'dir; sağlayıcı kotası ve süre sınırları geçerlidir.
Üç gerçek örnek için `GROQ_API_KEY` güvenli ortamda tanımlıyken kök dizinde
`node scripts/check_ai_service.mjs` çalıştırın. İsteğe bağlı `MATCH_IDS` en fazla
üç virgülle ayrılmış kimlik alır. Bu kontrol yayımlanmış önbelleği değiştirmez.
