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
npx wrangler secret put GEMINI_API_KEY
# İsteğe bağlı yedek sağlayıcı
npx wrangler secret put GROQ_API_KEY
```

Secret komutlarında ilgili sağlayıcı anahtarını gizli terminal girdisine yapıştır. Anahtarı kaynak koda,
`.dev.vars` hariç dosyalara, GitHub issue'larına veya site yapılandırmasına yazma.
İstersen Cloudflare dashboard → Workers & Pages → goal-illusion-ai → Settings →
Variables and Secrets → Add yolunda `GEMINI_API_KEY` ve isteğe bağlı
`GROQ_API_KEY`, tür **Secret** olarak ekle. Gemini anahtarını AI Studio’da
faturalandırma bağlı olmayan bir projede oluştur: https://aistudio.google.com/api-keys.
API çağrısı proje faturalandırmasını kapatamaz; ücretsiz kullanım için proje ücretsiz
katmanda kalmalıdır. Kod ücretli plana geçmez veya farklı ücretli model seçmez.
`web/data/site.json` içinde `ai_endpoint` değerine dağıtımın `https://…workers.dev`
adresini yaz. Pages'i tekrar yayımla. Yeni hesapta workers.dev alt alanı açılması
gerekebilir. Ücretsiz SQLite Durable Objects kullanılır; ücretli plana geçilmez.

`wrangler.jsonc` içindeki SITE_ORIGIN ve STORIES_URL kendi yayın adresinle eşleşmeli.
Prompt değişirse `uv run python scripts/export_ai_contract.py` çalıştır ve Worker'ı
tekrar dağıt. Sitedeki `model_facts` alanı Python motorunun aynı girdisidir.

## Akış ve kalite

Sıradaki iş bir Durable Object alarmıyla başlar. Yorum üretimi ve ayrı editör kontrolü
farklı alarmlarda gerçekleşir. Gemini 3.8 Flash önceliklidir; kota/bağlantı veya
erişim sorunu varsa yapılandırılmış Groq yedeği kullanılır. Groq çağrıları arasında
ücretsiz dakika kotası için 60 sn beklenir; tarayıcı kapanırsa iş sunucuda sürer. Her API çağrısında
120 sn zaman aşımı vardır. Kontrol geçmeyen metne düzeltme için en fazla bir yeni
deneme verilir; başarısız metin hazır olarak saklanmaz. Kalite reddi sağlayıcı değiştirerek atlanmaz.
İstemci 4 saniyede bir gerçek aşamayı okur. Süre tahminidir; sağlayıcılar bir tamamlanma yüzdesi
ve kesin bitiş zamanı sağlamaz.

Günde 80 üretim başlangıcı, istemci/IP hash'i başına 10 dakikada 3 yeni istek ve en
fazla 10 sıradaki iş vardır. Ham IP saklanmaz. CORS tek siteye izin verir; CORS kimlik
doğrulama değildir, üretim sınırları ve sağlayıcı kotası ücretsiz kullanımı sınırlar.
Kota sınırında taslak ve kuyruk işi korunur; widget gerçek bekleme zamanını gösterir.
Uzun beklemeler de sunucuda otomatik sürdürülür; yeni POST veya ikinci kota ücreti
gerekmez. Her sağlayıcının bekleme süresi ayrı saklanır. Bekleyen bir iş çalışmaya
hazır diğer işleri engellemez. Sonuçlar yalnızca maç/veri parmak izi
bazında yeniden kullanılır. Sağlayıcı anahtarı veya yanıt hata gövdesi loglanmaz.

## Doğrulama

```bash
npm test
npx wrangler deploy --dry-run
```

Testler sıra birleşmesini, GET'in üretim yapmamasını, bağımsız editör şartını,
reddedilen metnin yayımlanmamasını, parmak izi değişimini, kota davranışını ve arşiv
metinlerinin JavaScript kalite kontrolünü kapsar. Gerçek sağlayıcı uçtan uca doğrulaması
secret bağlandıktan sonra yorum bulunmayan bir maça tıklanarak yapılır.

`GET /health` yalnızca sunucu anahtarının bağlanıp bağlanmadığını bildirir; anahtar değeri döndürülmez.
Manuel `Check on-demand AI quality` GitHub işi, Worker’ın gerçek Gemini/Groq çağrılarını
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
Yazım çağrısının çıktı bütçesi 4096, editörünki 2048 tokendir; düşünme düzeyi düşüktür.
Girdi tüm hesaplanmış özetleri, tüm şut gollerini ve devrelerin önemli fırsatlarını
içerir; tam şut listesi arayüzde korunur. Sağlayıcı kotası ve süre sınırları geçerlidir.
Üç gerçek örnek için `GEMINI_API_KEY` (veya yedek `GROQ_API_KEY`) güvenli ortamda tanımlıyken kök dizinde
`node scripts/check_ai_service.mjs` çalıştırın. İsteğe bağlı `MATCH_IDS` en fazla
üç virgülle ayrılmış kimlik alır. Bu kontrol yayımlanmış önbelleği değiştirmez.
