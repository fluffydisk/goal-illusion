"""Başlat: uv run streamlit run app.py"""

import json
import os
from html import escape
from pathlib import Path

import pandas as pd
import streamlit as st

from goal_illusion.analysis import analyze
from goal_illusion.charts import outcome_chart, score_heatmap, shot_map, xg_race
from goal_illusion.data import (
    SOURCE_URL,
    DataError,
    Match,
    fetch_json,
    load_example,
    normalize_events,
)
from goal_illusion.fotmob import (
    LEAGUES,
    completed_matches,
    fetch_fotmob,
    normalize_fotmob,
    seasons_from_league,
)
from goal_illusion.narrative import (
    DEFAULT_MODEL,
    GROQ_MODEL,
    PROMPT_VERSION,
    generate_narrative,
    narrative_matches,
)
from goal_illusion.story import build_evidence

st.set_page_config(
    page_title="Goal Illusion · Skorun arkasındaki gerçek", page_icon="⚽", layout="wide"
)


@st.cache_data(ttl=3600, show_spinner=False)
def catalog(path: str) -> list:
    return fetch_json(path)


@st.cache_data(ttl=86400, show_spinner=False)
def match_events(match_id: int) -> list:
    return fetch_json(f"events/{match_id}.json")


@st.cache_data(ttl=900, show_spinner=False)
def fotmob_league(league_id: int, season: str | None = None) -> dict:
    params = {"id": league_id}
    if season:
        params["season"] = season
    return fetch_fotmob("leagues", **params)


@st.cache_data(ttl=900, show_spinner=False)
def fotmob_match(match_id: int, season: str):
    return normalize_fotmob(fetch_fotmob("matchDetails", matchId=match_id), season)


def select_fotmob():
    league = st.sidebar.selectbox("Lig", list(LEAGUES))
    league_id = LEAGUES[league]
    with st.spinner("Güncel lig ve sezon bilgisi yükleniyor…"):
        current = fotmob_league(league_id)
    seasons = seasons_from_league(current)
    season = st.sidebar.selectbox("Sezon", seasons)
    with st.spinner("Bitmiş maçlar yükleniyor…"):
        payload = (
            current
            if season == current["details"]["selectedSeason"]
            else fotmob_league(league_id, season)
        )
    if payload["details"]["selectedSeason"] != season:
        raise DataError("Kaynak seçilen sezonu döndürmedi. Sezon değiştirip tekrar dene.")
    matches = completed_matches(payload)
    if not matches:
        raise DataError("Bu sezonda henüz tamamlanmış maç yok. Başka bir sezon seçebilirsin.")
    st.sidebar.caption(
        f"{len(matches)} bitmiş maç · En yeni maçlar başta. "
        "Şut/xG kapsamı maç seçilince kontrol edilir."
    )
    record = st.sidebar.selectbox(
        "Maç",
        matches,
        format_func=lambda m: (
            f"{m['status']['utcTime'][:10]} · {m['home']['name']} – "
            f"{m['away']['name']} · {m['status']['scoreStr']}"
        ),
    )
    with st.spinner("Şut bazlı xG verisi yükleniyor…"):
        return fotmob_match(int(record["id"]), season), False


