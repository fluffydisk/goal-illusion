"""Share the exact generation and review prompts with the on-demand Worker."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from goal_illusion.narrative import (  # noqa: E402
    GROQ_MODEL,
    OUTPUT_SCHEMA,
    PROMPT_VERSION,
    REVIEW_SYSTEM,
    SYSTEM,
)
from goal_illusion.story import STORY_VERSION  # noqa: E402

destination = Path(__file__).resolve().parents[1] / "service/contract.json"
destination.write_text(
    json.dumps(
        {
            "model": GROQ_MODEL,
            "system": SYSTEM,
            "review_system": REVIEW_SYSTEM,
            "schema": OUTPUT_SCHEMA,
            "prompt_version": PROMPT_VERSION,
            "story_version": STORY_VERSION,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)
