#!/usr/bin/env python3
"""Build the Ancient runtime atlas from the approved animation candidates."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / ".scratch" / "biome-enemy-animation-spritesheets" / "candidates" / "ancient"
OUTPUT = ROOT / "public" / "assets" / "sprites" / "enemies-v8" / "biomes" / "ancient-enemies.webp"
METADATA = ROOT / "assets-source" / "enemies" / "v8" / "ancient-enemies-animated.json"
CELL = 160
KINDS = {
    "carrion": "carrion",
    "goblin": "goblin",
    "ghost": "ghost-v2",
    "ratling": "ratling",
    "husk": "husk",
    "imp": "imp-v5",
    "zombie-orc": "zombie-orc",
    "spider": "spider",
    "bone-slime": "bone-slime",
    "white-eyed-shadow": "white-eyed-shadow",
    "carrion-stalker": "carrion-stalker",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    atlas = Image.new("RGBA", (CELL * 4, CELL * len(KINDS) * 2), (0, 0, 0, 0))
    entries: dict[str, object] = {}

    for index, (kind, candidate_name) in enumerate(KINDS.items()):
        candidate = CANDIDATES / candidate_name
        manifest_path = candidate / "manifest.json"
        source_path = candidate / "sprite-sheet-runtime.png"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        runtime = manifest["runtime"]
        if runtime["size"] != [640, 320] or runtime["cell"] != [160, 160]:
            raise ValueError(f"Unexpected runtime layout for {kind}: {runtime}")
        if runtime["pivot"] != {"x": 80, "bottom": 152}:
            raise ValueError(f"Unexpected pivot for {kind}: {runtime['pivot']}")
        for state in ("idle-step", "attack"):
            if len(runtime["states"][state]["frames"]) != 4:
                raise ValueError(f"{kind}/{state} must contain four frames")

        with Image.open(source_path) as source:
            rgba = source.convert("RGBA")
            if rgba.size != (640, 320):
                raise ValueError(f"Unexpected source size for {kind}: {rgba.size}")
            atlas.alpha_composite(rgba.crop((0, 0, 640, 160)), (0, index * 320))
            atlas.alpha_composite(rgba.crop((0, 160, 640, 320)), (0, index * 320 + 160))

        entries[kind] = {
            "candidate": candidate.relative_to(ROOT).as_posix(),
            "source_sha256": sha256(source_path),
            "movement_row": index * 2,
            "attack_row": index * 2 + 1,
            "movement_fps": runtime["states"]["idle-step"]["fps"],
            "attack_fps": runtime["states"]["attack"]["fps"],
            "pivot": runtime["pivot"],
        }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUTPUT, "WEBP", lossless=True, method=6)
    package = {
        "version": 1,
        "kind": "ancient-enemy-animation-atlas",
        "size": [atlas.width, atlas.height],
        "cell": [CELL, CELL],
        "layout": "two interleaved rows per enemy: movement, attack",
        "frames_per_state": 4,
        "enemies": entries,
        "output_sha256": sha256(OUTPUT),
    }
    METADATA.parent.mkdir(parents=True, exist_ok=True)
    METADATA.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
    print(f"Built {OUTPUT.relative_to(ROOT)} ({atlas.width}x{atlas.height})")
    print(f"SHA-256 {package['output_sha256']}")


if __name__ == "__main__":
    main()
