# Geliştirme devam kaydı

## 13 Ekim 2026 — bu sohbetin devamı

Kullanıcı: mevcut 5 saatlik limit dolana kadar yeni özellik eklenmesini istedi.
Bu yetki 13 Ekim 2026 03:38:06 Europe/Berlin (01:38:06 UTC / 1791855486) zamanında
sona eren mevcut pencere içindir. Yeni kota penceresine otomatik geçilmemeli.
Heartbeat otomasyonu: `football-mvp-geli-tirmesine-devam`, bu sohbete bağlı, 15 dakikada bir.
Her çalışma önce kullanım limitini ve zamanı kontrol edip sınır dolduğunda kendini duraklatmalı.

### Tamamlananlar

Önceki turlar: klasik futbol arayüzü, TR/EN arayüz/kanıt/AI sözleşmesi,
yönleri ayrılmış şut/gol haritası. Bunlar hâlâ çalışma ağacında; reset/stash ile silme.

Bu tur:

- Ortak altı lig kataloğu `web/data/leagues.json`; Python ve web aynı isim/kimlikleri okur.
- Yeni Premier League, LaLiga, Serie A ve Ligue 1 canlı kaynakla doğrulandı.
- `scripts/export_pages.py`: geçmişi koruyan, bütçeli ve kesintilere dayanıklı
  güncelleme. Yeni maçlar ve yakın tarihli düzeltmeler dönüşümlü, yakın tarihli
  düzeltmeler en eski retrieved_at kaydından başlayarak alınır.
- Altı ligde 358 doğrulanmış maç (357 lig + 1 Dünya Kupası örneği).
  Üç skor/şut tutarsızlığı dışarıda; UI bunu kapsam notu olarak gösterir.
- Favori takım, kaydedilmiş maç, favori filtresi. Kimlikler kaynakla birlikte
  saklanır; StatsBomb ve FotMob takım kimlikleri karışmaz. Depolama kapalıysa
  oturum içinde çalışır. `web/preferences.mjs`.
- Tüm ligler, sezon ve tarih aralığı filtreleri. Takım kimlikleri kaynakla eşleştirilir.
- Açık/koyu/sistem tema tercihi, kalıcılık ve sistem değişimine tepki. `web/theme.mjs`.
- Takım/devre/oyuncu/gol/yüksek xG şut filtreleri, sıralanabilir şut tablosu.
  Ana xG/metrikler filtrelerden etkilenmez. `web/shot-browser.mjs`.

### Doğrulama

- 111 Python testi geçti; ruff kontrolü geçti.
- 68 Node testi geçti; 358 gerçek maçta tarayıcı matematiği Python referansına eşit.
- `check_mvp_features_ui.mjs`: yeni ligler, favoriler/kalıcılık, global lig/sezon/tarih,
  şut filtrelerinin xG'yi koruması, tablo, sistem/kayıtlı koyu tema, depolama engeli,
  320px İngilizce görünüm geçti.
- Önceki tur AI Worker dry-run derlemesi ve TR/EN UI testleri geçti.
- Gerçek İngilizce AI üretimi henüz denenmedi. Servis testleri yapay yanıttır;
  gerçek provider veya ücretli servis çağrısı otomatik iş kapsamında başlatılmamalı.

### Nasıl kontrol edilir

```
.venv/bin/python -m pytest -q
.venv/bin/ruff check .
node --test tests/*.test.mjs service/*.test.mjs
PLAYWRIGHT_MODULE=/home/obozkurt/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs node scripts/check_mvp_features_ui.mjs
```

Yerel sunucu zaten 127.0.0.1:8765 üzerinde `web/` servis ediyor. Gereksiz ikinci
sunucu başlatma. Testlerde AI yollarını taklit et; üretim başlatma.
`web/data/analysis.json` ignore edilir; matches/stories değişirse evidence-only
üretim ve build_analysis_bundle ile yeniden oluşturulmalıdır.
Veri değişmediyse export'u veya referans üretimini tekrar çalıştırma.

### Sonraki yararlı özellik

