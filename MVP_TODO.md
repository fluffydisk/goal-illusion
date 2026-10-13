# Goal Illusion — MVP yol haritası

## Bu tur: maç bulma ve arayüz

- [x] Kompakt üst çubuk, açık zemin, beyaz paneller ve sade tipografi.
- [x] Skor ve temel istatistikler önce; AI yorumu destekleyici bölümde.
- [x] Tarihlere ayrılmış, en yeni maçtan başlayan sonuç listesi.
- [x] Lig içindeki takımlar için filtre; ev sahibi ve deplasman maçları birlikte.
- [x] Takım/rakip araması; Türkçe karakterler ve Alman aksanları için tolerans.
- [x] Boş sonuç açıklaması, filtre temizleme ve seçili maç vurgusu.
- [x] Mobilde açılır maç seçimi; skor sayfanın üstünde kalır.
- [x] Mevcut maç paylaşım bağlantıları ve AI okuyucusu korunur.

## Tamamlandı: Türkçe / İngilizce (web)

Tek bir bütün olarak ele alınmalı; yalnızca düğmeleri çevirmek yeterli değildir.

- [x] Arayüz metinlerini `tr` ve `en` sözlüklerine taşı.
- [x] Dil seçimi, tarayıcı dili varsayılanı ve tercih saklama.
- [x] Tarih, sayı, yüzde, erişilebilir etiketler ve boş/hata durumlarını dile göre biçimlendir.
- [x] Kanıt metinleri ve AI yorumları için dil sözleşmesi ekle.
- [x] Servis istekleri, iş/önbellek anahtarları ve kayıtlı yorumlar dili içersin.
- [x] Türkçe kalite kontrolünü koru; İngilizce için bağımsız doğrulama ekle.
- [x] Paylaşılan maç bağlantısı dil tercihini taşısın.

Doğrulama: Aynı maç iki dilde açılır; farklı dillerin yorumları ve bekleyen işleri birbirine karışmaz. Birim ve tarayıcı testleri geçti. 13 Ekim 2026 canlı İngilizce kontrolünde İngiltere–Senegal için altı kart üretildi; Gemini üretimi ve Groq bağımsız incelemesi geçti. Yerel regresyon testleri yapay yanıtlar kullanır.

Yayımlama: Worker ve Pages birlikte güncellenmeli. Arayüz eski sunucunun `/health` yanıtında İngilizce desteği yoksa İngilizce üretim başlatmaz. Yerel Streamlit sürümü bu aşamada Türkçe kalır.

## Tamamlandı: şut haritası yönleri

- [x] Ev sahibi sağ kaleye, deplasman sol kaleye hücum edecek biçimde çizilir.
- [x] Deplasman koordinatları `(120-x, 80-y)` olarak döndürülür; normal şutlar ve gol yıldızları aynı dönüşümü kullanır.
- [x] Devre ve uzatmalarda yönler sabit; ham şut verisi ve xG hesapları değişmez.
- [x] Takım yönleri lejantta belirtilir. Eksik konumlar veya kendi kalesine goller için konum uydurulmaz.
- [x] İki takımın da gol attığı gerçek maç üzerinde tarayıcı kontrolü yapıldı.

## Tamamlandı: yeni ligler

Eklendi: Premier League, LaLiga, Serie A, Ligue 1. Altı lig ve çevrimdışı örnek birlikte listelenir.

- [x] Lig tanımlarını ortak katalogda tut; Python veri hattı ve web aynı isim/kimlikleri kullansın.
- [x] Kaynak lig kimliğini, güncel sezonu ve şut bazlı xG kapsamını doğrula.
- [x] Her aday için birkaç tamamlanmış maçta skor, şut sayısı, xG ve kendi kalesine gol kontrollerini çalıştır.
- [x] Güncelleme süresi, kaynak erişimi ve dosya boyutunu ölç; gerekirse lig bazında paketle.
- [x] Kaynak kesintisinde önceki doğrulanmış kayıtları koru.
- [x] Doğrulanmamış ligi/maçı seçicide sunma.

13 Ekim 2026 kontrolü: 358 doğrulanmış maç. Süper Lig 62/63, Bundesliga 44/45, Premier League 60/60, LaLiga 77/78, Serie A 60/60, Ligue 1 54/54; ayrıca bir Dünya Kupası örneği. Üç maçın şut/gol kaydı skorla uyuşmadığı için dışarıda. Tam ilk doldurma yaklaşık 151 saniye; analiz paketi 9,37 MB / gzip 1,03 MB. Günlük güncelleme her lig için en fazla 12 detay isteğiyle çalışır; eksik kayıt ve yakın tarihli düzeltmeler sırayla alınır. Aynı geçmişi her çalışmada yeniden indirmez.

## Sonraki küçük iyileştirmeler

