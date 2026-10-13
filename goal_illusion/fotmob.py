"""FotMob'un halka açık web JSON'u; hesap veya imzalı başlık gerektirmez."""

import json
from datetime import datetime
from math import isfinite
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from goal_illusion.data import DataError, Match, MatchData, Shot

BASE_URL = "https://www.fotmob.com/api/data"
LEAGUE_CATALOG = json.loads(
    (Path(__file__).resolve().parents[1] / "web/data/leagues.json").read_text()
)
LEAGUES = {f"{league['name']} · {league['country']['tr']}": league["id"] for league in LEAGUE_CATALOG}
PERIODS = {"FirstHalf": 1, "SecondHalf": 2, "ExtraFirstHalf": 3, "ExtraSecondHalf": 4}
START_MINUTES = {1: 0, 2: 45, 3: 90, 4: 105}
PERIOD_LENGTHS = {1: 45, 2: 45, 3: 15, 4: 15}


def fetch_fotmob(endpoint: str, **params) -> dict:
    try:
        response = requests.get(f"{BASE_URL}/{endpoint}", params=params, timeout=(5, 25))
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as error:
        raise DataError(
            "FotMob verisi alınamadı. Kaynak geçici olarak erişilemiyor veya web veri "
            "adresi değişmiş olabilir. Yenilemeyi ya da başka bir kaynağı deneyebilirsin."
        ) from error
    if not isinstance(payload, dict):
        raise DataError("FotMob yanıtı beklenen biçimde değil.")
    return payload


def seasons_from_league(payload: dict) -> list[str]:
    seasons = payload.get("allAvailableSeasons")
    if not isinstance(seasons, list) or not seasons or not all(isinstance(s, str) for s in seasons):
        raise DataError("FotMob sezon listesi bulunamadı.")
    latest = payload.get("details", {}).get("latestSeason")
    return ([latest] if latest in seasons else []) + [s for s in seasons if s != latest]


def completed_matches(payload: dict) -> list[dict]:
    try:
        records = payload["fixtures"]["allMatches"]
        if not isinstance(records, list):
            raise DataError("FotMob maç listesi beklenen biçimde değil.")
        return sorted(
            [
                m
                for m in records
                if m["status"].get("finished")
                and not m["status"].get("cancelled")
                and not m["status"].get("awarded")
            ],
            key=lambda m: m["status"]["utcTime"],
            reverse=True,
        )
    except (KeyError, TypeError) as error:
        raise DataError("FotMob maç listesi okunamadı.") from error


def _clock(shot: dict) -> tuple[int, int, float]:
    minute, added = int(shot["min"]), int(shot.get("minAdded") or 0)
    period = PERIODS[shot["period"]]
    clock = minute + added - START_MINUTES[period]
    if minute < 0 or added < 0 or clock < 0:
        raise DataError("FotMob şut zamanı geçersiz.")
    return minute, added, float(clock)


def _coordinates(shot: dict) -> tuple[float | None, float | None]:
    try:
        x, y = float(shot["x"]), float(shot["y"])
        if isfinite(x) and isfinite(y) and 0 <= x <= 105 and 0 <= y <= 68:
            return x * 120 / 105, y * 80 / 68
    except (KeyError, ValueError, TypeError):
        pass
    return None, None


def _match_stat(payload: dict, key: str) -> list | None:
    groups = (
        payload.get("content", {})
        .get("stats", {})
        .get("Periods", {})
        .get("All", {})
        .get("stats", [])
    )
    for group in groups:
        for stat in group.get("stats", []):
            if stat.get("key") == key:
                return stat.get("stats")
    return None


def _period_lengths(payload: dict, shots: list[dict], last: int) -> dict[int, float]:
    lengths = {p: float(PERIOD_LENGTHS[p]) for p in range(1, last + 1)}
    for shot in shots:
        period = PERIODS[shot["period"]]
        lengths[period] = max(lengths[period], _clock(shot)[2])
    # Kaynaktaki devre başlangıç/bitişleri duraklama süresini de içerir.
    halves = payload["header"]["status"].get("halfs", {})
    pairs = {
        1: ("firstHalfStarted", "firstHalfEnded"),
        2: ("secondHalfStarted", "secondHalfEnded"),
        3: ("firstExtraHalfStarted", "firstExtraHalfEnded"),
        4: ("secondExtraHalfStarted", "gameEnded"),
    }
    for period, (start_key, end_key) in pairs.items():
        if period not in lengths:
            continue
        start, end = halves.get(start_key), halves.get(end_key)
        if start and end:
            try:
                duration = (
                    datetime.strptime(end, "%d.%m.%Y %H:%M:%S")
                    - datetime.strptime(start, "%d.%m.%Y %H:%M:%S")
                ).total_seconds() / 60
                if 0 <= duration <= PERIOD_LENGTHS[period] + 30:
                    lengths[period] = max(lengths[period], duration)
            except ValueError:
                pass
    return lengths


