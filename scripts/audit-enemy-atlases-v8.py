#!/usr/bin/env python3
"""Audit packaged biome enemy atlases and write source provenance.

This check does not run background removal. It reads the packaged RGBA sheets,
checks their fixed layout, records source hashes, and renders each frame over
dark and light backgrounds beside its alpha mask.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
V8 = ROOT / "public" / "assets" / "sprites" / "enemies-v8"
ASSIGNMENTS = V8 / "source-assignments.json"
RAW_ROOT = V8 / "_src" / "strips-biome"
ATLAS_ROOT = V8 / "biomes"
QA_ROOT = ROOT / ".scratch" / "enemies-v8" / "qa" / "published"
MANIFEST = V8 / "manifest.json"
PROVENANCE = V8 / "source-provenance.json"

CELL = 320
COLS = 4
ROWS = 11
SHEET_SIZE = (COLS * CELL, ROWS * CELL)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path: Path) -> str:
    return path.resolve().relative_to(ROOT.resolve()).as_posix()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_source(
    assignments: dict[str, Any], mood: str, kind: str
) -> tuple[str, Path]:
    source_mood = assignments.get("overrides", {}).get(kind, {}).get(mood, mood)
    folder = RAW_ROOT / source_mood
    source = next(
        (
            candidate
            for candidate in (
                folder / f"{kind}.png",
                folder / f"{kind}.jpg",
                folder / f"{kind}.jpeg",
            )
            if candidate.exists()
        ),
        None,
    )
    if source is None:
        raise FileNotFoundError(f"missing source for {mood}/{kind}")
    return source_mood, source


def alpha_metrics(frame: Image.Image) -> dict[str, Any]:
    alpha = frame.getchannel("A")
    histogram = alpha.histogram()
    total = frame.width * frame.height
    bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    edge_nonzero = 0
    for x in range(frame.width):
        edge_nonzero += int(alpha.getpixel((x, 0)) > 0)
        edge_nonzero += int(alpha.getpixel((x, frame.height - 1)) > 0)
    for y in range(1, frame.height - 1):
        edge_nonzero += int(alpha.getpixel((0, y)) > 0)
        edge_nonzero += int(alpha.getpixel((frame.width - 1, y)) > 0)
    return {
        "bbox": list(bbox or ()),
        "alpha_zero_ratio": round(histogram[0] / total, 6),
        "alpha_partial_ratio": round(sum(histogram[1:255]) / total, 6),
        "alpha_opaque_ratio": round(histogram[255] / total, 6),
        "edge_nonzero": edge_nonzero,
    }


def font(size: int) -> ImageFont.ImageFont:
    path = Path(r"C:\Windows\Fonts\segoeui.ttf")
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def composite(frame: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    background = Image.new("RGBA", frame.size, (*color, 255))
    background.alpha_composite(frame)
    return background.convert("RGB")


def write_background_review(
    atlas: Image.Image, mood: str, roster: list[str], destination: Path
) -> None:
    thumb = 88
    label = 150
    header = 48
    panel_count = COLS * 3
    output = Image.new(
        "RGB", (label + panel_count * thumb, header + len(roster) * thumb), (20, 20, 23)
    )
    draw = ImageDraw.Draw(output)
    body_font = font(13)
    draw.text(
        (8, 7),
        f"{mood}: each frame on dark, light, alpha",
        fill=(245, 245, 242),
        font=body_font,
    )
    for column in range(COLS):
        x = label + column * thumb * 3
        draw.text((x + 3, 27), f"f{column} D / L / A", fill=(190, 190, 196), font=body_font)
    for row, kind in enumerate(roster):
        y = header + row * thumb
        draw.text((8, y + 35), kind, fill=(245, 245, 242), font=body_font)
        for column in range(COLS):
            frame = atlas.crop(
                (column * CELL, row * CELL, (column + 1) * CELL, (row + 1) * CELL)
            ).resize((thumb, thumb), Image.Resampling.LANCZOS)
            alpha = frame.getchannel("A").convert("RGB")
            panels = (
                composite(frame, (8, 8, 10)),
                composite(frame, (238, 238, 232)),
                alpha,
            )
            for panel_index, panel in enumerate(panels):
                x = label + (column * 3 + panel_index) * thumb
                output.paste(panel, (x, y))
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, "PNG", optimize=True)


def frame_layout(roster: list[str]) -> dict[str, Any]:
    rows: dict[str, list[dict[str, int]]] = {}
    for row, kind in enumerate(roster):
        rows[kind] = [
            {"x": column * CELL, "y": row * CELL, "w": CELL, "h": CELL}
            for column in range(COLS)
        ]
    return {
        "sheetWidth": SHEET_SIZE[0],
        "sheetHeight": SHEET_SIZE[1],
        "cellWidth": CELL,
        "cellHeight": CELL,
        "rows": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit packaged biome enemy atlases")
    parser.add_argument("--atlas-root", type=Path, default=ATLAS_ROOT)
    parser.add_argument("--qa-root", type=Path, default=QA_ROOT)
    parser.add_argument("--write-package-metadata", action="store_true")
    args = parser.parse_args()
    atlas_root = args.atlas_root.resolve()
    qa_root = args.qa_root.resolve()

    assignments = load_json(ASSIGNMENTS)
    moods: list[str] = assignments["moods"]
    roster: list[str] = assignments["roster"]
    issues: list[str] = []
    atlas_reports: dict[str, Any] = {}
    source_entries: list[dict[str, Any]] = []

    for kind in roster:
        resolved = [resolve_source(assignments, mood, kind)[0] for mood in moods]
        if sorted(resolved) != sorted(moods):
            issues.append(f"{kind}: destination mapping is not a source permutation")

    for mood in moods:
        atlas_path = atlas_root / f"{mood}-enemies.png"
        if not atlas_path.exists():
            issues.append(f"{mood}: missing atlas")
            continue
        with Image.open(atlas_path) as loaded:
            atlas = loaded.convert("RGBA")
        if loaded.mode != "RGBA":
            issues.append(f"{mood}: expected RGBA, got {loaded.mode}")
        if atlas.size != SHEET_SIZE:
            issues.append(f"{mood}: expected {SHEET_SIZE}, got {atlas.size}")
            continue

        frames: dict[str, list[dict[str, Any]]] = {}
        for row, kind in enumerate(roster):
            frames[kind] = []
            source_mood, source = resolve_source(assignments, mood, kind)
            with Image.open(source) as source_image:
                source_dimensions = list(source_image.size)
            source_entries.append(
                {
                    "destination_mood": mood,
                    "kind": kind,
                    "source_mood": source_mood,
                    "source": relative(source),
                    "source_sha256": sha256(source),
                    "source_size_bytes": source.stat().st_size,
                    "source_dimensions": source_dimensions,
                }
            )
            for column in range(COLS):
                frame = atlas.crop(
                    (column * CELL, row * CELL, (column + 1) * CELL, (row + 1) * CELL)
                )
                metrics = alpha_metrics(frame)
                if not metrics["bbox"]:
                    issues.append(f"{mood}/{kind}/f{column}: empty alpha")
                if metrics["edge_nonzero"]:
                    issues.append(f"{mood}/{kind}/f{column}: alpha touches cell edge")
                frames[kind].append(metrics)

        review = qa_root / f"{mood}-background-review.png"
        write_background_review(atlas, mood, roster, review)
        atlas_reports[mood] = {
            "path": relative(atlas_path),
            "sha256": sha256(atlas_path),
            "size_bytes": atlas_path.stat().st_size,
            "dimensions": list(atlas.size),
            "background_review": relative(review),
            "frames": frames,
        }

    report = {
        "version": 1,
        "kind": "published-biome-enemy-atlas-audit",
        "status": "pass" if not issues else "fail",
        "counts": {
            "moods": len(atlas_reports),
            "rows": sum(len(atlas["frames"]) for atlas in atlas_reports.values()),
            "frames": sum(
                len(frames)
                for atlas in atlas_reports.values()
                for frames in atlas["frames"].values()
            ),
            "sources": len(source_entries),
        },
        "issues": issues,
        "source_assignments": relative(ASSIGNMENTS),
        "source_assignments_sha256": sha256(ASSIGNMENTS),
        "atlases": atlas_reports,
    }
    qa_root.mkdir(parents=True, exist_ok=True)
    report_path = qa_root / "audit-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if args.write_package_metadata:
        provenance = {
            "version": 1,
            "kind": "biome-enemy-source-provenance",
            "source_type": "imported-existing-art",
            "raw_sources_are_immutable": True,
            "raw_root": relative(RAW_ROOT),
            "source_assignments": relative(ASSIGNMENTS),
            "source_assignments_sha256": sha256(ASSIGNMENTS),
            "entries": source_entries,
        }
        PROVENANCE.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
        base_atlas = V8 / "iron-ash-enemies-v8.png"
        manifest = {
            "version": 8,
            "kind": "dungeon-enemy-atlas-manifest",
            "base_atlas": {
                "path": f"/assets/sprites/enemies-v8/{base_atlas.name}",
                "sha256": sha256(base_atlas),
                "size_bytes": base_atlas.stat().st_size,
            },
            "biome_atlases": {
                mood: {
                    "path": f"/assets/sprites/enemies-v8/biomes/{mood}-enemies.png",
                    "sha256": atlas_reports[mood]["sha256"],
                    "size_bytes": atlas_reports[mood]["size_bytes"],
                }
                for mood in moods
            },
            "frame_layout": frame_layout(roster),
            "animation": {
                "rows": {
                    kind: {"fps": 8, "frames": COLS, "loop": True} for kind in roster
                }
            },
            "processing": {
                "script": "scripts/pack-enemy-strips-v8.py",
                "method": "hybrid",
                "background_model": "ZhengPeng7/BiRefNet",
                "cell_margin": 16,
            },
            "source_assignments": relative(ASSIGNMENTS),
            "source_assignments_sha256": sha256(ASSIGNMENTS),
            "source_provenance": relative(PROVENANCE),
            "source_provenance_sha256": sha256(PROVENANCE),
        }
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"status": report["status"], **report["counts"]}, indent=2))
    print(f"report={report_path}")
    return 0 if not issues else 1


if __name__ == "__main__":
    raise SystemExit(main())
