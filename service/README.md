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
npx wrangler deploy
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
Kısa süreli kota sınırında taslak korunur, widget bekleme aşamasını gösterir ve kontrol en fazla iki kez otomatik sürdürülür. Uzun süreli kota sınırında yeniden deneme zamanı verilir. Sonuçlar yalnızca maç/veri parmak izi
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