- [x] Yerel favori takımlar, tekil kaydedilmiş maçlar ve favori maç filtresi.
- [x] Tüm liglerde arama, mevcut sezonlar ve tarih aralığı filtreleri.
- [ ] Kullanım hakkı ve kalıcı kaynak belirlendiğinde takım armaları.
- [x] Açık, koyu ve sistem temasını izleyen görünüm; tercih cihazda saklanır.

Canlı skor, puan tablosu ve maç öncesi tahmin bu sürümün kapsamına eklenmedi; ürünün odağı tamamlanmış maçların şut analizidir.

## Tamamlandı: şutları keşfetme

- [x] Takım, devre, oyuncu, goller ve yüksek xG (≥ 0,30) filtreleri.
- [x] Dakikaya veya xG değerine göre sıralanabilen şut listesi.
- [x] Listeden şut detayına ve sahadaki işarete klavye ile erişim.
- [x] Görünüm filtreleri toplam xG ve ana analiz hesaplarını değiştirmez.

## Devam sırası

- [x] Takımın kayıtlı maçları için form ve xG özeti; veri kapsamı açıkça belirtilsin. Seçili filtrelerle değişir; son beş sonuçtan maç açılabilir.
- [x] İki maçın hesaplanan istatistiklerini karşılaştırma; paylaşılan bağlantıyla açılır, ortak karşılaştırma CSV indirilebilir.
- [x] Analiz JSON, tüm şutlar CSV ve takım özet CSV dışa aktarma; kaynak ve model bilgisi korunur.
- [x] Açık/koyu temada görünür küçük metrik/legend/not/maç durumu yazılarının kontrastı.
- [x] Mobil alt gezinme, maç seçimine geri dönüş, filtrelerde önceki/sonraki maç, şut/maç klavye erişimi ve skor tablosu başlıkları.

Otomatik devam yalnızca mevcut kullanım penceresi için yetkilidir: 13 Ekim 2026 03:38:06 Europe/Berlin. Limit dolduğunda veya bu saat geçtiğinde durur; yeni pencerenin kotasına geçmez.


## Eklenen MVP kullanım özellikleri

- [x] Takımın iç saha/deplasman özeti, son 12 maçın xG grafiği ve takım CSV.
- [x] Kayıtlı gol şutlarından haritada detay açma; xG rehberi.
- [x] Lig bazında doğrulanmış/verisi beklenen maç kapsamı ve kaynak bağlantıları.
- [x] Favori/tema sekmeler arası eşitleme, favori temizleme/geri alma ve JSON yedeği.
- [x] Doğrulanmış uygulama/veri sürümüyle çevrimdışı kullanım ve PWA yükleme desteği.
- [ ] Yayın öncesi Worker dil desteğini ve gerçek hedef ortamda PWA güncellemesini kontrol et.
- [ ] Kaynak hakları netleştiğinde takım armaları; kullanıcı geri bildiriminden sonraki arayüz düzenlemeleri.

Önceki ardışık çalışmanın heartbeat otomasyonu PAUSED kaldı. O turdaki zamanlayıcı
ve commit/push/deploy kısıtları, aşağıdaki yeni manuel yayın yetkisiyle güncellendi.


## MVP yayın çalışması — kullanıcı tarafından yetkilendirildi

Kullanıcı bu turda kalan yayın adımlarını tamamlayıp GitHub'a gönderme ve MVP'yi
yayımlama yetkisi verdi. Önceki otomatik çalışma penceresi bu manuel yayın talebini
sınırlamaz; heartbeat yeniden açılmayacak.

- [x] Yerel Python/Node testleri ve Ruff kontrolü.
- [x] Türkçe/İngilizce Worker dağıtımı.
- [x] Pages dağıtımına yayın öncesi Python/Node test kapısı ekle.
- [x] MVP kaynaklarını GitHub main dalına gönder ve Pages işini doğrula.
- [x] Canlı sitede Türkçe/İngilizce, mobil, indirilen dosya ve PWA açılışını doğrula.
- [x] Canlı Worker'da gerçek İngilizce üretim ve bağımsız incelemeyi doğrula.
- [ ] MVP sürüm notları ve GitHub sürüm kaydı.

MVP sonrası: lisans/kaynak doğrulanınca takım armaları; kullanıcı geri bildirimine
göre arayüz; yeni diller. Canlı skor ve maç öncesi tahmin bu MVP'ye dahil değil.


## MVP sonrası önerilen küçük işler

- [ ] Maç kimliği ve veri sürümünü içeren hata/geri bildirim bağlantısı.
- [ ] Takım özeti ve seçili filtreleri taşıyan paylaşılabilir bağlantı.
- [ ] Sayısal analizden skor/xG paylaşım görseli; kaynak ve veri tarihi dahil.
