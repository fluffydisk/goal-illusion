# Goal Illusion — Geliştirme planı ve kararlar

Türkçe, bilgisayarda çalışan bir Streamlit paneli. Kullanıcı gerçek bir maçın skorunu,
şut kalitesini ve aynı şutlardan oluşabilecek skorları karşılaştırır. İlk sürümde AI
yalnızca geliştirme yardımcısıydı; hikâye katmanında ücretsiz bir dil modeli eklenir.
Nihai ürün hedefleri korunur; aşamalar yalnızca uygulama sırasını belirler.

## İlk sürüm

- StatsBomb açık veri kataloğu: turnuva → sezon → maç.
- Ağ gerektirmeyen İngiltere–Senegal (3–0), Dünya Kupası 2022 örneği.
- Skor, xG, şut sayısı ve gerçek skorun model altındaki olasılığı.
- Kazanma/beraberlik/kaybetme olasılıkları, skor ısı haritası, en olası beş skor.
- Şut haritası, maç boyunca birikimli xG, kısa deterministik Türkçe yorum.
- Kaynak atfı, resmi StatsBomb logosu, veri lisansı ve yöntem açıklaması.

## Matematik ve veri

- Python 3.12, uv, Streamlit, NumPy, pandas, Plotly, requests.
- Takım başına tam Poisson-binomial dağılımı; iki dağılımın dış çarpımından skor matrisi.
- Şutların ve takımların bağımsızlığı varsayılır. Sonuç, gerçekleşmiş şutlara koşulludur.
- Seri penaltılar hariç; uzatma varsa kapsam 120 dakikadır. Kendi kalesine goller sabit
  katkı olarak bir kez eklenir. xG toplamına dahil edilmez.
- Eksik veya geçersiz xG analizi durdurur. Eksik konum yalnızca şut haritasını etkiler.
- xG grafiği devreler arası saat sıfırlanmasını ve duraklama dakikalarını korur.
- Ağ zaman aşımı, süreli önbellek, yenileme düğmesi ve çevrimdışı alternatif vardır.
- Isı haritası yalnızca görünümü keser; gizli kuyruk olasılığı belirtilir.

## Kabul ölçütleri

Tek komutla açılan uygulamada gerçek bir maç için kartlar ve grafikler tutarlı olmalı.
Örnek internet olmadan çalışmalı. Analiz testleri toplam olasılığı, beklenen golü,
elle hesaplanabilen skorları ve uç durumları doğrulamalı. Veri ve uygulama testleri
uzatma, kendi kalesine gol, seri penaltı, ağ hatası ve yeniden denemeyi kapsamalı.

İlk sürümde canlı maç, hesap sistemi, CSV yükleme, kendi xG modelimiz ve buluta yayın
ertelenmişti. GitHub Pages yayını aşağıdaki genişletmede tamamlandı.

## Güncel ligler — 11 Ekim 2026 genişletmesi

Kullanıcı Süper Lig ve Bundesliga'nın en yeni maçlarını ücretsiz olarak istedi;
web scraping/halkın erişebildiği web verisinin okunmasını açıkça tercih etti.

- FotMob web JSON'u için ayrı sağlayıcı eklendi; API anahtarı ve ödeme yok.
- Lig → kaynaktaki sezon → bitmiş maç seçimi; en yeni maçlar önce gelir.
- 15 dakika önbellek ve elle hemen yenileme; tüm siteyi toplu tarama yok.
- Şut bazlı xG ortak modele dönüştürülür; eksik değerler tahmin edilmez.
- Kaynak adı, maç bağlantısı ve veri alım zamanı korunur; StatsBomb logosu yalnızca
  StatsBomb maçlarında gösterilir.
- FotMob maçında skor veya toplam şut kaydı eksikse analiz durur. Özet xG ile şut
  xG toplamı farklıysa fark belirtilir ve ham şut değerleri kullanılır.
- Kaynak değişiklikleri/erişim kesintileri açıklanır. Ücretsiz web erişiminin sürekli
  ve her maçta eksiksiz olması garanti edilemez.

## GitHub Pages yayını

Kullanıcı herkese açık GitHub deposu ve Pages bağlantısı istedi. Streamlit korunur;
Pages için `web/` içinde tarayıcıda çalışan bağımsız uygulama eklenir. Sunucu gerektirmeyen
JavaScript hesabı Python referansı ile doğrulanır. Güncel sezon verisi GitHub Actions
üzerinden altı saatte bir alınır; doğrudan ziyaretçi tarayıcısından FotMob’a istek yapılmaz.
Kaynak hataları mevcut doğrulanmış maçları silmez. Maç ID’li paylaşım bağlantıları vardır.

## Hikâye ve kanıt katmanı

Nihai amaç korunur: taraftar maç seçince veriden üretilmiş özgün bir üst cümle görür,
aşağı kaydırınca bu yorumu destekleyen bulgulara ve ayrıntılı grafiklere erişir.

1. **Kanıt:** toplam/ortalama xG, devreler, şut golleri–xG, olası sonuçlar ve skor
   farkının yönlü kuyruk olasılığı; kendi kalesine goller ayrı değerlendirilir.
2. **Özgün metin:** Groq ücretsiz kotası ve güçlü model ile veriye dayalı Türkçe başlık ve kısa açıklama;
   sabit if/else başlıkları kullanılmaz. Kanıt kimlikleri model çıktısında korunur.
3. **Sunum:** Pages ve Streamlit'te üstte yorum, hemen altında seçilmiş kanıtlar;
   mevcut ayrıntılı istatistikler aşağıda korunur.
4. **Ücretsiz yayın:** Actions yeni/değişen maçlara metin üretip statik dosya yayımlar;
   değişmeyen maçlarda yorum tekrar üretilmez. Yayın süresini sınırlamak için her
   çalışmada yirmi eksik yorum üretilir; sonraki çalışmalar kalan maçlarla devam eder.
   Nihai kapsam bütün doğrulanmış maçlardır. Ziyaretçiler model çalıştırmaz.
5. **Doğrulama:** yapı, kanıt, sayı/HTML ve belirli desteklenmeyen iddia kontrolleri;
   eski yorumları parmak iziyle geçersiz kılma. Model yokken yorum uydurulmaz.

Küçük yerel modeller gerçek maç denemelerinde yeterli kaliteyi sağlayamadı. Groq
bağlantısı eklendi; gerçek API çıktılarının dil/anlam kontrolü anahtar eklendikten
sonra tamamlanacak. Dilin/anlamın kusursuzluğu otomatik kontrollerle garanti edilemez. Şut verisinden tüm oyunun kalitesi
çıkarılamaz; daha kapsamlı futbol yorumu için yeni veri sinyalleri gerekir.
