"""Fingerprint the static app and its coherent data bundle for offline use."""

import hashlib
import json
from pathlib import Path


def build(directory: Path) -> str:
    bundle = json.loads((directory / "data/analysis.json").read_text())
    if not bundle.get("source_updated_at") or (
        bundle.get("source_updated_at") != bundle.get("snapshot", {}).get("updated_at")
    ):
        raise ValueError("Cannot cache mixed data snapshots")
    paths = sorted({p.name for p in directory.glob("*.mjs")} | {
        "index.html", "style.css", "icon.svg", "icon-192.png", "icon-512.png",
        "manifest.webmanifest", "data/analysis.json",
        "data/site.json", "statsbomb-logo.png", "data/STATSBOMB_LICENSE.pdf",
    })
    assets = {path: hashlib.sha256((directory / path).read_bytes()).hexdigest() for path in paths}
    version = hashlib.sha256(json.dumps(assets, sort_keys=True).encode()).hexdigest()[:20]
    template = (Path(__file__).parent / "service_worker.template.js").read_text()
    source = template.replace("__VERSION__", version).replace("__ASSETS__", json.dumps(assets))
    target = directory / "sw.js"
    temporary = directory / "sw.tmp"
    temporary.write_text(source)
    temporary.replace(target)
    return version


if __name__ == "__main__":
    print(f"Offline asset version: {build(Path('web'))}")
