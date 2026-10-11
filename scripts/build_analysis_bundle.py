"""Publish match inputs and their verified evidence as one coherent document."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from goal_illusion.story import fingerprint, match_from_snapshot  # noqa: E402


def build(directory: Path) -> dict:
    snapshot = json.loads((directory / "matches.json").read_text())
    archive = json.loads((directory / "stories.json").read_text())
    if archive["source_updated_at"] != snapshot["updated_at"]:
        raise ValueError("Match snapshot and evidence were built at different times")
    for record in snapshot["matches"]:
        item = archive["stories"].get(str(record["match"]["id"]))
        if not item or item["facts"]["fingerprint"] != fingerprint(match_from_snapshot(record)):
            raise ValueError(f"Evidence does not match input for {record['match']['id']}")
    bundle = {**archive, "snapshot": snapshot}
    temporary = directory / "analysis.tmp"
    temporary.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")))
    temporary.replace(directory / "analysis.json")
    return bundle


if __name__ == "__main__":
    build(Path("web/data"))
