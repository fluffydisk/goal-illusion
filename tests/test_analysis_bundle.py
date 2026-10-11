import json
from dataclasses import asdict

import pytest

from goal_illusion.data import load_example
from goal_illusion.story import build_evidence
from scripts.build_analysis_bundle import build


def fixture_files(directory):
    match = load_example()
    snapshot = {"updated_at": "new", "matches": [asdict(match)], "issues": []}
    archive = {
        "source_updated_at": "new",
        "stories": {str(match.match.id): {"facts": build_evidence(match)}},
    }
    (directory / "matches.json").write_text(json.dumps(snapshot))
    (directory / "stories.json").write_text(json.dumps(archive))
    return json.loads(json.dumps(snapshot)), json.loads(json.dumps(archive))


def test_bundle_binds_actual_shots_and_evidence(tmp_path):
    snapshot, archive = fixture_files(tmp_path)
    result = build(tmp_path)
    assert result["snapshot"] == snapshot
    assert result["stories"] == archive["stories"]
    assert json.loads((tmp_path / "analysis.json").read_text()) == result


def test_bundle_rejects_mixed_snapshots(tmp_path):
    _, archive = fixture_files(tmp_path)
    archive["source_updated_at"] = "old"
    (tmp_path / "stories.json").write_text(json.dumps(archive))
    with pytest.raises(ValueError, match="different times"):
        build(tmp_path)
    assert not (tmp_path / "analysis.json").exists()


def test_bundle_rejects_corrected_shots_with_old_evidence(tmp_path):
    snapshot, _ = fixture_files(tmp_path)
    snapshot["matches"][0]["shots"][0]["xg"] += 0.01
    (tmp_path / "matches.json").write_text(json.dumps(snapshot))
    with pytest.raises(ValueError, match="Evidence does not match"):
        build(tmp_path)
