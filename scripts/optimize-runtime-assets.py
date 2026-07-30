#!/usr/bin/env python3
"""Build compact runtime images in-place and keep source metadata outside public/.

The transform is deterministic and idempotent: unchanged outputs recorded in the
manifest are skipped. PNG/JPEG files become WebP; existing WebP files are resized
without changing their URL. Every raster is reduced to 50% of each source axis.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
MANIFEST = ROOT / "assets-source" / "runtime-optimization-manifest.json"
RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
NEAREST_PREFIXES = (
    "assets/sprites/biome-props/",
    "assets/sprites/enemies-v8/",
    "assets/sprites/keyed/",
    "assets/textures/hazards/",
    "assets/ui/biome-icons/",
    "assets/ui/portraits/",
)
NEAREST_FILES = {"assets/sprites/iron-ash-items.png"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def target_for(source: Path) -> Path:
    return source if source.suffix.lower() == ".webp" else source.with_suffix(".webp")


def uses_nearest(public_path: str) -> bool:
    return public_path in NEAREST_FILES or public_path.startswith(NEAREST_PREFIXES)


def load_previous() -> dict[str, dict[str, Any]]:
    if not MANIFEST.exists():
        return {}
    payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {entry["target"]: entry for entry in payload.get("images", [])}


def save_webp(image: Image.Image, target: Path, *, lossless: bool) -> None:
    temporary = target.with_name(f".{target.name}.tmp.webp")
    target.parent.mkdir(parents=True, exist_ok=True)
    options: dict[str, Any] = {"format": "WEBP", "method": 4}
    if lossless:
        options.update(lossless=True, exact=True)
    else:
        options.update(quality=82)
    image.save(temporary, **options)
    os.replace(temporary, target)


def main() -> int:
    previous = load_previous()
    sources = sorted(
        path
        for path in PUBLIC.rglob("*")
        if path.is_file() and path.suffix.lower() in RASTER_EXTENSIONS
    )
    source_targets: dict[Path, Path] = {}
    for source in sources:
        target = target_for(source)
        owner = source_targets.get(target)
        if owner is not None and owner != source:
            raise RuntimeError(f"output collision: {relative(owner)} and {relative(source)}")
        source_targets[target] = source

    images: list[dict[str, Any]] = []
    skipped = 0
    converted = 0
    original_bytes = 0
    optimized_bytes = 0

    for target, source in sorted(source_targets.items(), key=lambda item: relative(item[0])):
        target_key = relative(target)
        prior = previous.get(target_key)
        current_sha = sha256(source)
        if source == target and prior and prior.get("targetSha256") == current_sha:
            images.append(prior)
            original_bytes += int(prior["sourceBytes"])
            optimized_bytes += source.stat().st_size
            skipped += 1
            continue

        source_size_bytes = source.stat().st_size
        public_path = source.relative_to(PUBLIC).as_posix()
        with Image.open(source) as loaded:
            loaded.load()
            source_dimensions = [loaded.width, loaded.height]
            target_dimensions = [max(1, loaded.width // 2), max(1, loaded.height // 2)]
            resample_name = "nearest" if uses_nearest(public_path) else "lanczos"
            resample = Image.Resampling.NEAREST if resample_name == "nearest" else Image.Resampling.LANCZOS
            optimized = loaded.resize(tuple(target_dimensions), resample=resample)
            has_alpha = "A" in optimized.getbands()
            lossless = source.suffix.lower() == ".png" or has_alpha
            if optimized.mode not in {"RGB", "RGBA"}:
                optimized = optimized.convert("RGBA" if has_alpha else "RGB")
            save_webp(optimized, target, lossless=lossless)

        if source != target:
            source.unlink()
        entry = {
            "source": relative(source),
            "target": target_key,
            "sourceFormat": source.suffix.lower().lstrip("."),
            "targetFormat": "webp",
            "sourceDimensions": source_dimensions,
            "targetDimensions": target_dimensions,
            "sourceBytes": source_size_bytes,
            "targetBytes": target.stat().st_size,
            "sourceSha256": current_sha,
            "targetSha256": sha256(target),
            "resample": resample_name,
            "encoding": "lossless" if lossless else "quality-82",
        }
        images.append(entry)
        original_bytes += source_size_bytes
        optimized_bytes += target.stat().st_size
        converted += 1

    payload = {
        "version": 1,
        "policy": {
            "dimensions": "floor(source / 2) on each axis",
            "runtimeFormat": "webp",
            "pixelArtResample": "nearest",
            "continuousArtResample": "lanczos",
        },
        "summary": {
            "images": len(images),
            "converted": converted,
            "skipped": skipped,
            "sourceBytes": original_bytes,
            "targetBytes": optimized_bytes,
            "savedBytes": original_bytes - optimized_bytes,
            "savedPercent": round((1 - optimized_bytes / original_bytes) * 100, 2)
            if original_bytes
            else 0,
        },
        "images": images,
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
