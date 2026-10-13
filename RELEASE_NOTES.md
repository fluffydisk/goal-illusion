# v0.1.0 — MVP · 13 Ekim 2026

[Canlı site](https://fluffydisk.github.io/goal-illusion/)

Goal Illusion, tamamlanmış futbol maçlarının şut verisini gerçek skorla birlikte
incelemek için yayımlandı. Ziyaretçi hesabı veya API anahtarı gerekmez.

## Bu sürümde

- Süper Lig, Bundesliga, Premier League, LaLiga, Serie A ve Ligue 1 için doğrulanmış
  maçlar; lig/takım, sezon, tarih ve favori filtreleri.
- Türkçe/İngilizce arayüz, kanıtlar ve birbirinden ayrı AI yorum işleri.
- Sade spor arayüzü; açık/koyu/sistem tema, mobil alt gezinme ve klavye erişimi.
- Şut haritasında ev sahibi ve deplasman farklı kalelere hücum eder; gol işaretleri
  aynı yön dönüşümünü kullanır. Ham şut verisi ve xG matematiği korunur.
- Takım formu, iç saha/deplasman özeti, son kayıtlı maçların xG grafiği.
- İki maç karşılaştırması; analiz JSON, şut/özet/takım ve karşılaştırma CSV dosyaları.
- Favori yedekleme/içe aktarma ve sekmeler arası tercih eşitlemesi.
- Doğrulanmış uygulama/veri ailesiyle çevrimdışı kullanım ve destekleyen tarayıcılarda
  uygulama yükleme; yeni AI üretimi internet bağlantısı gerektirir.

## Doğrulama

114 Python ve 80 Node testi geçti. GitHub Pages yayını Python/Node/Ruff kontrolleri
geçmeden yapılmaz. Canlı tarayıcıda altı lig, CORS/dil desteği, mobil/koyu görünüm,
gerçek CSV/JSON indirme, favori kalıcılığı, PWA açılışı ve çevrimdışı kullanım doğrulandı.
Mevcut canlı PWA sürümünün yeni önbellek ailesine geçişi ve seçili maçın
internetsiz açılışı ayrıca kontrol edildi.
İngiltere–Senegal örneğinin altı kartlık İngilizce yorumu Gemini tarafından üretildi
ve Groq'un ayrı incelemesiyle onaylandı; gerçek İngilizce okuyucu da kontrol edildi.

## Kapsam ve sonraki adımlar

Kayıtlı maçlar tüm sezonu kapsamayabilir; veri kapsamı ve güncelleme tarihi arayüzde
belirtilir. Olasılıklar gerçekleşen şutlara koşulludur; maç öncesi tahmin veya kesin
bir “hak edilen skor” değildir. Canlı skor ve puan tablosu bu sürüme dahil değildir.

Takım armaları, uygun kaynak/kullanım hakkı doğrulanana kadar başharf gösterimini
kullanır. Yeni diller ve kullanıcı geri bildirimiyle arayüz iyileştirmeleri sonraki
sürümlerde değerlendirilecek.

Önerilen küçük geliştirmeler: maç kimliğiyle hata/geri bildirim bağlantısı,
paylaşılabilir takım/filtre sayfası ve sayısal analizden paylaşım görseli.