def select_data():
    st.sidebar.markdown("## Maçını seç")
    mode = st.sidebar.radio(
        "Veri kaynağı", ["Örnek maç · çevrimdışı", "FotMob · güncel ligler", "StatsBomb kataloğu"]
    )
    if mode == "Örnek maç · çevrimdışı":
        st.sidebar.caption("Dünya Kupası 2022 · Son 16\n\nİngiltere – Senegal · 3–0")
        return load_example(), True
    if st.sidebar.button("↻ Veriyi yenile / tekrar dene", use_container_width=True):
        catalog.clear()
        match_events.clear()
        fotmob_league.clear()
        fotmob_match.clear()
    if mode == "FotMob · güncel ligler":
        st.sidebar.caption(
            "Ücretsiz web verisi · API anahtarı gerekmez. "
            "Veri en fazla 15 dakika önbellekte tutulur; düğmeyle hemen yenileyebilirsin."
        )
        return select_fotmob()
    with st.spinner("Maç kataloğu yükleniyor…"):
        competitions = catalog("competitions.json")
    if not competitions:
        raise DataError("Katalogda turnuva bulunamadı. Çevrimdışı örnek maçı açabilirsin.")
    competitions = sorted(
        competitions, key=lambda c: (c["competition_name"], c["season_name"]), reverse=True
    )
    groups = sorted(
        {
            (c["competition_id"], c["competition_name"], c["competition_gender"])
            for c in competitions
        },
        key=lambda c: (c[1], c[2]),
    )
    group = st.sidebar.selectbox(
        "Turnuva",
        groups,
        format_func=lambda c: f"{c[1]} · {'Kadın' if c[2] == 'female' else 'Erkek'}",
        index=next((i for i, c in enumerate(groups) if c[1] == "FIFA World Cup"), 0),
    )
    seasons = [c for c in competitions if c["competition_id"] == group[0]]
    season = st.sidebar.selectbox("Sezon", seasons, format_func=lambda c: c["season_name"])
    with st.spinner("Maçlar yükleniyor…"):
        records = catalog(f"matches/{group[0]}/{season['season_id']}.json")
    if not records:
        raise DataError("Bu turnuva/sezon için maç bulunamadı. Başka bir sezon seç.")
    matches = sorted(
        [Match.from_record(record) for record in records], key=lambda m: m.date, reverse=True
    )
    match = st.sidebar.selectbox(
        "Maç", matches, format_func=lambda m: f"{m.date} · {m.home} – {m.away}"
    )
    with st.spinner("Şutlar ve maç olayları yükleniyor…"):
        data = normalize_events(match, match_events(match.id))
    return data, False


st.markdown(
    """
<style>
.block-container {max-width: 1280px; padding-top: 4rem; padding-bottom: 2rem;}
.eyebrow {color: #B6F36B; letter-spacing: .2em; font-size: .75rem; font-weight: 700;}
.hero {border: 1px solid #304139; border-radius: 18px; padding: 24px;
       background: linear-gradient(115deg, #172b21, #172129); margin: 18px 0 24px;}
.hero-score {font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 800; line-height: 1.3;}
.hero-meta {color: #A4B2BF; margin-bottom: 10px; font-size: .85rem;}
.hero-team {font-size: clamp(1rem, 2.2vw, 1.4rem); font-weight: 600;}
[data-testid="stMetric"] {background: #172129; border: 1px solid #26343e;
                         border-radius: 12px; padding: 16px;}
</style>
""",
    unsafe_allow_html=True,
)

st.markdown('<div class="eyebrow">GOAL ILLUSION / MAÇ ANALİZİ</div>', unsafe_allow_html=True)
st.title("Skor her şeyi anlatır mı?")
st.caption("Şut kalitesinden olası skorlara: maçın sonucuna bir de bu açıdan bak.")

try:
    data, offline = select_data()
except DataError as error:
    st.error(str(error))
    st.info("Sol menüden ‘Örnek maç · çevrimdışı’ seçeneğini açabilirsin.")
    st.stop()

match = data.match
home_shots, away_shots = data.shots_for(match.home_id), data.shots_for(match.away_id)
home_xg, away_xg = sum(s.xg for s in home_shots), sum(s.xg for s in away_shots)
result = analyze(
    [s.xg for s in home_shots], [s.xg for s in away_shots], data.home_fixed, data.away_fixed
)
score_probability = result.score_probability(data.home_score, data.away_score)
top_scores = result.top_scores()

facts = build_evidence(data)
try:
    published = json.loads((Path(__file__).parent / "web/data/stories.json").read_text())
    narrative = published.get("stories", {}).get(str(match.id), {}).get("narrative")
except (OSError, ValueError):
    narrative = None
key = f"narrative:{PROMPT_VERSION}:{facts['fingerprint']}"
narrative = st.session_state.get(key, narrative)
if not narrative_matches(narrative, facts):
    narrative = None

