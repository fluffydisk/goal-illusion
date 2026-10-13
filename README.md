# Goal Illusion ⚽

**MVP v0.1.0** · [Sürüm notları](RELEASE_NOTES.md)

**Skor her şeyi anlatır mı?** Gerçek bir maçın şutlarını alır, xG değerlerinden olası
skorları hesaplar ve maç sonucunu bu dağılımla karşılaştırır. Türkçe/İngilizce web
arayüzü ve yerel Streamlit paneli sunar. Ziyaretçiler için API anahtarı veya hesap
gerekmez. AI yorumları geliştirici tarafından yapılandırılan üretim servisini kullanır.

## Çalıştırma

[uv](https://docs.astral.sh/uv/getting-started/installation/) kurulu olmalı. uv gerekli
Python 3.12 sürümünü otomatik sağlar.

```bash
uv sync
uv run streamlit run app.py
```

Tarayıcıda `http://localhost:8501` açılır. İlk ekran internet gerektirmeyen gerçek
**İngiltere–Senegal, 3–0 (4 Aralık 2022)** örneğidir. İlk kurulum için internet gerekir;
kurulumdan sonra örnek maç için gerekmez.

**Güncel Süper Lig, Bundesliga, Premier League, LaLiga, Serie A ve Ligue 1:** Sol menüden **FotMob · güncel ligler** seç.
Lig ve sezon seçildiğinde bitmiş maçlar en yeniden eskiye listelenir. Sezon listesi
kaynaktan gelir; her yıl kodda değişiklik yapmak gerekmez. **Veriyi yenile / tekrar dene**
düğmesi en yeni tamamlanmış maçları almak için önbelleği temizler. API anahtarı ve ödeme
gerekmez. Kaynakta şut bazlı xG bulunmayan maçlar için açıklayıcı hata gösterilir.

**StatsBomb kataloğu:** Turnuva, sezon ve maç seçerek açık veri arşivini inceleyebilirsin.
Bu arşivde Süper Lig yok; Bundesliga verisi de güncel bütün sezonları içermez.
Uygulama canlı maçları analiz etmez; sonuç ve şut verisi tamamlanmış maçları kullanır.

## Ekranda ne var?

- Gerçek skor, iki takımın toplam xG'si, şut sayıları ve gerçek skorun olasılığı.
- Galibiyet/beraberlik/mağlubiyet olasılıkları, skor ısı haritası, en olası beş skor.
- Şut haritası: büyük işaret yüksek xG, yıldız gol; detaylar üzerine gelince görünür.
- Birikimli xG grafiği: goller ve devre sınırlarıyla maç boyunca şut kalitesi.
- Hesaplanan istatistiklerden üretilen kısa Türkçe açıklama.

## Nasıl hesaplanıyor?

Şutun xG'si gol olma olasılığıdır. Her şutu bağımsız bir Bernoulli denemesi sayıp
takım başına **Poisson-binomial dağılımı** hesaplarız. Başlangıç dağılımı `[1]`;
her `p` xG değeri için dağılım `[1-p, p]` ile konvolüsyona girer. Takımların dağılımlarının
dış çarpımı bütün skorların olasılığını verir. Matrisin köşegeni beraberlik, alt/üst
üçgenleri ilk/ikinci takımın galibiyetidir. Rastgele simülasyon ve Poisson yaklaşımı yoktur.

Hesap **gerçekleşmiş şutlara koşulludur**: aynı şutları aynı xG değerleriyle tekrar
üretseydik ne olurdu? Maç öncesi tahmin veya kesin bir “hak edilen skor” değildir.
Ribaundlar, pozisyon bağımlılığı ve skorla değişen taktikler modelde yer almaz.
Tek bir skorun düşük olasılığı tek başına şans ya da sürpriz ölçüsü değildir.

Normal süre ve varsa uzatma birlikte değerlendirilir; seri penaltılar çıkarılır.
`Own Goal Against` olayları rakibin skoruna sabit katkı olarak eklenir; `Own Goal For`
ile çift sayılmaz. Kendi kalesine goller xG toplamına girmez, gerçekleşmiş kabul edilir.
Skor olaylardan yeniden hesaplanır; katalogla fark varsa ekranda uyarı gösterilir.

Eksik/geçersiz xG'de analiz durur; sessizce şut atılmaz. Konumu olmayan şutlar yalnızca
haritadan çıkarılır. Zaman grafiği devre aralarını çıkarır, duraklama sürelerini korur.
Isı haritası eksen başına en fazla dokuz gol değerini gösterir; gizli olasılık yazılır.
Tüm metrikler ve en olası skorlar tam dağılımdan hesaplanır.

## Geliştirme ve kontroller

```bash
uv run pytest
uv run ruff check .
```

`app.py` arayüz ve Streamlit önbelleğini; `goal_illusion/` veri normalizasyonu,
bağımsız hesaplama ve Plotly grafiklerini içerir. `tests/` matematik, veri ve
Streamlit uygulama senaryolarını doğrular. `PLAN.md` MVP kararlarını saklar.

Katalog ve maç listeleri bir saat, olaylar bir gün bellekte saklanır. **Veriyi yenile /
tekrar dene** düğmesi önbellekleri temizler. Ağ isteklerinde bağlantı zaman aşımı
5 saniye, okuma zaman aşımı 25 saniyedir. Hatalar yerel örneği etkilemez.
FotMob lig ve maç verisi en fazla 15 dakika önbellekte saklanır. Yeni maç verisi uygulama
yeniden çalıştığında/seçim değiştiğinde veya yenile düğmesiyle alınır; arka planda sürekli
tarama yoktur. Yalnızca seçilen lig/sezon listesi ve seçilen maç istenir.

## FotMob bağlantısı ve veri kalitesi

`goal_illusion/fotmob.py`, FotMob web sitesinin herkese açık JSON yanıtını okur.
Resmi API sözleşmesi veya kesintisiz erişim garantisi yoktur. Web adresi/yanıt biçimi
değişirse uygulama anlaşılır hata gösterir; kimlik doğrulama veya erişim engellerini
aşmaya çalışmaz. Ücretsiz erişim, her eski/yeni maçta eksiksiz xG bulunacağını garanti etmez.

Şut koordinatları 105×68 ölçeğinden ortak 120×80 saha ölçeğine çevrilir. Kaynak yalnızca
dakika ve ek süre bilgisini verdiğinden saniyeler uydurulmaz. Seri penaltılar çıkarılır;
kendi kalesine goller olayın skor değişiminden alıcı takıma bir kez eklenir.
Şut haritası gerçek skor veya mevcut toplam şut sayısıyla uyuşmazsa analiz durur.
Boş şut listesi ancak kaynakta iki takım için sıfır şut doğrulanırsa kullanılır.

Kaynağın maç özeti xG'si, ham şutların toplamından farklı olabilir. Böyle bir fark
ekranda belirtilir; hesaplamalarda şut başına `expectedGoals` değerleri korunur.
`expectedGoalsOnTarget` değerleri xG yerine kullanılmaz. FotMob ve StatsBomb'un xG
modelleri farklı olabileceğinden kaynaklar doğrudan eşdeğer kabul edilmemelidir.
Ekranın altında maç kaynak bağlantısı ve verinin alınma zamanı gösterilir.

## Veri kaynağı

Arşiv ve çevrimdışı örnek: [StatsBomb Open Data](https://github.com/hudl/open-data).
Güncel ligler: [FotMob Süper Lig](https://www.fotmob.com/leagues/71/overview/super-lig)
ve [FotMob Bundesliga](https://www.fotmob.com/leagues/54/overview/bundesliga).
Kaynaklarla bağlantımız veya resmi ortaklığımız yoktur.

`data/example_match.json`, maç ID `3869118` için orijinal şut, kendi kalesine gol ve
devre bitiş olaylarının sadeleştirilmiş bir kopyasıdır. Kullanılmayan alanlar çıkarıldı;
xG değerleri değiştirilmedi. Kaynak URL'si, indirme tarihi ve orijinal olay dosyasının
SHA-256 özeti dosyada saklanır. Logo resmi açık veri deposundan alınmıştır.
StatsBomb veri lisansı `data/STATSBOMB_LICENSE.pdf` dosyasında korunmuştur.
Veriden üretilen analizleri paylaşırken [deponun kaynak atfı ve logo talimatlarını](https://github.com/hudl/open-data#terms--conditions)
izle.

## Herkese açık web sürümü — GitHub Pages

**[Goal Illusion’ı aç](https://fluffydisk.github.io/goal-illusion/)**

`web/` bağımsız HTML/CSS/JavaScript uygulamasıdır; sunucu veya Python kurulumu olmadan
maç analizi yapar. Maç bağlantıları `?match=ID` ile paylaşılabilir. Şut bazlı tam
Poisson-binomial hesabı tarayıcıda yapılır; aynı gerçek maçlar üzerinde Python sonucu
ile karşılaştırılarak doğrulanır.

Pages sürümü çevrimdışı örneği ve desteklenen altı ligin güncel sezonundaki
**verisi doğrulanabilen tamamlanmış maçlarını** içerir. Streamlit sürümü ayrıca eski
sezonları ve StatsBomb kataloğunu talep üzerine getirir.

GitHub Actions, her push, elle çalıştırma ve altı saatte bir veri dosyasını güncelleyip
Pages’e dağıtır. Yeni maçlarda kaynak gecikmesi ve dağıtım süresi ek gecikme yaratabilir.
Son üç günün maçları düzeltmeler için tekrar alınır; daha eski maçlar önbellekten gelir.
Kaynak erişilemezse önceki doğrulanmış veri korunur ve arayüzde uyarı gösterilir.
GitHub zamanlanmış işleri gecikebilir; etkinliği olmayan herkese açık depolarda 60 gün
sonra devre dışı kalabilir. Actions sekmesinden tekrar etkinleştirilebilir.
[GitHub zamanlanmış iş belgeleri](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Web arayüzünde lig ve takım filtreleri, Türkçe karakterlere toleranslı takım/rakip
araması ve tarihlere göre maç listesi bulunur. Masaüstünde maç listesi analizin yanında,
mobilde açılır seçim panelindedir. Filtreleme açık maçın analizini değiştirmez; başka
bir maç satırına basıldığında analiz ve paylaşım bağlantısı güncellenir.
Skor ve xG metrikleri önce, AI yorumu bunların altında gösterilir.
Üst çubuktan Türkçe/İngilizce seçilebilir. URL'deki `lang=tr` / `lang=en`
parametresi saklanan tercihten ve tarayıcı dilinden önce gelir. Sayılar, tarihler,
kanıtlar ve AI yorumları seçilen dilde gösterilir; dillerin AI işleri ve önbellekleri
ayrıdır. Şut haritasında ev sahibi sağ, deplasman sol kaleye hücum eder;
deplasmanın hem şutları hem gol yıldızları döndürülür. Ham veri ve xG değişmez.
Altı lig aynı `web/data/leagues.json` kataloğundan beslenir. İlk arşiv dolumu
kademelidir; güncelleme lig başına en fazla 12 maç detay isteği yapar. Doğrulanmış
geçmiş korunur, son üç günün kayıtları düzeltmeler için sırayla yenilenir. Kapsam ve
kaynak kesintisi seçicide belirtilir; eksik/skorla tutarsız maçlar uydurulmaz.
Favori takım ve maçlar cihazda saklanır. Tüm ligler, sezon ve tarih aralığı filtreleri
birlikte kullanılabilir. Açık/koyu/sistem tema seçimi de cihazda korunur.
Şut haritası takım, oyuncu, devre ve sonuç filtresi; şut listesi dakika/xG sıralaması
sunar. Bu filtreler maçın hesaplanan toplamlarını değiştirmez.
Takım seçildiğinde filtrelenmiş kayıtlı maçlardan G/B/M, gol toplamları, maç başına
xG ve son beş sonuç gösterilir; form kartından maç açılabilir. İç saha/deplasman
filtresi özete de uygulanır. Son 12 kayıtlı maçın üretilen/rakip xG eğrisi ve seçili
takımın filtrelenmiş maçları için CSV bulunur. Bu özet tüm sezonu kapsadığı iddiasında
bulunmaz. Kalan işler `MVP_TODO.md` dosyasındadır.

İki maçın istatistikleri yan yana karşılaştırılabilir; `?match=ID&compare=ID&lang=en`
bağlantısı seçimi korur. Analiz JSON, tüm şutlar CSV ve iki takımın sayısal özet CSV'si
indirilebilir. Karşılaştırma paneli ayrıca iki maçın dört takım satırını tek CSV
dosyasında sunar. İndirmeler harita filtrelerinden etkilenmez; kaynak, xG modeli ve
kendi kalesine gol katkıları korunur. CSV UTF-8 BOM, virgül ve noktalı ondalık kullanır;
metin hücreleri formül olarak çalıştırılmaya karşı kaçırılır.

Favori tercihler açık sekmeler arasında eşitlenir. Temizlemeyi geri alma ve doğrulanan
JSON yedeğiyle cihazlar arası taşıma vardır; içe aktarma mevcut seçimlerle birleşir.
Gollerin şut listesi haritada ilgili pozisyonu açar; konumu/zamanı olmayan kendi
kalesine goller için veri uydurulmaz. xG rehberi, lig bazında kapsam/kaynak tablosu,
klavyeyle şut ve maç gezinmesi, geri/ileri geçmişi ve mobil alt gezinme çubuğu bulunur.
Filtrelenen listedeki önceki/sonraki maça doğrudan geçiş düğmeleri seçimleri korur.

HTTPS yayında destekleyen tarayıcılar doğrulanmış statik uygulama/veri sürümünü
çevrimdışı saklar. Başarılı ilk yüklemeden sonra kayıtlı maçlar internetsiz açılır;
veri tarihi kontrol edilmelidir. Kaydedilmiş paketle açılışta yeni AI üretimi kapalıdır;
internet geri geldiğinde sayfayı yenileyerek güncel paketi yükle. Yeni sürüm bütün
varlıklarının SHA-256 kontrolünden sonra etkinleşir; başarısız kurulum eski sürümü
korur. Destekleyen tarayıcılarda uygulama ekleme düğmesi görünür. Yerel önizlemede
service worker varsayılan kapalıdır; çevrimdışı test için `?offline=1` kullanılır.

Yerel Pages önizlemesi ve kontroller:

```bash
uv run python scripts/export_pages.py
uv run python scripts/generate_stories.py --provider groq --evidence-only
uv run python scripts/build_analysis_bundle.py
uv run python scripts/build_service_worker.py
uv run python -m http.server 8502 --directory web
node --test tests/*.test.mjs service/*.test.mjs
```

UI kontrolleri `scripts/check_*_ui.mjs` dosyalarındadır; Playwright ve Chromium kullanır.
`check_release_ui.mjs` canlı MVP kabul kontrolüdür; AI POST göndermez, daha önce
onaylanmış İngilizce örneği okur. Diğer UI regresyon testleri yerel önizlemeyi kullanır.
`PLAYWRIGHT_MODULE` ile modülün konumu belirtilebilir. Yerel UI testlerinde AI yanıtları
sentetiktir; gerçek model üretimi başlatılmaz. Web dosyaları veya analiz paketi
değiştirildikten sonra `build_service_worker.py` yeniden çalıştırılmalıdır.

Pages ve AI servisi, maç şutlarını ve doğrulanmış bulguları aynı `analysis.json`
paketinden okur. Paket oluşturulurken her maçın veri parmak izi kontrol edilir.
Sayfa açıkken veri düzeltilirse analiz isteği eski sürümle üretim başlatmaz;
arayüz güncel paketi yükleyip bir kez otomatik tekrar dener.

Analiz başlığı doğrudan maç skoru ve toplam xG değerlerini gösterir. AI açıklaması
kısa, düz Türkçe cümlelerle bulguyu yorumlar; manşet dili ve mecazlar kabul edilmez.
Bağımsız inceleme hem istatistiksel doğruluğu hem okunabilirliği kontrol eder.
Yazım kuralları değiştiğinde sunucudaki eski yorumlar ve taslaklar tekrar kullanılmaz.

Node testi için `tests/pages_reference.json`, yayımlanan maçların Python referansını
saklar. Bu dosya güncellendiğinde `scripts/check_pages.py` ile yeniden üretilebilir.
Pages ayarı **Settings → Pages → Source → GitHub Actions** olmalıdır.

## Maçın hikâyesi — özgün AI yorumları

Maç seçildiğinde en üstte o maça özel bir başlık, kısa açıklama ve bunları destekleyen
kanıt kartları görünür. Metin sabit cümlelerden seçilmez: Groq üzerinden
`openai/gpt-oss-120b` modeline maç bulguları gönderilerek üretilir.
Ücretsiz planın kotası kullanılır; kota dolunca mevcut analiz kullanılabilir kalır.
GitHub Pages arayüzü sunar; yeni yorum yalnızca ziyaretçi **AI analizi üret** düğmesine
bastığında Cloudflare Worker üzerinden üretilir. Actions otomatik AI üretmez.
Ziyaretçiler model indirmez, API anahtarı veya hesap gerekmez.

Kanıt katmanı toplam xG, şut başına xG, devrelere göre xG, kendi kalesine goller hariç
gol–xG farkı, galibiyet olasılıkları ve kazananın **en az gerçekleşen gol farkıyla**
kazanma olasılığını hesaplar. Son ölçü tek bir tam skorun düşük olasılığından farklıdır;
beraberlikte yönlü skor farkı ölçüsü verilmez. Sıfır şutta ortalama xG tanımsızdır.

[Groq şemalı çıktı API’sinin](https://console.groq.com/docs/structured-outputs) strict JSON modu kullanılır.
Modelden Türkçe ana çıkarım, kısa özet ve 5–7 story kartı alınır. Her kart ayrı yorum ve
kanıt kimlikleri içerir; sayılar ve olay sıralaması uygulamanın hesabından gelir. Geçersiz kanıt bağlantıları, verilerle eşleşmeyen rakamlar/HTML ve belirli desteklenmeyen
iddialar reddedilir; bir düzeltme denemesi yapılır. Groq üretiminde metin ayrıca ayrı
bir editör çağrısıyla gerçek bulgulara karşı kontrol edilir. Takım karşılaştırması,
desteklenmeyen nedensellik veya anlam sorunları saptanırsa yorum yayımlanmaz. Bu
kontroller dil modelinin her yorumunun anlamsal olarak doğru olduğunu garanti etmez. Yorumlar şut kalitesiyle sınırlıdır; tüm oyun kalitesi,
pres, topa sahip olma veya kesin hak edilen sonuç iddiası değildir.

Maç verisi değişirse SHA-256 parmak izi eski yorumu geçersiz kılar; eski veriye ait
cümle yeni istatistiklere iliştirilmez. Model erişilemez veya çıktı kontrolleri geçmezse
AI yorumun hazır olmadığı belirtilir; sayısal analiz ve kanıtlar kullanılabilir kalır.
Hazır bir şablon AI yorumu gibi sunulmaz. Kaynak xG uyarıları korunur.

İstek üzerine üretimin kurulumu `service/README.md` içinde anlatılır. Groq anahtarı
Worker secret olarak saklanır; kaynak koda veya tarayıcıya konmaz. GitHub Actions
altı saatte bir yalnızca maç verisini ve kanıtlarını yeniler, mevcut yorumları korur.
Yeni/değişmiş maçlar ziyaretçi isteğini bekler. Aynı maç için eşzamanlı istekler tek
işte birleşir; hazır sonuç veri parmak iziyle ortak ve kalıcı olarak saklanır.

Widget sırada bekleme, yorum üretimi, sağlayıcı kotası için bekleme ve ayrı doğruluk kontrolünü gösterir. Geçen süre
ve tahmini bekleme aralığı sunulur; sağlayıcının gerçek ilerlemesi bilinmediği için
kesin yüzde veya kesin bitiş zamanı gösterilmez. Yenileme/başka maça geçme sunucudaki
üretimi iptal etmez. API kotasında ya da kalite sorunununda yeniden deneme sunulur.
Güçlü `openai/gpt-oss-120b` modeli yüksek reasoning ayarıyla kullanılır; küçük modele
otomatik geçilmez. Üretimden sonra ayrı editör çağrısı ve yerel yapı/kanıt/sayı
kontrolleri zorunludur. İkinci deneme de geçmezse metin yayımlanmaz.

Deneysel yerel alternatif (küçük modelin Türkçesi ve yorumları gerçek maç denemelerinde
beklenen kalitede değildi; otomatik yayında kullanılmaz):

```bash
ollama serve
# Başka bir terminalde:
ollama pull qwen3.5:4b
uv run python scripts/generate_stories.py
```

Streamlit ekranında hazır yorum kullanılır. Yeni/eskiden yayımlanmayan maçlar için
**Yerel modelle maç yorumunu üret** düğmesi vardır. `OLLAMA_BASE_URL` ile farklı yerel
adres seçilebilir. `--limit 3` yalnızca ilk üç eksik yorumu üretir; tüm maçların
kanıtları yine yazılır. `--evidence-only` model çağrısı yapmaz.

Eski kısa yorum arşivi `web/data/reviewed-stories.json` içinde kaynak bilgileriyle korunur.
Story v2 / prompt v9 bu kayıtları hazır review olarak kullanmaz. Veri ve sözleşme
sürümleri eşleşen yeni hikâyeler yalnızca kullanıcı butona bastığında üretilir.

### Story deneyimi

**AI yorumu oluştur** ilk üretimi başlatır; hazır olduğunda **AI yorumunu oku**
butonu görünür. Mobilde tam ekran, masaüstünde odaklı bir pencere açılır. Kartlar
metin uzunluğuna göre 10–25 saniyede ilerler; ok tuşları, dokunma ve yatay kaydırma
da desteklenir. Duraklatma, açık kanıt detayı veya gizli sekme ilerlemeyi durdurur.
Azaltılmış hareket tercihinde otomatik oynatma kapalı başlar. Son kart kapanmaz;
baştan izlenebilir. Bekleme widget'ındaki veri notları AI yorumu değildir.

Görsel test (Playwright modülü ve Chromium kurulu ortamda):

```bash
python -m http.server 8765 --bind 127.0.0.1 --directory web
# Ayrı terminal; PLAYWRIGHT_MODULE gerekirse kurulu modülün mutlak yoludur.
node scripts/check_story_ui.mjs
node scripts/check_match_browser_ui.mjs
node scripts/check_locale_pitch_ui.mjs
node scripts/check_mvp_features_ui.mjs
node scripts/check_team_summary_ui.mjs
```

Bu test AI servisini taklit eder, üretim yapmaz ve `/tmp/story-*.png` görsellerini
oluşturur. Gerçek üç maçlık bağımsız üretim/kontrol testi, sunucu anahtarı güvenli
ortam değişkeni olarak sağlandığında `node scripts/check_ai_service.mjs` ile yapılır.
Çıktılar `/tmp/ai-quality-check-<match_id>.json` altında kalır, siteye yayımlanmaz.
Varsayılan örnekler farklı skor, golsüz beraberlik ve kendi kalesine gol içeren maçtır.