Önce takım filtresi seçildiğinde kayıtlı maçlar üzerinden son form ve xG özeti.
Takım/maç verileri dışında çıkarım yapma; eksik sezon kapsamını açıkça belirt.
Sonra iki maç istatistiği karşılaştırması, CSV/JSON dışa aktarma, erişilebilirlik.
Her özellik iki dil, iki tema ve mobil görünümle çalışmalı.

Commit, push ve deploy yapılmadı. Kullanıcının başka yetkisi olmadıkça yayımlama.

## 13 Ekim 2026 01:31–01:36 Berlin — takım özeti

Başlangıçta 5 saatlik kullanım %68; ordinaryUsageAllowed true, pencere sonundan önce.

Tamamlandı: `web/team-summary.mjs` ile kayıtlı maçlardan takım form/xG özeti.
Takım filtresi seçildiğinde ana analizin üzerinde açılır özet görünür. Sezon, tarih,
arama ve favori filtresiyle aynı maç kümesini kullanır. G/B/M, gol toplamları,
maç başına üretilen/rakip xG ve son beş sonuç gösterilir. Form kartı ilgili maçı açar.
Kapsamın tüm sezon olmayabileceği, sıralamanın yeniden eskiye olduğu ve form
skorlarında seçili takımın önce gösterildiği açıklanır. Boş kapsamda ortalama
uydurulmaz; panel boş durum gösterir. Kaynak kimlikleri ve yinelenen maçlar korunur.

Kontroller: 2 yeni birim testi, toplam 8 ilgili Node testi; `check_team_summary_ui.mjs`
takım kapsamı, gerçek veriden hesaplanan özet, formdan maça geçiş, boş sonuç,
TR/EN, koyu tema, 320px, tarih sınırı ve temizleme kontrolleri geçti.
Veri ve AI servisi değişmedi; export ve gerçek model çağrısı yapılmadı.

Sonraki çalışma: iki maçın hesaplanan istatistiklerini karşılaştırma.
Mevcut çalışma ağacını koru; commit/push/deploy hâlâ yetkilendirilmedi.

## 13 Ekim 2026 01:35 sonrası — ardışık çalışma

Kullanıcı 15 dakika aralığı istemedi; sohbet bitmeden ardışık çalışma istedi.
Heartbeat kendi isteğiyle PAUSED yapıldı. Kullanıcı bilgisayarın 100 dakika sonra
kapanacağını söyledi: bu mesajdan yaklaşık 03:15 Berlin öncesinde çalışma kaydedilmeli.
5 saatlik kullanım penceresi ve görünür ek bütçe yine sınırdır; yeni kota penceresine geçme.

Tamamlandı:
- `match-metrics.mjs`: mevcut Poisson-binomial hesabından ortak sayısal metrikler.
- İki maçın skor/xG/şut/olasılık karşılaştırması; arama, farklı kaynak notu, compare=ID
  paylaşım parametresi ve yeniden yükleme.
- `export-data.mjs`: tam analiz JSON, şutlar CSV, takım özet CSV. Ham veriler, kaynağı,
  kendi kalesine gol katkılarını ve model sınırlamalarını korur. Görünüm filtreleri
  indirmeyi eksiltmez. CSV metin alanları doğru kaçış ve formül koruması kullanır.
- Maç seçimlerinde browser history; geri/ileri ve lig değişimi geri dönüşü.
- Maç listesinde ok/Home/End ve Enter; bilinmeyen bağlantı için açıklama.

Kontroller: 4 yeni metrik/CSV birim testi geçti; gerçek JSON/CSV indirmeleri ve
karşılaştırma bağlantısı, yeniden yükleme, TR/EN/koyu/320px tarayıcı kontrolleri geçti.
`check_navigation_ui.mjs` keyboard, browser back/forward, cross-league restore,
invalid-link notice geçti. Ana model değişmedi; yayın yapılmadı.

Tamamlandı: takım iç saha/deplasman filtresi ve şut haritası klavye/ARIA geliştirmesi.
Venue filtresi hem maç listesine hem takım özetine uygulanır. Şut haritası bir
ARIA group; tek tek şut düğmeleri erişilebilirlik ağacında görünür. Ok/Home/End
ile gezilir. Skor tablosunda caption, başlık scope'ları ve gerçek skora erişilebilir
etiket vardır. İlgili birim ve browser AX kontrolleri geçti.