with st.container(border=True):
    st.caption("MAÇIN HİKÂYESİ · AI YORUMU" if narrative else "MAÇIN BULGULARI")
    if narrative:
        st.subheader(narrative["headline"])
        st.write(narrative["summary"])
        for card in narrative["cards"]:
            with st.expander(card["title"]):
                st.write(card["text"])
    else:
        st.subheader("Bu maçın AI yorumu henüz hazır değil.")
        use_groq = bool(os.getenv("GROQ_API_KEY"))
        if st.button("Maç yorumunu üret" if use_groq else "Yerel modelle maç yorumunu üret"):
            try:
                with st.spinner("Maç bulgularından özgün yorum üretiliyor…"):
                    narrative = generate_narrative(
                        facts,
                        base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
                        provider="groq" if use_groq else "ollama",
                        model=GROQ_MODEL if use_groq else DEFAULT_MODEL,
                    )
                st.session_state[key] = narrative
                st.rerun()
            except DataError as error:
                st.warning(str(error))
                st.caption(
                    "Groq bağlantısını ve ücretsiz kotayı kontrol edebilirsin."
                    if use_groq
                    else "Yerel model deneyseldir; Ollama servisi gerekir."
                )
    evidence_by_id = {e["id"]: e for e in facts["evidence"]}
    selected_ids = list(dict.fromkeys(i for c in narrative["cards"] for i in c["evidence_ids"])) if narrative else list(evidence_by_id)[:3]
    for evidence_id in selected_ids:
        evidence = evidence_by_id[evidence_id]
        st.markdown(f"**{evidence['label']}**")
        st.write(evidence["text"])
    st.caption(
        "Yorum model tarafından, sayısal kanıtlar hesaplama katmanında üretilir. "
        "Gerçekleşmiş şutlarla sınırlıdır; tüm oyun performansını veya hak edilen sonucu ölçmez."
    )
with st.expander("Tüm analiz bulguları"):
    for evidence in facts["evidence"]:
        st.markdown(f"**{evidence['label']}**")
        st.write(evidence["text"])

st.markdown(
    f"""
<div class="hero">
  <div class="hero-meta">{escape(match.competition)} · {escape(match.season)} ·
  {escape(match.date)} · {data.duration} dakika + duraklamalar</div>
  <div class="hero-team"><span style="color:#B6F36B">{escape(match.home)}</span> &nbsp;/&nbsp;
  <span style="color:#69B9FF">{escape(match.away)}</span></div>
  <div class="hero-score">{data.home_score} — {data.away_score}</div>
  <div class="hero-meta">Gerçek skor · seri penaltılar hariç</div>
</div>
""",
    unsafe_allow_html=True,
)

if offline:
    st.caption("● Çevrimdışı örnek · StatsBomb'un gerçek maç olaylarından hazırlanmıştır.")
for warning in data.warnings:
    st.warning(warning)
if (data.home_score, data.away_score) != (match.official_home_score, match.official_away_score):
    st.warning(
        f"Olaylardan hesaplanan skor katalogdaki {match.official_home_score}–"
        f"{match.official_away_score} skoruyla uyuşmuyor. Veri eksik olabilir; "
        "aşağıdaki analiz mevcut olaylara dayanır."
    )
if data.home_fixed or data.away_fixed:
    st.info(
        "Kendi kalesine goller, yararlanan takımın olası skorlarına sabit gol olarak eklendi. "
        "Bu goller xG toplamına dahil değil; model onları gerçekleşmiş kabul ediyor."
    )
if not data.shots:
    st.warning("Bu maçta şut kaydı bulunamadı. Dağılım yalnızca varsa sabit golleri içerir.")

columns = st.columns(4)
columns[0].metric(f"{match.home} · xG", f"{home_xg:.2f}", help="Şutların xG değerlerinin toplamı.")
columns[1].metric(f"{match.away} · xG", f"{away_xg:.2f}", help="Şutların xG değerlerinin toplamı.")
columns[2].metric("Şut sayısı", f"{len(home_shots)} — {len(away_shots)}")
columns[3].metric(
    "Gerçek skorun olasılığı",
    f"%{score_probability * 100:.1f}",
    help="Aynı şutların bağımsız tekrarları altında bu tam skorun olasılığı.",
)

st.subheader("Bu şutlardan hangi sonuçlar çıkardı?")
st.plotly_chart(
    outcome_chart(result, match.home, match.away), width="stretch", config={"displayModeBar": False}
)

with st.container(border=True):
    h, a, p = top_scores[0]
    preferred = match.home if result.home_win >= result.away_win else match.away
    preferred_p = max(result.home_win, result.away_win)
    if result.draw >= preferred_p:
        outcome_text = f"En yüksek sonuç olasılığı beraberlikte (%{result.draw * 100:.1f})."
    else:
        outcome_text = f"{preferred} galibiyetinin olasılığı %{preferred_p * 100:.1f}."
    st.markdown(
        f"**Şutların anlattığı:** {outcome_text} En olası tek skor **{h}–{a}** "
        f"(%{p * 100:.1f}); gerçekleşen **{data.home_score}–{data.away_score}** "
        f"skorunun olasılığı ise **%{score_probability * 100:.1f}**."
    )
    st.caption(
        "Tek bir skorun düşük olasılıklı olması tek başına sürpriz ya da şans ölçüsü değildir. "
        "Olasılık birçok farklı skora dağılır."
    )

