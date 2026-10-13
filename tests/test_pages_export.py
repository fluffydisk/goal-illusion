import json

import pytest

from goal_illusion.data import DataError
from scripts import export_pages
from tests.test_fotmob import payload


def fixture(id):
    return {"id": str(id), "status": {"utcTime": "2026-01-10T13:00:00Z", "finished": True}}


def install_source(monkeypatch, records, *, fail=False):
    monkeypatch.setattr(export_pages, "LEAGUES", {"Test": 71})
    monkeypatch.setattr(export_pages.time, "sleep", lambda _: None)
    calls = []

    def fetch(endpoint, **params):
        calls.append((endpoint, params))
        if fail:
            raise DataError("Source unavailable")
        if endpoint == "leagues":
            return {"details": {"id": 71, "latestSeason": "2026/2027"},
                    "allAvailableSeasons": ["2026/2027"],
                    "fixtures": {"allMatches": records}}
        data = payload()
        data["general"]["matchId"] = params["matchId"]
        return data

    monkeypatch.setattr(export_pages, "fetch_fotmob", fetch)
    return calls


def test_budget_retains_prior_verified_matches_and_backfills_next_run(tmp_path, monkeypatch):
    target = tmp_path / "matches.json"
    calls = install_source(monkeypatch, [fixture(100), fixture(101), fixture(102)])
    first = export_pages.export(target, request_budget=1)
    assert len(first["matches"]) == 2
    assert first["coverage"][0]["status"] == "partial"
    second = export_pages.export(target, request_budget=1)
    assert len(second["matches"]) == 3
    third = export_pages.export(target, request_budget=1)
    assert len(third["matches"]) == 4
    assert third["coverage"][0]["status"] == "ok"
    assert len([call for call in calls if call[0] == "matchDetails"]) == 3


def test_source_outage_keeps_all_verified_history(tmp_path, monkeypatch):
    target = tmp_path / "matches.json"
    install_source(monkeypatch, [fixture(100)])
    before = export_pages.export(target)
    install_source(monkeypatch, [], fail=True)
    after = export_pages.export(target)
    assert json.loads(json.dumps(after["matches"])) == json.loads(json.dumps(before["matches"]))
    assert after["coverage"][0]["status"] == "unavailable"
    assert after["issues"]


def test_wrong_match_id_is_never_published(tmp_path, monkeypatch):
    install_source(monkeypatch, [fixture(101)])
    original = export_pages.fetch_fotmob
    monkeypatch.setattr(export_pages, "fetch_fotmob", lambda endpoint, **params:
                        payload() if endpoint == "matchDetails" else original(endpoint, **params))
    result = export_pages.export(tmp_path / "matches.json")
    assert len(result["matches"]) == 1
    assert result["issues"]


def test_invalid_budget_does_not_overwrite_destination(tmp_path):
    target = tmp_path / "matches.json"
    target.write_text('{"keep": true}')
    with pytest.raises(ValueError):
        export_pages.export(target, request_budget=0)
    assert json.loads(target.read_text()) == {"keep": True}
