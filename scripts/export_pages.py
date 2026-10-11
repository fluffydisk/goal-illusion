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
    LEAGUES,
    completed_matches,
    fetch_fotmob,
    normalize_fotmob,
    seasons_from_league,
)


def export(destination: Path, limit: int | None = None) -> dict:
    previous = json.loads(destination.read_text()) if destination.exists() else {}
    cached = {str(m["match"]["id"]): m for m in previous.get("matches", [])}
    matches = [asdict(load_example())]
    issues = []
    for label, league_id in LEAGUES.items():
        try:
            league = fetch_fotmob("leagues", id=league_id)
            season = seasons_from_league(league)[0]
            records = completed_matches(league)
        except DataError as error:
            issues.append(f"{label}: {error}")
            matches.extend(m for m in cached.values() if m.get("league_id") == league_id)
            continue
        for record in records[:limit]:
            match_id = str(record["id"])
            saved = cached.get(match_id)
            # Recent games can receive corrections; older completed games are cached.
            age = datetime.now(UTC) - datetime.fromisoformat(
                record["status"]["utcTime"].replace("Z", "+00:00")
            )
            if saved and age.days >= 3:
                matches.append(saved)
                continue
            try:
                data = asdict(
                    normalize_fotmob(fetch_fotmob("matchDetails", matchId=match_id), season)
                )
                data["league_id"] = league_id
                matches.append(data)
            except DataError as error:
                issues.append(f"{label}, maç {match_id}: {error}")
                if saved:
                    matches.append(saved)
            time.sleep(0.5)
    result = {
        "updated_at": datetime.now(UTC).isoformat(),
        "matches": matches,
        "issues": issues,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    temporary.replace(destination)
    print(f"Published {len(matches)} matches; {len(issues)} source issues.")
    for issue in issues:
        print(issue, file=sys.stderr)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("web/data/matches.json"))
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    export(args.output, args.limit)
