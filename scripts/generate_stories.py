"""Build evidence and original narratives once; publish them as static JSON."""

import argparse
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from goal_illusion.data import DataError  # noqa: E402
from goal_illusion.narrative import (  # noqa: E402
    DEFAULT_MODEL,
    GROQ_MODEL,
    generate_narrative,
    narrative_matches,
)
from goal_illusion.story import STORY_VERSION, build_evidence, match_from_snapshot  # noqa: E402


def generate(
    matches_path: Path,
    destination: Path,
    *,
    base_url: str,
    model: str = DEFAULT_MODEL,
    limit: int | None = None,
    evidence_only: bool = False,
    provider: str = "ollama",
) -> dict:
    snapshot = json.loads(matches_path.read_text())
    records = snapshot["matches"]
    try:
        previous = json.loads(destination.read_text()) if destination.exists() else {}
    except (ValueError, OSError):
        previous = {}
    result = {
        "version": STORY_VERSION,
        "updated_at": datetime.now(UTC).isoformat(),
        "source_updated_at": snapshot["updated_at"],
        "stories": {},
    }

    def checkpoint():
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(".tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        temporary.replace(destination)

    pending = []
    for record in records:
        facts = build_evidence(match_from_snapshot(record))
        key = str(facts["match_id"])
        cached = previous.get("stories", {}).get(key, {}).get("narrative")
        valid = (
            narrative_matches(cached, facts)
            and cached.get("model") == model
            and cached.get("provider", "ollama") == provider
        )
        result["stories"][key] = {
            "facts": facts,
            "narrative": cached if valid else None,
            "status": "ready" if valid else "pending",
        }
        if not valid:
            pending.append((record["match"]["date"], key))
    checkpoint()
    if not evidence_only:
        for index, (_, key) in enumerate(sorted(pending, reverse=True)[:limit]):
            if provider == "groq" and index:
                time.sleep(20)  # Pace requests within the free token quota.
            story = result["stories"][key]
            try:
                story["narrative"] = generate_narrative(
                    story["facts"], base_url=base_url, model=model, provider=provider
                )
                story["status"] = "ready"
                print(f"{key}: {story['narrative']['headline']}", flush=True)
            except DataError as error:
                story["status"] = "unavailable"
                print(f"{key}: {error}", file=sys.stderr, flush=True)
            checkpoint()
    ready = sum(s["status"] == "ready" for s in result["stories"].values())
    print(f"Stories: {ready}/{len(records)} AI narratives; all matches have evidence.", flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--matches", type=Path, default=Path("web/data/matches.json"))
    parser.add_argument("--output", type=Path, default=Path("web/data/stories.json"))
    parser.add_argument(
        "--base-url", default=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    )
    parser.add_argument("--provider", choices=["groq", "ollama"], default="ollama")
    parser.add_argument("--model")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--evidence-only", action="store_true")
    args = parser.parse_args()
    generate(
        args.matches,
        args.output,
        base_url=args.base_url,
        model=args.model or (GROQ_MODEL if args.provider == "groq" else DEFAULT_MODEL),
        provider=args.provider,
        limit=args.limit,
        evidence_only=args.evidence_only,
    )