def normalize_fotmob(payload: dict, season: str) -> MatchData:
    try:
        general, header = payload["general"], payload["header"]
        status = header["status"]
        if not status.get("finished") or status.get("cancelled") or status.get("awarded"):
            raise DataError("Yalnızca tamamlanmış ve hükmen sonuçlanmamış maçlar analiz edilir.")
        h, a = general["homeTeam"], general["awayTeam"]
        scores = {int(t["id"]): int(t["score"]) for t in header["teams"]}
        date = datetime.fromisoformat(general["matchTimeUTCDate"].replace("Z", "+00:00"))
        match = Match(
            int(general["matchId"]),
            int(h["id"]),
            int(a["id"]),
            h["name"],
            a["name"],
            date.astimezone(ZoneInfo("Europe/Berlin")).date().isoformat(),
            general["leagueName"],
            season,
            scores[int(h["id"])],
            scores[int(a["id"])],
        )
        raw = payload["content"].get("shotmap")
        if not isinstance(raw, dict) or not isinstance(raw.get("shots"), list):
            raise DataError(
                "Bu maçta şut bazlı xG henüz yok. Başka bir maç seç veya daha sonra yenile."
            )
        raw_shots = raw["shots"]
        if any(
            s.get("period") not in PERIODS
            and s.get("period") not in ("PenaltyShootout", "Penalties", "Shootout")
            for s in raw_shots
        ):
            raise DataError("FotMob şut dönemleri tanınmıyor; hatalı kapsamla analiz yapılmadı.")
        regular = [s for s in raw_shots if s["period"] in PERIODS]
        extra = any(PERIODS[s["period"]] > 2 for s in regular) or bool(
            status.get("halfs", {}).get("firstExtraHalfStarted")
        )
        last = 4 if extra else 2
        lengths = _period_lengths(payload, regular, last)
        offsets = {1: 0.0}
        for period in range(2, last + 1):
            offsets[period] = offsets[period - 1] + lengths[period - 1]

        # Kendi kalesine golün alıcısı skor değişiminden saptanır; shot.teamId'ye güvenilmez.
        fixed = {match.home_id: 0, match.away_id: 0}
        match_events = payload["content"].get("matchFacts", {}).get("events") or {}
        for event in match_events.get("events", []):
            if event.get("ownGoal") and not event.get("isPenaltyShootoutEvent"):
                after = event.get("newScore")
                before = [event.get("homeScore"), event.get("awayScore")]
                if (
                    not isinstance(after, list)
                    or len(after) != 2
                    or not all(isinstance(v, int) for v in before + after)
                ):
                    raise DataError("Kendi kalesine golün skor katkısı doğrulanamadı.")
                delta = [after[i] - before[i] for i in range(2)]
                if delta not in ([1, 0], [0, 1]):
                    raise DataError("Kendi kalesine golün skor katkısı doğrulanamadı.")
                fixed[match.home_id if delta[0] else match.away_id] += 1

        shots = []
        goals = fixed.copy()
        for shot in regular:
            if shot.get("isOwnGoal"):
                continue
            team_id = int(shot["teamId"])
            if team_id not in goals:
                raise DataError("FotMob şut takımı maçla eşleşmiyor.")
            xg = shot.get("expectedGoals")
            if (
                not isinstance(xg, (int, float))
                or isinstance(xg, bool)
                or not isfinite(xg)
                or not 0 <= xg <= 1
            ):
                raise DataError("Bir şutun xG değeri eksik/geçersiz; analiz durduruldu.")
            minute, added, clock = _clock(shot)
            period = PERIODS[shot["period"]]
            x, y = _coordinates(shot)
            outcome = (
                "Goal"
                if shot["eventType"] == "Goal"
                else ("Blocked" if shot.get("isBlocked") else shot["eventType"])
            )
            goals[team_id] += int(outcome == "Goal")
            shots.append(
                Shot(
                    team_id,
                    shot.get("playerName") or "Bilinmeyen oyuncu",
                    period,
                    minute,
                    None,
                    offsets[period] + clock,
                    x,
                    y,
                    float(xg),
                    outcome,
                    added,
                )
            )
        # Gol ve şut toplamları eksik shotmap ile güven verici sonuç üretmemeli.
        if (goals[match.home_id], goals[match.away_id]) != (
            match.official_home_score,
            match.official_away_score,
        ):
            raise DataError(
                "Şut/gol kayıtları gerçek skorla uyuşmuyor; eksik veriden analiz yapılmadı."
            )
        total_shots = _match_stat(payload, "total_shots")
        if not shots and total_shots != [0, 0]:
            raise DataError("Şut listesi boş ve sıfır şut olduğu doğrulanamıyor; analiz yapılmadı.")
        if total_shots is not None:
            counts = [
                sum(s.team_id == tid for s in shots) for tid in (match.home_id, match.away_id)
            ]
            if [int(v) for v in total_shots] != counts:
                raise DataError(
                    "Şut haritası maçın toplam şut sayısıyla uyuşmuyor; analiz durduruldu."
                )
        totals = _match_stat(payload, "expected_goals")
        warnings = []
        if totals is not None:
            for team_id, total in zip((match.home_id, match.away_id), totals, strict=True):
                if abs(sum(s.xg for s in shots if s.team_id == team_id) - float(total)) > 0.02:
                    warnings.append(
                        "Kaynağın maç özeti xG'si ile tek tek şut xG'lerinin toplamı farklı. "
                        "Kartlar ve olasılıklar şut değerlerini kullanır; kaynak özetini kullanmaz."
                    )
                    break
        shots.sort(key=lambda s: (s.period, s.elapsed_minutes))
        return MatchData(
            match,
            tuple(shots),
            fixed[match.home_id],
            fixed[match.away_id],
            goals[match.home_id],
            goals[match.away_id],
            120 if extra else 90,
            sum(lengths.values()),
            tuple(offsets[p] for p in range(2, last + 1)),
            "FotMob",
            f"https://www.fotmob.com/match/{match.id}",
            datetime.now(ZoneInfo("Europe/Berlin")).isoformat(timespec="seconds"),
            tuple(warnings),
        )
    except DataError:
        raise
    except (KeyError, TypeError, ValueError, OverflowError) as error:
        raise DataError(
            "FotMob maç verisi eksik veya biçimi değişmiş; analiz yapılamadı."
        ) from error
