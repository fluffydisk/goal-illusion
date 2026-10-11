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
    NarrativeRateLimitError,
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
    seed_path: Path | None = None,
) -> dict:
    snapshot = json.loads(matches_path.read_text())
    records = snapshot["matches"]
    try:
        previous = json.loads(destination.read_text()) if destination.exists() else {}
    except (ValueError, OSError):
        previous = {}
    seeds = (
        json.loads(seed_path.read_text()).get("stories", {})
        if seed_path and seed_path.exists()
        else {}
    )
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
        old = previous.get("stories", {}).get(key, {})
        cached = old.get("narrative")
        seed = seeds.get(key)
        if (
            narrative_matches(seed, facts)
            and seed.get("provider") == "assistant"
            and seed.get("model") == "Codex"
        ):
            cached = seed
        same_input = old.get("facts", {}).get("fingerprint") == facts["fingerprint"]
        failures = (
            old.get("failed_attempts", 0)
            if same_input and old.get("validation_revision") == 2
            else 0
        )
        valid = narrative_matches(cached, facts) and (
            (cached.get("model") == model and cached.get("provider", "ollama") == provider)
            or (cached.get("provider") == "assistant" and cached.get("model") == "Codex")
        )
        result["stories"][key] = {
            "facts": facts,
            "narrative": cached if valid else None,
            "status": "ready" if valid else "pending",
            "failed_attempts": failures,
            "validation_revision": 2,
        }
        if not valid:
            pending.append((-failures, record["match"]["date"], key))
    checkpoint()
    processed, rate_limited = 0, False
    if not evidence_only:
        for index, (_, _, key) in enumerate(sorted(pending, reverse=True)[:limit]):
            if provider == "groq" and index:
                time.sleep(20)  # Pace requests within the free token quota.
            story = result["stories"][key]
            processed += 1
            try:
                story["narrative"] = generate_narrative(
                    story["facts"], base_url=base_url, model=model, provider=provider
                )
                story["status"] = "ready"
                story["failed_attempts"] = 0
                print(f"{key}: {story['narrative']['headline']}", flush=True)
            except DataError as error:
                rate_limited = isinstance(error, NarrativeRateLimitError)
                story["status"] = "rate_limited" if rate_limited else "unavailable"
                if not rate_limited:
                    story["failed_attempts"] += 1
                story["failure_reason"] = str(error)
                print(f"{key}: {error}", file=sys.stderr, flush=True)
            checkpoint()
            if rate_limited:
                break
    ready = sum(s["status"] == "ready" for s in result["stories"].values())
    attempted = processed
    created = sum(s["status"] == "ready" for s in result["stories"].values()) - (
        len(records) - len(pending)
    )
    result["generation"] = {
        "attempted": attempted,
        "created": created,
        "ready": ready,
        "total": len(records),
        "failed": attempted - created,
        "rate_limited": rate_limited,
    }
    checkpoint()
    if attempted and not created:
        print(
            "::warning::AI generation produced no new stories; inspect rejection reasons.",
            flush=True,
        )
    if summary := os.getenv("GITHUB_STEP_SUMMARY"):
        with open(summary, "a") as output:
            output.write(
                f"\nAI stories: **{ready}/{len(records)}**. "
                f"Attempted: {attempted}; new: {created}; rejected: {attempted - created}.\n"
            )
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
    parser.add_argument("--seed", type=Path, default=Path("web/data/reviewed-stories.json"))
    parser.add_argument("--limit", type=int)
    parser.add_argument("--evidence-only", action="store_true")
    args = parser.parse_args()
    generate(
        args.matches,
        args.output,
        base_url=args.base_url,
        model=args.model or (GROQ_MODEL if args.provider == "groq" else DEFAULT_MODEL),
        provider=args.provider,
        seed_path=args.seed,
        limit=args.limit,
        evidence_only=args.evidence_only,
    )
