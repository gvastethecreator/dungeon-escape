#!/usr/bin/env python3
"""Build compact contact sheets for the final model and biome review."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


VIEWS = ("front", "right", "back", "left", "rear-left", "top")
DOOR_MOODS = (
    "ancient",
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
TILE_SIZE = (220, 184)
IMAGE_SIZE = (212, 154)
TITLE_HEIGHT = 44


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-manifest", type=Path, required=True)
    parser.add_argument("--six-dir", type=Path, required=True)
    parser.add_argument(
        "--doors-dir",
        type=Path,
        help="Optional directory containing the eleven biome door three-view captures.",
    )
    parser.add_argument(
        "--mood",
        action="append",
        default=[],
        metavar="NAME=DIR",
        help="Add a biome capture directory; repeat for each mood.",
    )
    parser.add_argument("--out", type=Path, required=True)
    return parser.parse_args()


def load_font(size: int) -> ImageFont.ImageFont:
    for path in (
        Path("C:/Windows/Fonts/consola.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ):
        if path.is_file():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def parse_moods(values: list[str]) -> list[tuple[str, Path]]:
    moods: list[tuple[str, Path]] = []
    for value in values:
        if "=" not in value:
            raise ValueError(f"Mood must use NAME=DIR: {value}")
        name, raw_path = value.split("=", 1)
        moods.append((name.strip(), Path(raw_path).resolve()))
    return moods


def draw_sheet(
    title: str,
    row_ids: list[str],
    columns: list[str],
    image_paths: dict[tuple[str, str], Path],
    out_path: Path,
) -> list[str]:
    width = TILE_SIZE[0] * len(columns)
    height = TITLE_HEIGHT + TILE_SIZE[1] * len(row_ids)
    sheet = Image.new("RGB", (width, height), (20, 23, 25))
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(20)
    label_font = load_font(13)
    draw.text((10, 10), title, fill=(216, 225, 221), font=title_font)
    missing: list[str] = []
    for row, model_id in enumerate(row_ids):
        for column, column_id in enumerate(columns):
            x = column * TILE_SIZE[0]
            y = TITLE_HEIGHT + row * TILE_SIZE[1]
            draw.rectangle(
                (x + 1, y + 1, x + TILE_SIZE[0] - 2, y + TILE_SIZE[1] - 2),
                outline=(67, 77, 78),
                width=1,
            )
            path = image_paths.get((model_id, column_id))
            if path and path.is_file():
                with Image.open(path) as source:
                    tile = ImageOps.contain(source.convert("RGB"), IMAGE_SIZE, Image.Resampling.LANCZOS)
                image_x = x + (TILE_SIZE[0] - tile.width) // 2
                sheet.paste(tile, (image_x, y + 4))
            else:
                missing.append(f"{model_id}:{column_id}")
                draw.rectangle(
                    (x + 8, y + 8, x + TILE_SIZE[0] - 8, y + IMAGE_SIZE[1]),
                    fill=(64, 24, 28),
                )
                draw.text((x + 16, y + 66), "MISSING", fill=(255, 166, 166), font=title_font)
            draw.rectangle(
                (x + 2, y + TILE_SIZE[1] - 24, x + TILE_SIZE[0] - 3, y + TILE_SIZE[1] - 3),
                fill=(11, 13, 14),
            )
            draw.text(
                (x + 7, y + TILE_SIZE[1] - 21),
                f"{model_id} · {column_id}",
                fill=(196, 209, 203),
                font=label_font,
            )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, optimize=True)
    return missing


def main() -> None:
    args = parse_args()
    manifest = json.loads(args.reference_manifest.read_text(encoding="utf-8"))
    by_category: dict[str, list[str]] = defaultdict(list)
    reference_paths: dict[str, Path] = {}
    for entry in manifest["objects"]:
        by_category[entry["category"]].append(entry["id"])
        reference_paths[entry["id"]] = (
            args.reference_manifest.parent / entry["reference"]
        ).resolve()
    moods = parse_moods(args.mood)
    output: list[dict[str, object]] = []
    six_root = args.six_dir.resolve()
    for category, model_ids in by_category.items():
        six_paths = {
            (model_id, view): six_root / f"{model_id}-{view}.png"
            for model_id in model_ids
            for view in VIEWS
        }
        six_out = args.out / f"{category}-six-view.png"
        missing = draw_sheet(
            f"{category.upper()} · six-view neutral",
            model_ids,
            list(VIEWS),
            six_paths,
            six_out,
        )
        output.append({"sheet": str(six_out.as_posix()), "missing": missing})
        reference_comparison_paths = {
            (model_id, column): (
                reference_paths[model_id]
                if column == "reference"
                else six_root / f"{model_id}-{column}.png"
            )
            for model_id in model_ids
            for column in ("reference", "front", "right", "rear-left")
        }
        reference_out = args.out / f"{category}-reference-vs-neutral.png"
        missing = draw_sheet(
            f"{category.upper()} · source reference vs neutral renders",
            model_ids,
            ["reference", "front", "right", "rear-left"],
            reference_comparison_paths,
            reference_out,
        )
        output.append({"sheet": str(reference_out.as_posix()), "missing": missing})
        if moods:
            mood_paths = {
                (model_id, mood_name): mood_root / f"{model_id}-front.png"
                for model_id in model_ids
                for mood_name, mood_root in moods
            }
            mood_out = args.out / f"{category}-biome-fronts.png"
            missing = draw_sheet(
                f"{category.upper()} · biome front comparison",
                model_ids,
                [name for name, _ in moods],
                mood_paths,
                mood_out,
            )
            output.append({"sheet": str(mood_out.as_posix()), "missing": missing})
            for mood_name, mood_root in moods:
                mood_view_paths = {
                    (model_id, view): mood_root / f"{model_id}-{view}.png"
                    for model_id in model_ids
                    for view in ("front", "right", "rear-left")
                }
                mood_views_out = args.out / f"{category}-{mood_name}-three-view.png"
                missing = draw_sheet(
                    f"{category.upper()} · {mood_name} three-view",
                    model_ids,
                    ["front", "right", "rear-left"],
                    mood_view_paths,
                    mood_views_out,
                )
                output.append({"sheet": str(mood_views_out.as_posix()), "missing": missing})
    if args.doors_dir:
        doors_root = args.doors_dir.resolve()
        door_ids = [f"door-{name}" for name in DOOR_MOODS]
        door_paths = {
            (door_id, view): doors_root / f"{door_id}-{view}.png"
            for door_id in door_ids
            for view in ("front", "right", "rear-left")
        }
        doors_out = args.out / "doors-biome-three-view.png"
        missing = draw_sheet(
            "DOORS · all biome plates in three views",
            door_ids,
            ["front", "right", "rear-left"],
            door_paths,
            doors_out,
        )
        output.append({"sheet": str(doors_out.as_posix()), "missing": missing})
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceManifest": str(args.reference_manifest.resolve().as_posix()),
        "sixViewDirectory": str(six_root.as_posix()),
        "doorsDirectory": str(args.doors_dir.resolve().as_posix()) if args.doors_dir else None,
        "moods": {name: str(path.as_posix()) for name, path in moods},
        "sheets": output,
        "missingCount": sum(len(entry["missing"]) for entry in output),
    }
    report_path = args.out / "review-sheets-manifest.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(report_path), "missing": report["missingCount"]}, indent=2))


if __name__ == "__main__":
    main()
