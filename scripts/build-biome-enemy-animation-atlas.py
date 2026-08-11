#!/usr/bin/env python3
"""Build one runtime biome atlas from all 11 reviewed animation candidates."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CANDIDATE_ROOT = ROOT / ".scratch" / "biome-enemy-animation-spritesheets" / "candidates"
V8_ROOT = ROOT / "assets-source" / "enemies" / "v8"
V8_MANIFEST = V8_ROOT / "manifest.json"
OUTPUT_ROOT = ROOT / "public" / "assets" / "sprites" / "enemies-v8" / "biomes"
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
BIOMES = (
    "molten",
    "frost",
    "grim",
    "verdant",
    "ash",
    "iron",
    "obsidian",
    "sunken",
    "fungal",
    "backrooms",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_candidate(biome: str, kind: str) -> tuple[Path, dict[str, object]]:
    candidate = CANDIDATE_ROOT / biome / kind
    manifest_path = candidate / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    runtime = manifest.get("runtime")
    if not isinstance(runtime, dict):
        raise ValueError(f"missing runtime contract: {manifest_path}")
    if runtime.get("size") != [640, 320] or runtime.get("cell") != [160, 160]:
        raise ValueError(f"unexpected runtime layout for {biome}/{kind}: {runtime}")
    if runtime.get("pivot") != {"x": 80, "bottom": 152}:
        raise ValueError(f"unexpected pivot for {biome}/{kind}: {runtime.get('pivot')}")
    states = runtime.get("states")
    if not isinstance(states, dict):
        raise ValueError(f"missing runtime states for {biome}/{kind}")
    for state in ("idle-step", "attack"):
        entry = states.get(state)
        if not isinstance(entry, dict) or len(entry.get("frames", [])) != 4:
            raise ValueError(f"{biome}/{kind}/{state} must contain four frames")
    source_path = candidate / "sprite-sheet-runtime.png"
    expected = manifest.get("outputs", {}).get("png", {}).get("sha256")
    if expected != sha256(source_path):
        raise ValueError(f"candidate hash mismatch: {source_path}")
    return source_path, manifest


def build(biome: str) -> dict[str, object]:
    atlas = Image.new("RGBA", (CELL * 4, CELL * len(KINDS) * 2), (0, 0, 0, 0))
    entries: dict[str, object] = {}
    for index, kind in enumerate(KINDS):
        source_path, manifest = load_candidate(biome, kind)
        runtime = manifest["runtime"]
        with Image.open(source_path) as opened:
            source = opened.convert("RGBA")
            if source.size != (640, 320):
                raise ValueError(f"unexpected source size for {biome}/{kind}: {source.size}")
            atlas.alpha_composite(source.crop((0, 0, 640, 160)), (0, index * 320))
            atlas.alpha_composite(source.crop((0, 160, 640, 320)), (0, index * 320 + 160))
        candidate = source_path.parent
        entries[kind] = {
            "status": "reviewed",
            "candidate": candidate.relative_to(ROOT).as_posix(),
            "source_sha256": sha256(source_path),
            "validation_fingerprint": manifest["source_validation"]["input_fingerprint"],
            "movement_row": index * 2,
            "attack_row": index * 2 + 1,
            "movement_fps": runtime["states"]["idle-step"]["fps"],
            "attack_fps": runtime["states"]["attack"]["fps"],
            "pivot": runtime["pivot"],
        }

    output = OUTPUT_ROOT / f"{biome}-enemies.webp"
    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output, "WEBP", lossless=True, quality=100, method=6)
    package: dict[str, object] = {
        "version": 1,
        "kind": "biome-enemy-animation-atlas",
        "biome": biome,
        "size": [atlas.width, atlas.height],
        "cell": [CELL, CELL],
        "layout": "two interleaved rows per enemy: movement, attack",
        "frames_per_state": 4,
        "reviewed": list(KINDS),
        "enemies": entries,
        "output_sha256": sha256(output),
    }
    metadata = V8_ROOT / f"{biome}-enemies-animated.json"
    metadata.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

    manifest = json.loads(V8_MANIFEST.read_text(encoding="utf-8"))
    biome_entry = manifest.setdefault("biome_atlases", {}).setdefault(biome, {})
    biome_entry.update(
        {
            "path": f"/assets/sprites/enemies-v8/biomes/{biome}-enemies.webp",
            "sha256": package["output_sha256"],
            "size_bytes": output.stat().st_size,
            "animation_package": metadata.relative_to(ROOT).as_posix(),
            "atlas_size": [atlas.width, atlas.height],
        }
    )
    V8_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    dist_output = ROOT / "dist" / "assets" / "sprites" / "enemies-v8" / "biomes" / output.name
    if dist_output.parent.is_dir():
        shutil.copy2(output, dist_output)
    return package


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--biome", required=True, choices=BIOMES)
    args = parser.parse_args()
    package = build(args.biome)
    print(
        f"Built {args.biome}: {package['size'][0]}x{package['size'][1]} "
        f"SHA-256 {package['output_sha256']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
