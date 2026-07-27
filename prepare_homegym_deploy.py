#!/usr/bin/env python3
"""Build and verify the static GitHub Pages upload folder for HomeGym."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "github-pages-upload"
FILES = [
    "index.html",
    "app.bundle.js",
    "app-redesign.js",
    "app-redesign.css",
    "manifest.json",
    "firebase-config.js",
    "notifications.js",
    "sw.js",
    "icon-192.png",
    "icon-512.png",
    "icon-192-maskable.png",
    "icon-512-maskable.png",
]


def main() -> None:
    missing = [name for name in FILES if not (ROOT / name).is_file()]
    if missing:
        raise SystemExit(f"Missing deployment files: {', '.join(missing)}")

    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("orientation") != "portrait-primary":
        raise SystemExit("manifest.json must retain portrait-primary orientation")

    sw_text = (ROOT / "sw.js").read_text(encoding="utf-8")
    cache_match = re.search(r'CACHE_NAME\s*=\s*"([^"]+)"', sw_text)
    if not cache_match:
        raise SystemExit("Could not find the HomeGym cache version in sw.js")

    firebase_text = (ROOT / "firebase-config.js").read_text(encoding="utf-8")
    if re.search(r'HOUSEHOLD_PIN_DEFAULT\s*=\s*"[^"]+"', firebase_text):
        raise SystemExit("A household key is still baked into firebase-config.js")

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    for name in FILES:
        shutil.copy2(ROOT / name, OUTPUT / name)

    copied = sorted(path.name for path in OUTPUT.iterdir())
    if copied != sorted(FILES):
        raise SystemExit("Deployment folder contains unexpected or missing files")

    total_bytes = sum((OUTPUT / name).stat().st_size for name in FILES)
    print(f"Prepared {len(FILES)} files in {OUTPUT}")
    print(f"Cache version: {cache_match.group(1)}")
    print(f"Deployment size: {total_bytes / 1024:.1f} KiB")
    print("No household sync key is baked into the deployment.")


if __name__ == "__main__":
    main()
