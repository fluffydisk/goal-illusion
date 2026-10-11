import json
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from goal_illusion import data as data_module
from goal_illusion.analysis import analyze
from goal_illusion.charts import score_heatmap, shot_map, xg_race
from goal_illusion.data import EXAMPLE_PATH, DataError, load_example

APP_PATH = Path(__file__).resolve().parent.parent / "app.py"


def test_offline_app_renders_without_network(monkeypatch):
    def forbid_network(*args, **kwargs):
        raise AssertionError("Çevrimdışı mod ağ isteği yapmamalı.")

    monkeypatch.setattr(data_module, "fetch_json", forbid_network)
    app = AppTest.from_file(str(APP_PATH)).run(timeout=30)
    assert not app.exception
    assert len(app.metric) == 4
    assert app.metric[2].value == "8 — 10"
    assert len(app.get("plotly_chart")) == 4
    assert not app.error


def test_catalog_selection_and_retry(monkeypatch):
    payload = json.loads(EXAMPLE_PATH.read_text())
    failed = True

    def fake_catalog(path):
        if failed:
            raise DataError("Test ağ hatası")
        if path == "competitions.json":
            return [
                {
                    "competition_id": 43,
                    "competition_name": "FIFA World Cup",
                    "competition_gender": "male",
                    "season_id": 106,
                    "season_name": "2022",
                }
            ]
        if path.startswith("matches/"):
            return [payload["match"]]
        return payload["events"]

    monkeypatch.setattr(data_module, "fetch_json", fake_catalog)
    app = AppTest.from_file(str(APP_PATH)).run(timeout=30)
    app.sidebar.radio[0].set_value("StatsBomb kataloğu").run(timeout=30)
    assert not app.exception
    assert app.error[0].value == "Test ağ hatası"
    failed = False
    app.sidebar.button[0].click().run(timeout=30)
    assert not app.exception
    assert not app.error
    assert len(app.sidebar.selectbox) == 3
    assert len(app.metric) == 4


def test_charts_preserve_probability_and_shot_counts():
    data = load_example()
    result = analyze(
        [s.xg for s in data.shots_for(data.match.home_id)],
        [s.xg for s in data.shots_for(data.match.away_id)],
    )
    heatmap, tail = score_heatmap(result, data.match.home, data.match.away)
    assert heatmap.data[0].z.sum() + tail == pytest.approx(1)
    pitch = shot_map(data)
    assert sum(len(trace.x) for trace in pitch.data) == len(data.shots)
    race = xg_race(data)
    for trace in race.data:
        if trace.mode == "lines":
            assert list(trace.x) == sorted(trace.x)
            assert list(trace.y) == sorted(trace.y)


def test_fotmob_lig_season_match_selection(monkeypatch):
    from goal_illusion import fotmob
    from tests.test_fotmob import payload

    def fake_fetch(endpoint, **params):
        if endpoint == "leagues":
            return {
                "details": {"latestSeason": "2026/2027", "selectedSeason": "2026/2027"},
                "allAvailableSeasons": ["2026/2027"],
                "fixtures": {
                    "allMatches": [
                        {
                            "id": "100",
                            "home": {"name": "Ev"},
                            "away": {"name": "Deplasman"},
                            "status": {
                                "finished": True,
                                "utcTime": "2026-10-11T13:00:00Z",
                                "scoreStr": "0 - 0",
                            },
                        }
                    ]
                },
            }
        return payload()

    monkeypatch.setattr(fotmob, "fetch_fotmob", fake_fetch)
    app = AppTest.from_file(str(APP_PATH)).run(timeout=30)
    app.sidebar.radio[0].set_value("FotMob · güncel ligler").run(timeout=30)
    app.sidebar.button[0].click().run(timeout=30)
    assert not app.exception
    assert not app.error
    assert app.sidebar.selectbox[0].value == "Süper Lig · Türkiye"
    assert len(app.metric) == 4
    assert app.metric[2].value == "1 — 0"
    assert len(app.get("plotly_chart")) == 4
    app.sidebar.selectbox[0].set_value("Bundesliga · Almanya").run(timeout=30)
    assert not app.exception


def test_local_story_generation_renders_original_headline(monkeypatch):
    from goal_illusion import narrative as narrative_module
    from goal_illusion.narrative import PROMPT_VERSION

    original_read = Path.read_text

    def without_published_story(path, *args, **kwargs):
        if path == APP_PATH.parent / "web/data/stories.json":
            return '{"stories":{}}'
        return original_read(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", without_published_story)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    def fake_generate(facts, **kwargs):
        return {
            "headline": "Tabeladaki farkın arkasında İngiltere'nin daha kaliteli fırsatları var.",
            "summary": "İngiltere'nin ürettiği fırsatlar galibiyeti destekliyor. "
            "Gol farkı, şutların alternatif sonuçlarıyla birlikte değerlendirilmelidir.",
            "cards": [{"type": section, "title": "Maçın fırsat dağılımı",
                           "text": "İki takımın toplam gol beklentileri birbirine yakın kaldı. "
                           "Gerçek skor ise aynı şutlarla oluşabilecek sonuçlardan yalnızca biri.",
                           "evidence_ids": ["chances", "outcomes"]} for section in facts["sections"]],
            "fingerprint": facts["fingerprint"],
            "story_version": 2,
            "prompt_version": PROMPT_VERSION,
        }

    monkeypatch.setattr(narrative_module, "generate_narrative", fake_generate)
    app = AppTest.from_file(str(APP_PATH)).run(timeout=30)
    button = next(b for b in app.button if b.label == "Yerel modelle maç yorumunu üret")
    button.click().run(timeout=30)
    assert not app.exception
    assert any("Tabeladaki farkın" in heading.value for heading in app.subheader)
    assert len(app.metric) == 4
