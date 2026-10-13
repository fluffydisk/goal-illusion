"""Build a static snapshot; retain verified matches if the provider is unavailable."""

import argparse
import json
import sys
import time
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from goal_illusion.data import DataError, load_example  # noqa: E402
from goal_illusion.fotmob import (  # noqa: E402
    LEAGUE_CATALOG,
    LEAGUES,
    completed_matches,
    fetch_fotmob,
    normalize_fotmob,
    seasons_from_league,
)


def export(destination: Path, limit: int | None = None, *, request_budget: int = 12) -> dict:
    """Incrementally fill each league; a bounded run never deletes verified history."""
    if request_budget < 1 or (limit is not None and limit < 1):
        raise ValueError("Limits must be positive")
    previous = json.loads(destination.read_text()) if destination.exists() else {}
    cached = {str(m["match"]["id"]): m for m in previous.get("matches", [])}
    supported = set(LEAGUES.values())
    published = {key: value for key, value in cached.items() if value.get("league_id") in supported}
    example = asdict(load_example())
    published[str(example["match"]["id"])] = example
    issues, coverage = [], []
    started = time.monotonic()
    for label, league_id in LEAGUES.items():
        entry = {"id": league_id, "fetched": 0, "deferred": 0, "issues": 0,
                 "available": sum(m.get("league_id") == league_id for m in published.values())}
        try:
            league = fetch_fotmob("leagues", id=league_id)
            if str(league.get("details", {}).get("id", league_id)) != str(league_id):
                raise DataError("Kaynak lig kimliği istenen ligle uyuşmuyor.")
            season = seasons_from_league(league)[0]
            records = completed_matches(league)
            entry.update(season=season, completed=len(records), status="ok")
        except DataError as error:
            issues.append(f"{label}: {error}")
            entry.update(status="unavailable", issues=1)
            coverage.append(entry)
            continue
        missing, recent = [], []
        for record in records:
            saved = cached.get(str(record["id"]))
            if not saved or saved.get("league_id") != league_id or saved["match"]["season"] != season:
                missing.append(record)
            else:
                age = datetime.now(UTC) - datetime.fromisoformat(
                    record["status"]["utcTime"].replace("Z", "+00:00")
                )
                if age.days < 3:
                    recent.append(record)
        recent.sort(key=lambda record: cached[str(record["id"])].get("retrieved_at") or "")
        # Alternate backfill and corrections; neither can starve the other.
        candidates = []
        for index in range(max(len(missing), len(recent))):
            if index < len(missing):
                candidates.append(missing[index])
            if index < len(recent):
                candidates.append(recent[index])
        requested, source_failures = 0, 0
        for record in candidates:
            match_id = str(record["id"])
            saved = cached.get(match_id)
            if saved and (saved.get("league_id") != league_id or saved["match"]["season"] != season):
                saved = None
                published.pop(match_id, None)
            age = datetime.now(UTC) - datetime.fromisoformat(
                record["status"]["utcTime"].replace("Z", "+00:00")
            )
            if saved and age.days >= 3:
                continue
            if requested >= min(request_budget, limit or request_budget):
                entry["deferred"] += 1
                continue
            requested += 1
            try:
                payload = fetch_fotmob("matchDetails", matchId=match_id)
                source_failures = 0
            except DataError as error:
                source_failures += 1
                issues.append(f"{label}, maç {match_id}: {error}")
                entry["issues"] += 1
                if source_failures >= 2:
                    entry["status"] = "unavailable"
                    break
                continue
            try:
                data = asdict(normalize_fotmob(payload, season))
                if str(data["match"]["id"]) != match_id:
                    raise DataError("Kaynak maç kimliği istenen maçla uyuşmuyor.")
                data["league_id"] = league_id
                published[match_id] = data
                entry["fetched"] += 1
            except DataError as error:
                issues.append(f"{label}, maç {match_id}: {error}")
                entry["issues"] += 1
            time.sleep(0.5)
        entry["available"] = sum(
            m.get("league_id") == league_id and m["match"]["season"] == season
            for m in published.values()
        )
        if entry["available"] < entry["completed"] and entry["status"] == "ok":
            entry["status"] = "partial"
        coverage.append(entry)
    result = {
        "updated_at": datetime.now(UTC).isoformat(),
        "matches": sorted(published.values(), key=lambda m: (m["match"]["date"], str(m["match"]["id"])), reverse=True),
        "issues": issues,
        "catalog": LEAGUE_CATALOG,
        "coverage": coverage,
        "refresh_seconds": round(time.monotonic() - started, 2),
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    temporary.replace(destination)
    print(f"Published {len(published)} matches; {len(issues)} source issues.")
    for entry in coverage:
        print(f"League {entry['id']}: {entry.get('available', 0)}/{entry.get('completed', '?')} verified; "
              f"{entry['fetched']} fetched; {entry['status']}")
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("web/data/matches.json"))
    parser.add_argument("--limit", type=int)
    parser.add_argument("--request-budget", type=int, default=12)
    args = parser.parse_args()
    export(args.output, args.limit, request_budget=args.request_budget)
