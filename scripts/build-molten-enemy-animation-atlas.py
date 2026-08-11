#!/usr/bin/env python3
"""Build the Molten runtime atlas from reviewed animation candidates.

Reviewed creatures use their 640x320 movement+attack candidate sheets.
Unreviewed creatures keep the previous static four-frame walk strip as
movement and a hold of frame 0 as attack until their video candidates land.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / ".scratch" / "biome-enemy-animation-spritesheets" / "candidates" / "molten"
STATIC_BACKUP = (
    ROOT
    / ".scratch"
    / "biome-enemy-animation-spritesheets"
    / "backups"
    / "molten-enemies-static-1760.webp"
)
OUTPUT = ROOT / "public" / "assets" / "sprites" / "enemies-v8" / "biomes" / "molten-enemies.webp"
METADATA = ROOT / "assets-source" / "enemies" / "v8" / "molten-enemies-animated.json"
V8_MANIFEST = ROOT / "assets-source" / "enemies" / "v8" / "manifest.json"
CELL = 160
KINDS = (
    "carrion",
    "goblin",
    "ghost",
    "ratling",
    "husk",
    "imp",
    "zombie-orc",
    "spider",
    "bone-slime",
    "white-eyed-shadow",
    "carrion-stalker",
)

# Only promote reviewed video candidates into the durable runtime atlas.
REVIEWED = {
    "carrion": "carrion",
    "goblin": "goblin",
    "ghost": "ghost",
    "ratling": "ratling",
    "husk": "husk",
    "imp": "imp",
    "zombie-orc": "zombie-orc",
    "spider": "spider",
    "bone-slime": "bone-slime",
    "white-eyed-shadow": "white-eyed-shadow",
    "carrion-stalker": "carrion-stalker",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_static_row(static: Image.Image, row: int) -> Image.Image:
    y0 = row * CELL
    return static.crop((0, y0, CELL * 4, y0 + CELL)).convert("RGBA")


def hold_frame(row: Image.Image, column: int = 0) -> Image.Image:
    frame = row.crop((column * CELL, 0, (column + 1) * CELL, CELL))
    out = Image.new("RGBA", (CELL * 4, CELL), (0, 0, 0, 0))
    for index in range(4):
        out.alpha_composite(frame, (index * CELL, 0))
    return out


def main() -> None:
    if not STATIC_BACKUP.is_file():
        raise FileNotFoundError(
            f"Missing static molten backup at {STATIC_BACKUP}. "
            "Copy public/assets/sprites/enemies-v8/biomes/molten-enemies.webp there first."
        )

    atlas = Image.new("RGBA", (CELL * 4, CELL * len(KINDS) * 2), (0, 0, 0, 0))
    entries: dict[str, object] = {}

    with Image.open(STATIC_BACKUP) as opened:
        static = opened.convert("RGBA")
        if static.size != (640, 1760):
            raise ValueError(f"Unexpected static molten size: {static.size}")

        for index, kind in enumerate(KINDS):
            candidate_name = REVIEWED.get(kind)
            if candidate_name is not None:
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
                    "status": "reviewed-video",
                    "candidate": candidate.relative_to(ROOT).as_posix(),
                    "source_sha256": sha256(source_path),
                    "movement_row": index * 2,
                    "attack_row": index * 2 + 1,
                    "movement_fps": runtime["states"]["idle-step"]["fps"],
                    "attack_fps": runtime["states"]["attack"]["fps"],
                    "pivot": runtime["pivot"],
                }
            else:
                movement = load_static_row(static, index)
                attack = hold_frame(movement, 0)
                atlas.alpha_composite(movement, (0, index * 320))
                atlas.alpha_composite(attack, (0, index * 320 + 160))
                entries[kind] = {
                    "status": "static-fallback",
                    "static_backup": STATIC_BACKUP.relative_to(ROOT).as_posix(),
                    "static_row": index,
                    "movement_row": index * 2,
                    "attack_row": index * 2 + 1,
                    "movement_fps": 8,
                    "attack_fps": 10,
                    "pivot": {"x": 80, "bottom": 152},
                    "notes": "Hold frame 0 as attack until a reviewed video candidate lands.",
                }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUTPUT, "WEBP", lossless=True, method=6)

    # Keep dist in sync when present so local previews match public assets.
    dist_output = ROOT / "dist" / "assets" / "sprites" / "enemies-v8" / "biomes" / "molten-enemies.webp"
    if dist_output.parent.is_dir():
        shutil.copy2(OUTPUT, dist_output)

    package = {
        "version": 1,
        "kind": "molten-enemy-animation-atlas",
        "size": [atlas.width, atlas.height],
        "cell": [CELL, CELL],
        "layout": "two interleaved rows per enemy: movement, attack",
        "frames_per_state": 4,
        "reviewed": sorted(REVIEWED),
        "enemies": entries,
        "output_sha256": sha256(OUTPUT),
        "static_backup_sha256": sha256(STATIC_BACKUP),
    }
    METADATA.parent.mkdir(parents=True, exist_ok=True)
    METADATA.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

    if V8_MANIFEST.is_file():
        manifest = json.loads(V8_MANIFEST.read_text(encoding="utf-8"))
        biome = manifest.setdefault("biome_atlases", {}).setdefault("molten", {})
        biome["path"] = "/assets/sprites/enemies-v8/biomes/molten-enemies.webp"
        biome["sha256"] = package["output_sha256"]
        biome["size_bytes"] = OUTPUT.stat().st_size
        biome["animation_package"] = "assets-source/enemies/v8/molten-enemies-animated.json"
        biome["atlas_size"] = [atlas.width, atlas.height]
        V8_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"Built {OUTPUT.relative_to(ROOT)} ({atlas.width}x{atlas.height})")
    print(f"SHA-256 {package['output_sha256']}")
    print(f"Reviewed: {', '.join(sorted(REVIEWED))}")
    print(f"Fallback: {len(KINDS) - len(REVIEWED)} static rows")


if __name__ == "__main__":
    main()
