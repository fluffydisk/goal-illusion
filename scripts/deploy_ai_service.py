"""Deploy without exposing a mistakenly configured plaintext provider binding in CLI logs."""

import re
import subprocess
import sys
import time
from pathlib import Path


def redact(text):
    text = re.sub(r"(?:gsk_|AIza)[A-Za-z0-9_-]+", "[REDACTED]", text)
    return re.sub(r'("(?:GROQ|GEMINI)_API_KEY"\s*:\s*")[^"\n]*(")', r"\1[REDACTED]\2", text)


root = Path(__file__).resolve().parents[1]
started = time.time()
process = subprocess.run(
    [str(root / "service/node_modules/.bin/wrangler"), "deploy"],
    cwd=root / "service",
    capture_output=True,
    text=True,
)
print(redact(process.stdout), end="")
print(redact(process.stderr), end="", file=sys.stderr)
# Wrangler may also write the remote configuration diff to its own local log.
for log in (Path.home() / ".config/.wrangler/logs").glob("*.log"):
    if log.stat().st_mtime < started:
        continue
    original = log.read_text()
    safe = redact(original)
    if original != safe:
        log.write_text(safe)
sys.exit(process.returncode)
