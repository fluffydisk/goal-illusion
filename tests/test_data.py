import json

import pytest
import requests

from goal_illusion.data import (
    EXAMPLE_PATH,
    DataError,
    Match,
    fetch_json,
    load_example,
    normalize_events,
)


@pytest.fixture
def match():
    return Match(1, 10, 20, "Ev", "Deplasman", "2026-10-11", "Örnek", "2026", 0, 0)


def event(
    kind="Shot", team=10, period=1, xg=0.25, outcome="Saved", timestamp="00:10:00.000", minute=10
):
    result = {
        "type": {"name": kind},
        "team": {"id": team},
        "period": period,
        "timestamp": timestamp,
        "minute": minute,
        "second": 0,
        "player": {"name": "Oyuncu"},
        "location": [100, 40],
    }
    if kind == "Shot":
        result["shot"] = {"statsbomb_xg": xg, "outcome": {"name": outcome}}
    return result


def test_example_is_real_complete_and_reproducible():
    example = load_example()
    assert example.match.id == 3869118
    assert (example.home_score, example.away_score) == (3, 0)
    assert len(example.shots) == 18
    assert len(example.shots_for(example.match.home_id)) == 8
    assert len(example.shots_for(example.match.away_id)) == 10
    assert example.duration == 90
    payload = json.loads(EXAMPLE_PATH.read_text())
    assert payload["original_events_sha256"]
    assert sum(s.xg for s in example.shots_for(example.match.home_id)) == pytest.approx(
        sum(
            e["shot"]["statsbomb_xg"]
            for e in payload["events"]
            if e["type"]["name"] == "Shot" and e["team"]["id"] == example.match.home_id
        )
    )


def test_extra_time_and_shootouts(match):
    data = normalize_events(
        match,
        [
            event(period=1, outcome="Goal"),
            event(team=20, period=3, outcome="Goal"),
            event(period=4),
            event(period=5, outcome="Goal", xg=None),
        ],
    )
    assert data.duration == 120
    assert len(data.shots) == 3
    assert (data.home_score, data.away_score) == (1, 1)
    assert len(data.period_boundaries) == 3


def test_own_goal_is_counted_once_for_beneficiary(match):
    data = normalize_events(match, [event("Own Goal Against"), event("Own Goal For", team=20)])
    assert data.away_score == 1
    assert data.away_fixed == 1
    assert data.home_fixed == 0
    assert not data.shots


@pytest.mark.parametrize("xg", [None, float("nan"), float("inf"), -1, 2, "0.3", True])
def test_bad_xg_stops_analysis(match, xg):
    with pytest.raises(DataError):
        normalize_events(match, [event(xg=xg)])


def test_missing_xg_stops_analysis(match):
    shot = event()
    del shot["shot"]["statsbomb_xg"]
    with pytest.raises(DataError):
        normalize_events(match, [shot])


def test_unknown_team_stops_analysis(match):
    with pytest.raises(DataError):
        normalize_events(match, [event(team=99)])


def test_missing_coordinates_preserves_shot(match):
    shot = event()
    del shot["location"]
    data = normalize_events(match, [shot])
    assert len(data.shots) == 1
    assert data.shots[0].x is None
    assert data.shots[0].xg == 0.25


@pytest.mark.parametrize("location", [[None, 40], ["invalid", 40], [121, 40], [100]])
def test_invalid_coordinates_preserve_xg(match, location):
    shot = event()
    shot["location"] = location
    data = normalize_events(match, [shot])
    assert data.shots[0].x is None
    assert data.shots[0].xg == 0.25


def test_stoppage_time_does_not_reverse_timeline(match):
    data = normalize_events(
        match,
        [
            event(period=2, timestamp="00:00:30.000", minute=45),
            event(period=1, timestamp="00:47:00.000", minute=47),
            event("Half End", timestamp="00:49:00.000", minute=49),
        ],
    )
    assert [s.period for s in data.shots] == [1, 2]
    assert [s.elapsed_minutes for s in data.shots] == [47, 49.5]
    assert data.period_boundaries == (49,)


def test_fetch_reports_network_errors_and_timeout(monkeypatch):
    def failed_request(url, timeout):
        assert timeout == (5, 25)
        raise requests.Timeout()

    monkeypatch.setattr(requests, "get", failed_request)
    with pytest.raises(DataError, match="çevrimdışı"):
        fetch_json("competitions.json")


def test_fetch_rejects_wrong_payload(monkeypatch):
    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"error": "unexpected"}

    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: Response())
    with pytest.raises(DataError, match="liste"):
        fetch_json("competitions.json")