Kayıtlı şut gollerinin listesi ve golün sahadaki detayına geçiş eklendi.
Kendi kalesine goller için zaman/konum uydurulmaz. xG rehberi eklendi.
Sonraki küçük iş: veri kapsamını daha açık göstermek; sonra karşılaştırma/indirme
ve ana akış için bütünleşik regresyon kontrolü.


## 13 Ekim 2026 02:20–02:30 — veriyle çalışma ve çevrimdışı MVP

- Lig bazında kapsam tablosu; sayılar gerçek paketten, durum notu seçili lig kapsamından.
- Takım son 12 maç xG grafiği; grafik noktası maça gider. İç saha/deplasman ve
  diğer filtreler hem özete hem gerçek indirilen takım CSV'sine uygulanır.
- İngilizce tekil/çoğul maç sayıları düzeltildi.
- Favori/tema sekmeler arası eşitlenir; değişiklik en son saklanan tercihle birleşir.
  Temizleme geri alınabilir. JSON yedek/içe aktarma kaynak kimlikleri, şema,
  200 KB dosya ve 500 takım/maç sınırını doğrular. Hatalı dosya seçimleri korur.
- PWA: manifest ve mevcut geometrik ikonun PNG boyutları; SHA-256 ile doğrulanan
  tam uygulama/veri ailesi. Karışık veri zaman damgası build'i durdurur. Başarısız
  install eski önbelleği korur; güncel varlık farklıysa eski tutarlı sürüm kullanılır.
  Yeni worker etkinleşince mevcut sayfa yenilenir. AI servisi önbelleğe alınmaz.
  Önbellek paketi/çevrimdışı durumunda yeni AI üretimi kapalı. Yerel önizleme
  varsayılan service worker kullanmaz; test parametresi offline=1'dir.
- Mobil alt gezinme: istatistik/şut bağlantıları, maç seçimine dönme ve odak koruma.

Kontroller: 78 Node testi ve 2 worker çevrimdışı senaryo testi geçti. Yeni 3 Python
build testi geçti. Gerçek Chromium'da çevrimdışı reload/başka maç açma, TR/EN,
320px/koyu, ağ geri dönüşü; karşılaştırma ve üç gerçek indirme; takım özeti/CSV;
AI sentetik yaşam döngüsü ve odak testleri geçti. Gerçek AI veya yayın yapılmadı.
Ruff ve diff whitespace kontrolü geçti. Mobil gezinme doğrulaması geçti: panel açma/odak, seçimde kapanma, TR/EN,
320px/koyu, footer görünürlüğü ve masaüstünde gizleme.

Kullanım 02:25 Berlin civarında %94. Yeni kota kullanılmayacak; heartbeat PAUSED.
Sonraki çalışma: hedef yayın ortamında dil/PWA kabul kontrolü; kaynak hakları
netleşmeden arma indirme ve yeni servis ekleme. Mevcut çalışma ağacını koru.


## 13 Ekim 2026 02:30 sonrası — son mobil akış

Seçili filtrelerdeki maçlar arasında önceki/sonraki geçiş düğmeleri eklendi.
Liste sınırı, seçim filtre dışında veya boşsa ilgili düğmeler kapanır. Maç geçişi
browser geçmişini korur, düğme odağı kaybolmaz; takım/sezon/tarih filtreleri korunur.
Gerçek browser testi bu durumları, TR/EN, koyu tema ve 320px'i doğruladı.
Eski locale UI testinin geniş `.panel summary` seçicisi, yeni takım özetiyle yanlış
kapalı paneli buluyordu; hedef analiz bulguları paneline kalıcı ID verilip test düzeltildi.
Bu bir test seçicisi hatasıydı; İngilizce bulgular/pitch testi tekrar çalıştırıldı.
Kullanım bu noktada %97; yeni büyük özellik başlatılmıyor.

Son bütünleşik sonuç: 114 Python testi, toplam 80 Node testi (78 genel + 2 offline
worker senaryosu) geçti. Ana MVP, tema/favori sekme eşitlemesi, TR/EN okuyucu ve
iki takımın şut/gol konumları, karşılaştırma/indirme, takım form/CSV, mobil gezinme
ve filtrelenen maç geçişi tarayıcı kontrolleri geçti. Offline açılış ve ağ geri dönüşü
son frontend sürümünde tekrar doğrulandı. Ruff/diff/syntax kontrolleri temiz.

