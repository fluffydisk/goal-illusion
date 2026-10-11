"""Generate Python reference values for the independent browser implementation."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from goal_illusion.analysis import analyze  # noqa: E402

payload = json.loads(Path("web/data/matches.json").read_text())
references = []
for data in payload["matches"]:
    match = data["match"]
    home = [s["xg"] for s in data["shots"] if s["team_id"] == match["home_id"]]
    away = [s["xg"] for s in data["shots"] if s["team_id"] == match["away_id"]]
    result = analyze(home, away, data["home_fixed"], data["away_fixed"])
    references.append(
        dict(
            home=home,
            away=away,
            home_fixed=data["home_fixed"],
            away_fixed=data["away_fixed"],
            win=result.home_win,
            draw=result.draw,
            loss=result.away_win,
        )
    )
Path("tests/pages_reference.json").write_text(json.dumps(references))
print(f"Generated {len(references)} Python reference analyses.")
