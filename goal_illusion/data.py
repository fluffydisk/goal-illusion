"""StatsBomb açık verisini indir ve ortak maç/şut tiplerine dönüştür."""

import json
from dataclasses import dataclass
from math import isfinite
from pathlib import Path

import requests

BASE_URL = "https://raw.githubusercontent.com/hudl/open-data/master/data"
SOURCE_URL = "https://github.com/hudl/open-data"
EXAMPLE_PATH = Path(__file__).resolve().parent.parent / "data" / "example_match.json"


class DataError(ValueError):
    """Kullanıcıya gösterilebilecek veri erişimi/doğrulama hatası."""


@dataclass(frozen=True)
class Shot:
    team_id: int
    player: str
    period: int
    minute: int
    second: int | None
    elapsed_minutes: float
    x: float | None
    y: float | None
    xg: float
    outcome: str
    added_minutes: int = 0


@dataclass(frozen=True)
class Match:
    id: int
    home_id: int
    away_id: int
    home: str
    away: str
    date: str
    competition: str
    season: str
    official_home_score: int
    official_away_score: int

    @classmethod
    def from_record(cls, record: dict) -> "Match":
        try:
            h, a = record["home_team"], record["away_team"]
            return cls(
                record["match_id"],
                h["home_team_id"],
                a["away_team_id"],
                h["home_team_name"],
                a["away_team_name"],
                record["match_date"],
                record["competition"]["competition_name"],
                record["season"]["season_name"],
                record["home_score"],
                record["away_score"],
            )
        except (KeyError, TypeError) as error:
            raise DataError("Maç bilgisi eksik veya beklenen biçimde değil.") from error


@dataclass(frozen=True)
class MatchData:
    match: Match
    shots: tuple[Shot, ...]
    home_fixed: int
    away_fixed: int
    home_score: int
    away_score: int
    duration: int
    timeline_end: float
    period_boundaries: tuple[float, ...]
    source_name: str = "StatsBomb Open Data"
    source_url: str = SOURCE_URL
    retrieved_at: str | None = None
    warnings: tuple[str, ...] = ()

    def shots_for(self, team_id: int) -> tuple[Shot, ...]:
        return tuple(shot for shot in self.shots if shot.team_id == team_id)


def fetch_json(relative_path: str) -> list:
    try:
        response = requests.get(f"{BASE_URL}/{relative_path}", timeout=(5, 25))
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as error:
        raise DataError(
            "StatsBomb verisine erişilemedi. Bağlantını kontrol edip tekrar dene "
            "veya çevrimdışı örnek maçı aç."
        ) from error
    if not isinstance(payload, list):
        raise DataError("StatsBomb yanıtı beklenen liste biçiminde değil.")
    return payload


def _period_clock(event: dict) -> float:
    """Timestamp dönem başında sıfırlanır; uzatma dakikalarını da korur."""
    try:
        hours, minutes, seconds = event["timestamp"].split(":")
        clock = int(hours) * 60 + int(minutes) + float(seconds) / 60
        if not isfinite(clock) or clock < 0:
            raise ValueError
        return clock
    except (KeyError, AttributeError, ValueError, TypeError) as error:
        raise DataError("Olayın zaman bilgisi eksik veya geçersiz.") from error


def normalize_events(match: Match, events: list[dict]) -> MatchData:
    try:
        relevant = [event for event in events if event["period"] in (1, 2, 3, 4)]
        max_period = max((event["period"] for event in relevant), default=2)
        last_period = 4 if max_period > 2 else 2
        lengths = {p: (45.0 if p <= 2 else 15.0) for p in range(1, last_period + 1)}
        for event in relevant:
            lengths[event["period"]] = max(lengths[event["period"]], _period_clock(event))
        offsets = {1: 0.0}
        for p in range(2, last_period + 1):
            offsets[p] = offsets[p - 1] + lengths[p - 1]

        shots = []
        fixed = {match.home_id: 0, match.away_id: 0}
        goals = {match.home_id: 0, match.away_id: 0}
        for event in relevant:
            kind = event["type"]["name"]
            if kind not in ("Shot", "Own Goal Against"):
                continue
            team_id = event["team"]["id"]
            if team_id not in goals:
                raise DataError("Olaydaki takım maçın takımlarıyla eşleşmiyor.")
            if kind == "Own Goal Against":
                beneficiary = match.away_id if team_id == match.home_id else match.home_id
                fixed[beneficiary] += 1
                goals[beneficiary] += 1
                continue
            shot = event["shot"]
            value = shot.get("statsbomb_xg")
            if isinstance(value, (bool, str)) or value is None:
                raise DataError("Bir şutun xG değeri eksik veya sayısal değil; analiz durduruldu.")
            xg = float(value)
            if not isfinite(xg) or not 0 <= xg <= 1:
                raise DataError("Bir şutun xG değeri 0–1 aralığında değil; analiz durduruldu.")
            location = event.get("location")
            x = y = None
            if isinstance(location, list) and len(location) >= 2:
                try:
                    lx, ly = float(location[0]), float(location[1])
                    if isfinite(lx) and isfinite(ly) and 0 <= lx <= 120 and 0 <= ly <= 80:
                        x, y = lx, ly
                except (TypeError, ValueError):
                    pass  # Konum hatası xG hesabındaki geçerli şutu düşürmemeli.
            outcome = shot["outcome"]["name"]
            goals[team_id] += int(outcome == "Goal")
            shots.append(
                Shot(
                    team_id,
                    event.get("player", {}).get("name", "Bilinmeyen oyuncu"),
                    event["period"],
                    event["minute"],
                    event["second"],
                    offsets[event["period"]] + _period_clock(event),
                    x,
                    y,
                    xg,
                    outcome,
                )
            )
        shots.sort(key=lambda s: (s.period, s.elapsed_minutes))
        return MatchData(
            match,
            tuple(shots),
            fixed[match.home_id],
            fixed[match.away_id],
            goals[match.home_id],
            goals[match.away_id],
            120 if last_period == 4 else 90,
            sum(lengths.values()),
            tuple(offsets[p] for p in range(2, last_period + 1)),
        )
    except DataError:
        raise
    except (KeyError, TypeError, ValueError) as error:
        raise DataError(
            "Olay verisi eksik veya beklenen biçimde değil; analiz durduruldu."
        ) from error


def load_example() -> MatchData:
    try:
        payload = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
        return normalize_events(Match.from_record(payload["match"]), payload["events"])
    except (OSError, ValueError, KeyError) as error:
        raise DataError("Yerel örnek maç okunamadı.") from error