Gerçek tarayıcı PWA güncelleme testi geçti: yeni sürüm etkinleştiğinde reload,
seçili maç/skorun korunması, tek önbellek ailesi ve hash uyuşmazlığında önceki
geçerli sürümle çevrimdışı devam doğrulandı. Geçici HTTP sunucusu ve dosyalar
test sonunda temizlenir; gerçek yayın ortamı kabul kontrolü hâlâ yapılmadı.

Karşılaştırma CSV eklendi: seçilen iki maç için dört takım satırı, maç kimliği,
tarih, xG/devre/şut/koşullu olasılık/kaynak alanları tek dosyada. Tek maç özeti
aynı ortak satır üretimini kullanır. İki ilgili birim testi geçti; gerçek indirme
kontrolü karşılaştırma tarayıcı testine eklendi.

Karşılaştırma CSV gerçek tarayıcı indirme testi geçti (iki maç kimliği ve dört
takım satırı); boş karşılaştırmada indirme kapanır. Küçük yazı kontrast kontrolü
maç listesi MS/FT etiketinde yaklaşık 3,4–3,6:1, açık tema deplasman açıklamasında
3,79:1 buldu. MS/FT etiketi tema muted rengine, açık tema turuncusu #ae580e'ye
alındı. Görünür metrik/legend/not/liste küçük yazıları her iki temada 4,5:1 eşiğiyle
test edilir. Service worker hash ailesi bu son CSS değişiminden sonra yenilendi.

Son kontrast tarayıcı testi açık/koyu temada geçti. Son görsel kontrolün ekranları
`.runtime/mvp-desktop.png` ve `.runtime/mvp-mobile.png` olarak kaydedildi (yerel,
Git dışı). Son offline hash sürümü: eae6cdd1223b3aaec6e1. Çalışma kullanımı %99'a
ulaştı; güvenli tamamlanmış özellik sınırında checkpoint alındı. Yeni geliştime veya
sonraki kota penceresi otomatik başlatılmaz; heartbeat PAUSED kalır. Commit/push,
deploy ve gerçek AI üretimi yapılmadı. Bilgisayarın kapanma zamanlayıcısı değiştirilmedi.


## MVP yayın hazırlığı — 13 Ekim 2026

Kullanıcı kalan adımları tamamlayıp GitHub'a gönderme/yayımlama yetkisi verdi.
GitHub main ve origin/main d4f7797'de; geliştirmeler çalışma ağacındaydı.
114 Python, 80 Node ve Ruff kontrolü tekrar geçti. Worker dağıtıldı:
4e758fa0-ccdc-414a-ac37-279cf01c5bb3. Mevcut gizli sağlayıcı anahtarları korunur;
anahtarlar okunmadı veya kaynak dosyasına konmadı.
Pages işine yayın öncesi Python/Node/Ruff kontrolü eklendi. Takım armaları için
uygun yeniden kullanım kaynağı doğrulanamadı; başharf gösterimi korunuyor,
arma işi yayın engeli yerine açık MVP sonrası işi olarak kalıyor.

MVP kaynakları f0efed8 ile main'e gönderildi. İlk yayın kurulumu pip editable paket
keşfinde durdu; uv.lock kullanan ortamla düzeltildi. CI'de analysis.json Git dışı
olduğu için i18n testi girdisini bulamadı; test öncesi coherent bundle build eklendi.
Bu kapılar bozuk yayını önledi. fef5495 için Pages build/deploy başarılı:
https://github.com/fluffydisk/goal-illusion/actions/runs/38368214397

13 Ekim 2026 10:23 Berlin: 3869118 için gerçek İngilizce kabulü geçti. Tek POST,
Gemini üretimi ve Groq bağımsız incelemesi; altı kart, attempt=0. Hazır sonuca GET
ile ayrıca yerel kalite/kanıt doğrulaması uygulandı. Canlı tarayıcı: altı lig,
Worker CORS/diller, iki maç CSV, TR/EN, koyu/320px, favori kalıcılığı, PWA install,
offline reload/JSON download ve ağ geri dönüşü geçti. Tarayıcı testi AI POST yapmaz.
