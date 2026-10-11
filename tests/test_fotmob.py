from copy import deepcopy

import pytest
import requests

from goal_illusion.charts import shot_map, shot_time, xg_race
from goal_illusion.data import DataError
from goal_illusion.fotmob import (
    completed_matches,
    fetch_fotmob,
    normalize_fotmob,
    seasons_from_league,
)


def shot(team=10, minute=10, added=None, period="FirstHalf", xg=0.25, goal=False):
    return {
        "teamId": team,
        "playerName": "Oyuncu",
        "min": minute,
        "minAdded": added,
        "period": period,
        "x": 100,
        "y": 34,
        "expectedGoals": xg,
        "eventType": "Goal" if goal else "Miss",
        "isOwnGoal": False,
    }


def payload(shots=None, home_score=0, away_score=0):
    return {
        "general": {
            "matchId": "100",
            "leagueName": "Super Lig",
            "matchTimeUTCDate": "2026-10-11T13:00:00Z",
            "homeTeam": {"id": 10, "name": "Ev"},
            "awayTeam": {"id": 20, "name": "Deplasman"},
        },
        "header": {
            "status": {"finished": True, "halfs": {}},
            "teams": [{"id": 10, "score": home_score}, {"id": 20, "score": away_score}],
        },
        "content": {
            "shotmap": {"shots": shots if shots is not None else [shot()]},
            "matchFacts": {"events": {"events": []}},
        },
    }


def add_stats(p, counts, xgs):
    p["content"]["stats"] = {
        "Periods": {
            "All": {
                "stats": [
                    {
                        "stats": [
                            {"key": "total_shots", "stats": counts},
                            {"key": "expected_goals", "stats": xgs},
                        ]
                    }
                ]
            }
        }
    }


def test_normalization_coordinates_attribution_and_charts():
    p = payload([shot(goal=True), shot(team=20)], home_score=1)
    add_stats(p, [1, 1], ["0.25", "0.25"])
    data = normalize_fotmob(p, "2026/2027")
    assert data.source_name == "FotMob"
    assert data.source_url == "https://www.fotmob.com/match/100"
    assert data.retrieved_at.endswith("+02:00")
    assert data.shots[0].x == pytest.approx(100 * 120 / 105)
    assert data.shots[0].y == 40
    assert data.shots[0].second is None
    assert data.home_score == 1
    assert shot_time(data.shots[0]) == "10′"
    assert not data.warnings
    assert sum(len(t.x) for t in shot_map(data).data) == 2
    assert len(xg_race(data).data) == 3


def test_stoppage_and_extra_time_shootout_exclusion():
    p = payload(
        [
            shot(minute=45, added=4),
            shot(minute=46, period="SecondHalf"),
            shot(minute=105, added=1, period="ExtraFirstHalf"),
            shot(minute=115, period="ExtraSecondHalf"),
            shot(period="PenaltyShootout", xg=None, goal=True),
        ]
    )
    data = normalize_fotmob(p, "2026/2027")
    assert data.duration == 120
    assert len(data.shots) == 4
    assert data.shots[1].elapsed_minutes == 50
    assert shot_time(data.shots[0]) == "45+4′"
    assert data.home_score == 0
    assert len(data.period_boundaries) == 3


def test_half_end_times_preserve_stoppage():
    p = payload([shot(), shot(minute=46, period="SecondHalf")])
    p["header"]["status"]["halfs"] = {
        "firstHalfStarted": "11.10.2026 12:00:00",
        "firstHalfEnded": "11.10.2026 12:50:00",
    }
    data = normalize_fotmob(p, "2026/2027")
    assert data.period_boundaries == (50,)
    assert data.shots[1].elapsed_minutes == 51


def test_own_goal_credited_using_score_change_not_shot_team():
    own = shot(goal=True, xg=None)
    own["isOwnGoal"] = True
    p = payload([shot(), own], away_score=1)
    p["content"]["matchFacts"]["events"]["events"] = [
        {"ownGoal": True, "homeScore": 0, "awayScore": 0, "newScore": [0, 1]}
    ]
    data = normalize_fotmob(p, "2026/2027")
    assert len(data.shots) == 1
    assert (data.home_fixed, data.away_fixed) == (0, 1)


@pytest.mark.parametrize("value", [None, -0.1, 1.1, float("nan"), float("inf"), "0.2", True])
def test_missing_or_invalid_shot_xg_is_never_estimated(value):
    with pytest.raises(DataError, match="xG"):
        normalize_fotmob(payload([shot(xg=value)]), "2026/2027")


def test_missing_shotmap_and_unknown_period_rejected():
    p = payload()
    p["content"]["shotmap"] = None
    with pytest.raises(DataError, match="henüz"):
        normalize_fotmob(p, "2026/2027")
    with pytest.raises(DataError, match="dönem"):
        normalize_fotmob(payload([shot(period="Unexpected")]), "2026/2027")


def test_incomplete_goals_or_shots_rejected():
    with pytest.raises(DataError, match="gerçek skor"):
        normalize_fotmob(payload(home_score=1), "2026/2027")
    p = payload()
    add_stats(p, [3, 0], ["0.25", "0"])
    with pytest.raises(DataError, match="şut sayısı"):
        normalize_fotmob(p, "2026/2027")


def test_empty_shots_only_allowed_if_zero_verified():
    p = payload([])
    with pytest.raises(DataError, match="sıfır şut"):
        normalize_fotmob(p, "2026/2027")
    add_stats(p, [0, 0], ["0", "0"])
    assert normalize_fotmob(p, "2026/2027").shots == ()


def test_aggregate_difference_warns_but_preserves_raw_xg():
    p = payload()
    add_stats(p, [1, 0], ["0.18", "0"])
    data = normalize_fotmob(p, "2026/2027")
    assert len(data.warnings) == 1
    assert data.shots[0].xg == 0.25


@pytest.mark.parametrize(
    "state",
    [
        {"finished": False},
        {"finished": True, "cancelled": True},
        {"finished": True, "awarded": True},
    ],
)
def test_unfinished_cancelled_awarded_matches_rejected(state):
    p = payload()
    p["header"]["status"] = state
    with pytest.raises(DataError):
        normalize_fotmob(p, "2026/2027")


def test_league_latest_season_and_completed_sorting():
    def fixture(id, time, **status):
        return {"id": id, "status": {"utcTime": time, "finished": True, **status}}

    p = {
        "details": {"latestSeason": "2026/2027"},
        "allAvailableSeasons": ["2025/2026", "2026/2027"],
        "fixtures": {
            "allMatches": [
                fixture(1, "2026-10-10"),
                fixture(2, "2026-10-11"),
                fixture(3, "2026-10-12", finished=False),
                fixture(4, "2026-10-13", cancelled=True),
            ]
        },
    }
    assert seasons_from_league(p)[0] == "2026/2027"
    assert [m["id"] for m in completed_matches(p)] == [2, 1]


def test_fetch_reports_errors_without_auth_workarounds(monkeypatch):
    def request(url, params, timeout):
        assert url == "https://www.fotmob.com/api/data/leagues"
        assert params == {"id": 71}
        assert timeout == (5, 25)
        raise requests.HTTPError("403")

    monkeypatch.setattr(requests, "get", request)
    with pytest.raises(DataError, match="FotMob"):
        fetch_fotmob("leagues", id=71)


def test_invalid_coordinates_do_not_remove_valid_xg():
    p = payload()
    p["content"]["shotmap"]["shots"][0]["x"] = None
    data = normalize_fotmob(deepcopy(p), "2026/2027")
    assert data.shots[0].x is None
    assert data.shots[0].xg == 0.25