left, right = st.columns([2, 1])
with left:
    st.subheader("Olası skorlar")
    heatmap, tail = score_heatmap(result, match.home, match.away)
    st.plotly_chart(heatmap, width="stretch", config={"displayModeBar": False})
    st.caption(
        f"Görünmeyen skorların toplam olasılığı: %{tail * 100:.3f}. "
        "Diğer hesaplamalar tam dağılımı kullanır."
    )
with right:
    st.subheader("En olası 5 skor")
    st.dataframe(
        pd.DataFrame(
            [{"Skor": f"{h}–{a}", "Olasılık": f"%{p * 100:.2f}"} for h, a, p in top_scores]
        ),
        hide_index=True,
        width="stretch",
    )
    st.caption(
        "Skor sırası: ilk takım – ikinci takım. xG toplamını yuvarlamak, "
        "en olası skoru hesaplamakla aynı şey değildir."
    )

st.subheader("Şutların sahadaki izi")
st.plotly_chart(shot_map(data), width="stretch", config={"displayModeBar": False})
st.caption(
    f"{match.home} sağa → · {match.away} sola ← · Büyük işaret daha yüksek xG · ★ Gol. "
    "Takımların şutları hücum yönüne göre karşılıklı yerleştirildi."
)
missing_coordinates = sum(s.x is None for s in data.shots)
if missing_coordinates:
    st.caption(
        f"{missing_coordinates} şutun geçerli konumu yok; yalnızca haritada gösterilmedi. "
        "xG ve olasılık hesaplarına dahil edildi."
    )

st.subheader("Maç boyunca xG")
st.plotly_chart(xg_race(data), width="stretch", config={"displayModeBar": False})
st.caption(
    "Kesikli çizgiler devre sınırlarını, yıldızlar golleri gösterir. "
    "Zaman ekseni devre aralarını çıkarır, duraklama dakikalarını korur."
)
if data.source_name == "FotMob":
    st.caption(
        "FotMob şut zamanları dakika hassasiyetindedir; saniye bilgisi sunulmaz. "
        "Devre bitiş saati yoksa dönem uzunluğu mevcut şut zamanlarından hesaplanır."
    )

with st.expander("Hesaplama nasıl çalışıyor?"):
    st.markdown(
        "**xG**, bir şutun gol olma olasılığıdır. Örneğin 0.20 xG'lik bir şutun modelde "
        "gol olma olasılığı %20'dir.\n\n"
        "Her şutu bağımsız bir Bernoulli denemesi kabul ediyoruz. Takım başına "
        "**Poisson-binomial dağılımı** hesaplayıp iki takımın dağılımlarını birleştiriyoruz. "
        "Hesap tam dağılımla yapılır; rastgele simülasyon kullanılmaz.\n\n"
        "Sonuçlar **bu maçta gerçekleşmiş şutlara koşulludur**. Maç öncesi tahmin değildir; "
        "‘hak edilen skor’ veya takımın kesin performans ölçüsü olarak okunmamalıdır. "
        "Ribaundlar ve maçın skoruna bağlı taktik değişimleri nedeniyle bağımsızlık "
        "gerçekte tam sağlanmaz. Seri penaltılar dışarıda bırakılır."
    )

st.divider()
if data.source_name == "StatsBomb Open Data":
    footer_logo, footer_text = st.columns([1, 5])
    with footer_logo:
        st.image(str(Path(__file__).parent / "assets" / "statsbomb-logo.png"), width=150)
    with footer_text:
        st.caption(
            f"Veri: [StatsBomb Open Data]({SOURCE_URL}) · Maç ID: {match.id}. "
            "Bu bağımsız proje StatsBomb ile bağlantılı değildir."
        )
else:
    st.caption(
        f"Veri ve xG: [{data.source_name}]({data.source_url}) · Maç ID: {match.id} · "
        f"Verinin alınma zamanı: {data.retrieved_at}."
    )
    st.caption(
        "Kaynakların xG modelleri farklı olabilir. FotMob bağlantısı herkese açık "
        "web verisini kullanır; resmi bir API entegrasyonu değildir. "
        "Her maçta şut/xG verisinin bulunması veya erişimin devam etmesi garanti edilmez."
    )
