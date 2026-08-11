#!/usr/bin/env python3
"""Generate biome enemy sizes from approved base sprites and runtime idle frames."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "assets-source" / "enemies" / "biomes-v2"
ATLAS_ROOT = ROOT / "public" / "assets" / "sprites" / "enemies-v8" / "biomes"
CATALOG_PATH = SOURCE_ROOT / "runtime-size-catalog.json"
GENERATED_TS_PATH = ROOT / "src" / "world" / "EnemyVisualSizes.generated.ts"
REVIEW_PATH = ROOT / ".scratch" / "enemy-visual-sizes" / "runtime-size-review.png"

BIOMES = [
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
]
ENEMIES = [
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
]

REFERENCE_CELL = 320
RUNTIME_CELL = 160
SOURCE_BACKGROUND_THRESHOLD = 4
ATLAS_ALPHA_THRESHOLD = 8

# The legacy body heights are the world-space calibration for the canonical
# base roster. One vertical pixel scale preserves the approved source aspect in
# both axes. Never derive width and height with separate scale factors.
REFERENCE: dict[str, dict[str, float | int]] = {
    "carrion": {"height": 0.95, "opaque_height": 259},
    "goblin": {"height": 1.55, "opaque_height": 288},
    "ghost": {"height": 1.95, "opaque_height": 288},
    "ratling": {"height": 1.20, "opaque_height": 287},
    "husk": {"height": 1.95, "opaque_height": 287},
    "imp": {"height": 1.05, "opaque_height": 255},
    "zombie-orc": {"height": 2.20, "opaque_height": 287},
    "spider": {"height": 0.75, "opaque_height": 172},
    "bone-slime": {"height": 1.00, "opaque_height": 230},
    "white-eyed-shadow": {"height": 1.95, "opaque_height": 288},
    "carrion-stalker": {"height": 1.08, "opaque_height": 272},
}


def source_foreground(image: Image.Image) -> tuple[tuple[int, int, int, int], Image.Image]:
    rgb = image.convert("RGB")
    corners = [
        rgb.getpixel((0, 0)),
        rgb.getpixel((rgb.width - 1, 0)),
        rgb.getpixel((0, rgb.height - 1)),
        rgb.getpixel((rgb.width - 1, rgb.height - 1)),
    ]
    background = tuple(
        round(statistics.median(corner[channel] for corner in corners)) for channel in range(3)
    )
    difference = ImageChops.difference(rgb, Image.new("RGB", rgb.size, background))
    red, green, blue = difference.split()
    strongest = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    mask = strongest.point(
        lambda value: 255 if value >= SOURCE_BACKGROUND_THRESHOLD else 0,
        mode="1",
    ).convert("L")
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError("source has no foreground pixels")
    return bounds, mask


def atlas_idle_bounds(image: Image.Image, row: int) -> tuple[int, int, int, int]:
    frame = image.crop((0, row * RUNTIME_CELL, RUNTIME_CELL, (row + 1) * RUNTIME_CELL))
    alpha = frame.getchannel("A")
    bounds = alpha.point(
        lambda value: 255 if value >= ATLAS_ALPHA_THRESHOLD else 0,
        mode="1",
    ).getbbox()
    if bounds is None:
        raise ValueError(f"atlas idle row {row} has no opaque pixels")
    return bounds


def body_size(
    enemy: str,
    source_bounds: tuple[int, int, int, int],
    source_size: tuple[int, int],
) -> tuple[float, float]:
    reference = REFERENCE[enemy]
    source_width = source_bounds[2] - source_bounds[0]
    source_height = source_bounds[3] - source_bounds[1]
    reference_height = float(reference["opaque_height"]) * source_size[1] / REFERENCE_CELL
    height = round(float(reference["height"]) * source_height / reference_height, 3)
    width = round(height * source_width / source_height, 3)
    if not 0.5 <= width <= 2.5 or not 0.5 <= height <= 2.5:
        raise ValueError(f"{enemy}: derived body size is outside the runtime range: {width}x{height}")
    return width, height


def build_catalog() -> dict[str, Any]:
    source_manifest = json.loads((SOURCE_ROOT / "manifest.json").read_text(encoding="utf-8"))
    entries_by_key = {entry["key"]: entry for entry in source_manifest["entries"]}
    entries: list[dict[str, Any]] = []

    for biome in BIOMES:
        atlas_path = ATLAS_ROOT / f"{biome}-enemies.webp"
        with Image.open(atlas_path) as opened_atlas:
            atlas = opened_atlas.convert("RGBA")
        if atlas.width != len(range(4)) * RUNTIME_CELL:
            raise ValueError(f"{biome}: unexpected atlas width {atlas.width}")
        rows_per_enemy = atlas.height // (len(ENEMIES) * RUNTIME_CELL)
        if rows_per_enemy not in (1, 2) or atlas.height != len(ENEMIES) * rows_per_enemy * RUNTIME_CELL:
            raise ValueError(f"{biome}: unexpected atlas height {atlas.height}")

        for enemy_index, enemy in enumerate(ENEMIES):
            key = f"{biome}/{enemy}"
            source_entry = entries_by_key[key]
            source_path = SOURCE_ROOT / source_entry["source"]["path"]
            with Image.open(source_path) as opened_source:
                source = opened_source.convert("RGB")
            source_bounds, _ = source_foreground(source)
            width, height = body_size(enemy, source_bounds, source.size)

            idle_row = enemy_index * rows_per_enemy
            idle_bounds = atlas_idle_bounds(atlas, idle_row)
            opaque_width = idle_bounds[2] - idle_bounds[0]
            opaque_height = idle_bounds[3] - idle_bounds[1]
            entries.append(
                {
                    "key": key,
                    "biome": biome,
                    "enemy": enemy,
                    "body_size_meters": {"width": width, "height": height},
                    "base_source": {
                        "path": source_entry["source"]["path"],
                        "sha256": source_entry["source"]["sha256"],
                        "canvas": list(source.size),
                        "foreground_bounds": list(source_bounds),
                    },
                    "runtime_idle": {
                        "atlas": f"public/assets/sprites/enemies-v8/biomes/{biome}-enemies.webp",
                        "atlas_size": list(atlas.size),
                        "row": idle_row,
                        "cell": RUNTIME_CELL,
                        "alpha_bounds": list(idle_bounds),
                        "opaque_width": opaque_width,
                        "opaque_height": opaque_height,
                        "top_padding": idle_bounds[1],
                        "bottom_padding": RUNTIME_CELL - idle_bounds[3],
                    },
                }
            )

    return {
        "version": 2,
        "kind": "dungeon-enemy-runtime-size-catalog",
        "method": {
            "body_size": "canonical world height scaled by approved base-source foreground height",
            "pixel_aspect": "one uniform world scale for source pixels in both axes; width derives from source aspect",
            "atlas_framing": "first idle frame only; active movement and attack extents do not change body size",
            "source_background_threshold": SOURCE_BACKGROUND_THRESHOLD,
            "atlas_alpha_threshold": ATLAS_ALPHA_THRESHOLD,
            "reference_cell": REFERENCE_CELL,
            "runtime_cell": RUNTIME_CELL,
        },
        "counts": {"biomes": len(BIOMES), "enemies": len(ENEMIES), "entries": len(entries)},
        "biome_order": BIOMES,
        "enemy_order": ENEMIES,
        "reference": REFERENCE,
        "entries": entries,
    }


def render_typescript(catalog: dict[str, Any]) -> str:
    entries = {entry["key"]: entry for entry in catalog["entries"]}
    lines = [
        "// Generated by scripts/generate-enemy-visual-size-catalog.py. Do not edit by hand.",
        'import type { DungeonMoodId } from "../systems/DungeonMood.ts";',
        'import type { EnemyRosterKind } from "./EnemySpriteAtlas.ts";',
        "",
        "/** [body width m, body height m, idle alpha width px, idle alpha height px, top px, bottom px] */",
        "export type EnemyVisualMetricTuple = readonly [number, number, number, number, number, number];",
        f"export const ENEMY_VISUAL_METRIC_FRAME_SIZE = {RUNTIME_CELL};",
        "",
        "export const ENEMY_VISUAL_METRICS: Readonly<",
        "  Record<DungeonMoodId, Readonly<Record<EnemyRosterKind, EnemyVisualMetricTuple>>>",
        "> = {",
    ]
    for biome in BIOMES:
        lines.append(f"  {biome}: {{")
        for enemy in ENEMIES:
            entry = entries[f"{biome}/{enemy}"]
            body = entry["body_size_meters"]
            idle = entry["runtime_idle"]
            key = f'"{enemy}"' if "-" in enemy else enemy
            values = [
                str(body["width"]),
                str(body["height"]),
                str(idle["opaque_width"]),
                str(idle["opaque_height"]),
                str(idle["top_padding"]),
                str(idle["bottom_padding"]),
            ]
            lines.append(f"    {key}: [{', '.join(values)}],")
        lines.append("  },")
    lines.extend(["};", ""])
    return "\n".join(lines)


def font(size: int) -> ImageFont.ImageFont:
    path = Path(r"C:\Windows\Fonts\segoeui.ttf")
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def write_text_lf(path: Path, content: str) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)


def write_review(catalog: dict[str, Any], destination: Path) -> None:
    entries = {entry["key"]: entry for entry in catalog["entries"]}
    card_width = 220
    card_height = 286
    label_width = 118
    header_height = 56
    pixels_per_meter = 98
    review = Image.new(
        "RGB",
        (label_width + card_width * len(ENEMIES), header_height + card_height * len(BIOMES)),
        (10, 11, 14),
    )
    draw = ImageDraw.Draw(review)
    title_font = font(17)
    label_font = font(14)
    small_font = font(12)
    draw.text((10, 8), "Enemy runtime size lock", fill=(244, 244, 238), font=title_font)
    for enemy_index, enemy in enumerate(ENEMIES):
        x = label_width + enemy_index * card_width
        draw.text((x + 7, 32), enemy, fill=(190, 195, 205), font=small_font)
    for biome_index, biome in enumerate(BIOMES):
        row_y = header_height + biome_index * card_height
        draw.text((10, row_y + 12), biome, fill=(244, 244, 238), font=label_font)
        for enemy_index, enemy in enumerate(ENEMIES):
            entry = entries[f"{biome}/{enemy}"]
            card_x = label_width + enemy_index * card_width
            draw.rectangle(
                (card_x, row_y, card_x + card_width - 1, row_y + card_height - 1),
                outline=(42, 45, 53),
            )
            source_path = SOURCE_ROOT / entry["base_source"]["path"]
            with Image.open(source_path) as opened:
                source = opened.convert("RGB")
            bounds = tuple(entry["base_source"]["foreground_bounds"])
            body = source.crop(bounds)
            size = entry["body_size_meters"]
            target_width = max(1, round(size["width"] * pixels_per_meter))
            target_height = max(1, round(size["height"] * pixels_per_meter))
            body = body.resize((target_width, target_height), Image.Resampling.LANCZOS)
            image_x = card_x + (card_width - target_width) // 2
            baseline_y = row_y + card_height - 42
            review.paste(body, (image_x, baseline_y - target_height))
            draw.line(
                (card_x + 8, baseline_y, card_x + card_width - 8, baseline_y),
                fill=(73, 78, 88),
            )
            draw.text(
                (card_x + 7, row_y + card_height - 31),
                f'{size["width"]:.3f} x {size["height"]:.3f} m',
                fill=(204, 209, 218),
                font=small_font,
            )
    destination.parent.mkdir(parents=True, exist_ok=True)
    review.save(destination, "PNG", optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail when generated files differ.")
    parser.add_argument("--write-review", action="store_true", help="Write the visual size review.")
    args = parser.parse_args()

    catalog = build_catalog()
    catalog_text = json.dumps(catalog, indent=2, ensure_ascii=False) + "\n"
    typescript_text = render_typescript(catalog)

    if args.check:
        mismatches = []
        for path, expected in ((CATALOG_PATH, catalog_text), (GENERATED_TS_PATH, typescript_text)):
            if not path.exists() or path.read_text(encoding="utf-8") != expected:
                mismatches.append(str(path.relative_to(ROOT)))
        if mismatches:
            raise SystemExit("Generated enemy size files differ: " + ", ".join(mismatches))
    else:
        write_text_lf(CATALOG_PATH, catalog_text)
        write_text_lf(GENERATED_TS_PATH, typescript_text)

    if args.write_review:
        write_review(catalog, REVIEW_PATH)

    print(
        json.dumps(
            {
                "status": "pass",
                "entries": len(catalog["entries"]),
                "catalog": str(CATALOG_PATH.relative_to(ROOT)),
                "typescript": str(GENERATED_TS_PATH.relative_to(ROOT)),
                "review": str(REVIEW_PATH.relative_to(ROOT)) if args.write_review else None,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
