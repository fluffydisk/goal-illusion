# Goal Illusion ⚽

**Skor her şeyi anlatır mı?** Gerçek bir maçın şutlarını alır, xG değerlerinden olası
skorları hesaplar ve maç sonucunu bu dağılımla karşılaştırır. Türkçe Streamlit paneli;
Ziyaretçiler için API anahtarı veya hesap gerekmez. AI yorumlarının üretimi için geliştirici tarafında ücretsiz Groq hesabı gerekir.

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

**Güncel Süper Lig ve Bundesliga:** Sol menüden **FotMob · güncel ligler** seç.
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

Pages sürümü çevrimdışı örneği ve Süper Lig/Bundesliga’nın güncel sezonundaki
**verisi doğrulanabilen tamamlanmış maçlarını** içerir. Streamlit sürümü ayrıca eski
sezonları ve StatsBomb kataloğunu talep üzerine getirir.

GitHub Actions, her push, elle çalıştırma ve altı saatte bir veri dosyasını güncelleyip
Pages’e dağıtır. Yeni maçlarda kaynak gecikmesi ve dağıtım süresi ek gecikme yaratabilir.
Son üç günün maçları düzeltmeler için tekrar alınır; daha eski maçlar önbellekten gelir.
Kaynak erişilemezse önceki doğrulanmış veri korunur ve arayüzde uyarı gösterilir.
GitHub zamanlanmış işleri gecikebilir; etkinliği olmayan herkese açık depolarda 60 gün
sonra devre dışı kalabilir. Actions sekmesinden tekrar etkinleştirilebilir.
[GitHub zamanlanmış iş belgeleri](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Yerel Pages önizlemesi ve kontroller:

```bash
uv run python scripts/export_pages.py
uv run python -m http.server 8502 --directory web
node --test tests/pages_math.test.mjs
```

Node testi için `tests/pages_reference.json`, yayımlanan maçların Python referansını
saklar. Bu dosya güncellendiğinde `scripts/check_pages.py` ile yeniden üretilebilir.
Pages ayarı **Settings → Pages → Source → GitHub Actions** olmalıdır.

## Maçın hikâyesi — özgün AI yorumları

Maç seçildiğinde en üstte o maça özel bir başlık, kısa açıklama ve bunları destekleyen
kanıt kartları görünür. Metin sabit cümlelerden seçilmez: Groq üzerinden
`openai/gpt-oss-120b` modeline maç bulguları gönderilerek üretilir.
Ücretsiz planın kotası kullanılır; kota dolunca mevcut analiz kullanılabilir kalır.
GitHub Pages model çalıştırmaz; güncelleme sırasında üretilen metni yayımlar.
Ziyaretçiler model indirmez, API anahtarı veya hesap gerekmez.

Kanıt katmanı toplam xG, şut başına xG, devrelere göre xG, kendi kalesine goller hariç
gol–xG farkı, galibiyet olasılıkları ve kazananın **en az gerçekleşen gol farkıyla**
kazanma olasılığını hesaplar. Son ölçü tek bir tam skorun düşük olasılığından farklıdır;
beraberlikte yönlü skor farkı ölçüsü verilmez. Sıfır şutta ortalama xG tanımsızdır.

[Groq şemalı çıktı API’sinin](https://console.groq.com/docs/structured-outputs) strict JSON modu kullanılır.
Modelden sayısız Türkçe metin ve kanıt kimlikleri alınır; sayılar uygulamanın hesabından
gelir. Geçersiz kanıt bağlantıları, metindeki rakamlar/HTML ve belirli desteklenmeyen
iddialar reddedilir; bir düzeltme denemesi yapılır. Bunlar dil modelinin her yorumunun
anlamsal olarak doğru olduğunu garanti etmez. Özellikle küçük modelin Türkçesi ve
çıkarımları gözden geçirilmelidir. Yorumlar şut kalitesiyle sınırlıdır; tüm oyun kalitesi,
pres, topa sahip olma veya kesin hak edilen sonuç iddiası değildir.

Maç verisi değişirse SHA-256 parmak izi eski yorumu geçersiz kılar; eski veriye ait
cümle yeni istatistiklere iliştirilmez. Model erişilemez veya çıktı kontrolleri geçmezse
AI yorumun hazır olmadığı belirtilir; sayısal analiz ve kanıtlar kullanılabilir kalır.
Hazır bir şablon AI yorumu gibi sunulmaz. Kaynak xG uyarıları korunur.

GitHub Actions kurulumu: Groq anahtarını depo **Settings → Secrets and variables →
Actions** bölümüne `GROQ_API_KEY` adıyla ekle. Anahtar kaynak koda veya `web/` içine
konmaz. Actions yalnızca maçın sayısal bulgularını API’ye gönderir ve hazır metni yayımlar.
Anahtar yoksa yalnızca kanıtlar hazırlanır. İlk kalite kontrolü için Actions işini
`preview=true`, `story_limit=3` ile çalıştır; `match-stories` çıktısını incele. Önizleme
siteyi değiştirmez ve ayrı önbellek kullanır. Yorumlar kontrol edildikten sonra depo
Actions değişkeni `ENABLE_AI_STORIES=true` ayarlanarak düzenli üretim açılır. Yerel Groq üretiminde anahtarı ortam değişkeni
olarak sağla; komut `uv run python scripts/generate_stories.py --provider groq`.

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

Actions her veri güncellemesinde en yeni maçlara öncelik vererek en fazla yirmi
eksik/değişmiş yorumu üretir; geçerli yorumları önbellekte tutar. Sonraki
çalışmalar kalan maçlarla devam eder; analiz kapsamı daraltılmaz. Elle çalıştırmada
`story_limit` artırılarak bütün eksik yorumlar tek çalışmada üretilebilir.
Groq çağrıları arasında kota için beklenir; sınırlama yanıtında bir tekrar denemesi yapılır.
API erişimi başarısız olsa da kanıtlarla site yayımlanır. Üretilen metinlerin gerçek maçlar
üzerinde anlamsal kalite kontrolü, API anahtarı eklendikten sonra tamamlanmalıdır.
