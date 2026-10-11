"""Evidence for match narratives; all numerical claims come from match data."""

import hashlib
import json
from dataclasses import asdict

from goal_illusion.analysis import analyze
from goal_illusion.data import MatchData

STORY_VERSION = 2


def fingerprint(data: MatchData) -> str:
    record = asdict(data)
    record.pop("retrieved_at")
    return hashlib.sha256(
        json.dumps(record, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def match_from_snapshot(record: dict) -> MatchData:
    from goal_illusion.data import Match, Shot

    return MatchData(
        **{
            **{k: v for k, v in record.items() if k != "league_id"},
            "match": Match(**record["match"]),
            "shots": tuple(Shot(**shot) for shot in record["shots"]),
        }
    )


def build_evidence(data: MatchData) -> dict:
    match = data.match
    home, away = data.shots_for(match.home_id), data.shots_for(match.away_id)
    analysis = analyze([s.xg for s in home], [s.xg for s in away], data.home_fixed, data.away_fixed)
    teams = []
    for name, shots, fixed, goals in (
        (match.home, home, data.home_fixed, data.home_score),
        (match.away, away, data.away_fixed, data.away_score),
    ):
        xg = sum(s.xg for s in shots)
        teams.append(
            {
                "name": name,
                "goals": goals,
                "fixed_goals": fixed,
                "shot_goals": goals - fixed,
                "shots": len(shots),
                "xg": xg,
                "xg_per_shot": xg / len(shots) if shots else None,
                "finishing_difference": goals - fixed - xg,
                "first_half_xg": sum(s.xg for s in shots if s.period == 1),
                "second_half_xg": sum(s.xg for s in shots if s.period == 2),
                "extra_time_xg": sum(s.xg for s in shots if s.period in (3, 4)),
            }
        )
    margin = data.home_score - data.away_score
    # Directional tail: a victory at least this large, rather than one exact score.
    tail = None
    if margin:
        tail = sum(
            float(analysis.score_matrix[h, a])
            for h in range(len(analysis.home_pmf))
            for a in range(len(analysis.away_pmf))
            if (h - a >= margin if margin > 0 else h - a <= margin)
        )
    fmt = lambda value: f"{value:.2f}".replace(".", ",")  # noqa: E731
    percent = lambda value: f"%{value * 100:.1f}".replace(".", ",")  # noqa: E731
    evidence = [
        {
            "id": "chances",
            "label": "Üretilen fırsatların kalitesi",
            "text": f"{match.home}: {fmt(teams[0]['xg'])} xG · "
            f"{match.away}: {fmt(teams[1]['xg'])} xG.",
        },
        {
            "id": "outcomes",
            "label": "Aynı şutlarla olası sonuçlar",
            "text": f"{match.home} galibiyeti {percent(analysis.home_win)}, beraberlik "
            f"{percent(analysis.draw)}, {match.away} galibiyeti {percent(analysis.away_win)}.",
        },
        {
            "id": "finishing",
            "label": "Şutların gole dönüşmesi",
            "text": " · ".join(
                f"{t['name']}: {t['shot_goals']} şut golü / {fmt(t['xg'])} xG" for t in teams
            )
            + ". Kendi kalesine goller hariç; bu fark tek başına beceri veya şans ölçüsü değildir.",
        },
        {
            "id": "quality",
            "label": "Şut başına kalite",
            "text": " · ".join(
                f"{t['name']}: {t['shots']} şut, "
                + (f"ortalama {fmt(t['xg_per_shot'])} xG" if t["shots"] else "ortalama tanımsız")
                for t in teams
            )
            + ".",
        },
        {
            "id": "halves",
            "label": "Devrelere göre fırsatlar",
            "text": " · ".join(
                f"{t['name']}: ilk yarı {fmt(t['first_half_xg'])}, "
                f"ikinci yarı {fmt(t['second_half_xg'])} xG"
                + (f", uzatma {fmt(t['extra_time_xg'])} xG" if data.duration == 120 else "")
                for t in teams
            )
            + ".",
        },
    ]
    if tail is not None:
        winner = match.home if margin > 0 else match.away
        evidence.insert(
            2,
            {
                "id": "margin",
                "label": "Skor farkının olasılığı",
                "text": f"Aynı şutlarla {winner} takımının en az {abs(margin)} farkla "
                f"kazanma olasılığı {percent(tail)}.",
            },
        )
    if data.home_fixed or data.away_fixed:
        evidence.append(
            {
                "id": "own_goals",
                "label": "Kendi kalesine goller",
                "text": f"{match.home} lehine {data.home_fixed}, {match.away} lehine "
                f"{data.away_fixed} sabit gol var; şut kalitesine dahil değildir.",
            }
        )
    # Stable event IDs bind prose, evidence and graphics to the same input.
    events = []
    for index, shot in enumerate(sorted(data.shots, key=lambda s: (s.elapsed_minutes, s.period))):
        team = match.home if shot.team_id == match.home_id else match.away
        event = {"id": f"shot_{index}", "team": team, "player": shot.player or None,
                 "minute": shot.minute, "added_minutes": shot.added_minutes,
                 "elapsed_minutes": shot.elapsed_minutes, "period": shot.period,
                 "xg": shot.xg, "goal": shot.outcome == "Goal"}
        events.append(event)
        clock = f"{shot.minute}" + (f"+{shot.added_minutes}" if shot.added_minutes else "")
        evidence.append({"id": event["id"], "label": f"{clock}′ · {team}",
                         "text": f"{shot.player or 'Oyuncu bilgisi yok'}: "
                         f"{'gol' if event['goal'] else 'gol olmayan şut'}, {fmt(shot.xg)} xG."})
    sections = ["opening", "first_half", "second_half", "chances", "verdict", "closing"]
    if not any(e["period"] == 1 for e in events) or not any(e["period"] == 2 for e in events):
        sections = ["opening", "match_flow", "chances", "verdict", "closing"]
    if data.duration > 90 or any(e["period"] in (3, 4) for e in events):
        sections.insert(sections.index("chances"), "extra_time")
    key_ids = {e["id"] for e in sorted(events, key=lambda e: -e["xg"])[:3]}
    key_ids.update(e["id"] for e in events if e["goal"])
    return {
        "version": STORY_VERSION,
        "fingerprint": fingerprint(data),
        "match_id": match.id,
        "home": teams[0],
        "away": teams[1],
        "outcomes": {"home": analysis.home_win, "draw": analysis.draw, "away": analysis.away_win},
        "actual_score_probability": analysis.score_probability(data.home_score, data.away_score),
        "observed_margin_tail": tail,
        "evidence": evidence,
        "events": events,
        "key_event_ids": [e["id"] for e in events if e["id"] in key_ids],
        "sections": sections,
        "limitations": "Gerçekleşmiş şutlara koşullu analiz. Şutlar bağımsız kabul edilir. "
        "Pres, topa sahip olma, savunma ve şuta dönüşmeyen ataklar ölçülmez.",
        "warnings": list(data.warnings),
    }
