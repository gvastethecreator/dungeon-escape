#!/usr/bin/env python3
"""Measure wrap borders and render a compact 3x3 proof sheet."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BIOMES = ROOT / "public" / "assets" / "textures" / "biomes"


def mismatch(image: np.ndarray) -> float:
    rgb = image[..., :3].astype(np.float32)
    horizontal = np.abs(rgb[:, 0] - rgb[:, -1]).mean()
    vertical = np.abs(rgb[0] - rgb[-1]).mean()
    return float(max(horizontal, vertical))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=8)
    args = parser.parse_args()

    rows: list[tuple[float, Path, Image.Image]] = []
    for path in sorted(BIOMES.glob("*/*.png")):
        if path.stem == "door":
            continue
        if path.stem.endswith("-depth") or path.stem.endswith("-seamless"):
            continue
        image = Image.open(path).convert("RGB")
        rows.append((mismatch(np.asarray(image)), path, image))
    rows.sort(key=lambda item: item[0], reverse=True)
    selected = rows[: max(1, args.limit)]

    tile = 96
    label = 42
    sheet = Image.new("RGB", (tile * 3, len(selected) * (tile * 3 + label)), (12, 12, 12))
    draw = ImageDraw.Draw(sheet)
    report: list[dict[str, object]] = []
    for row, (error, path, image) in enumerate(selected):
        preview = image.resize((tile, tile), Image.Resampling.NEAREST)
        y = row * (tile * 3 + label)
        for iy in range(3):
            for ix in range(3):
                sheet.paste(preview, (ix * tile, y + iy * tile))
        relative = path.relative_to(ROOT).as_posix()
        draw.text((4, y + tile * 3 + 5), f"{relative}  edge={error:.2f}", fill=(235, 235, 235))
        report.append({"path": relative, "edge_mismatch": round(error, 4)})

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output)
    args.output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.output} and {args.output.with_suffix('.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
