#!/usr/bin/env python3
"""Key magenta Imagine plates and export 1280x3520 biome enemy atlases."""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMG = Path(
    r"C:\Users\cristian\.grok\sessions\D%3A%5CDEV%5Cdungeon-escape"
    r"\019fa1ad-88ce-7f53-9201-3c898cedeeeb\images"
)
OUT = ROOT / "public" / "assets" / "sprites" / "enemies-v5" / "biomes"
SRC = ROOT / "public" / "assets" / "sprites" / "enemies-v5" / "_src-biome"
BASE = ROOT / "public" / "assets" / "sprites" / "enemies-v5" / "iron-ash-enemies-v5.png"
TARGET = (1280, 3520)

# Confirmed by visual inspection of Imagine outputs.
MAP = {
    1: "frost",
    2: "molten",
    3: "ancient",
    4: "grim",
    5: "obsidian",
    6: "iron",
    7: "ash",
    8: "verdant",
    9: "sunken",
    10: "backrooms",
    11: "fungal",
}


def is_key(r: int, g: int, b: int) -> bool:
    if r >= 170 and b >= 150 and g <= 150 and (r + b) > 2.1 * (g + 1):
        return True
    if r >= 140 and b >= 160 and g <= 130 and abs(r - b) < 90 and (r + b) > 2.0 * (g + 1):
        return True
    if r >= 120 and b >= 130 and g <= 120 and (r + b) / 2 - g > 55:
        return True
    if min(r, b) >= 150 and g <= 110:
        return True
    return False


def despill(r: int, g: int, b: int) -> tuple[int, int, int]:
    if r > 130 and b > 130 and g < min(r, b) * 0.9:
        cap = max(g, min(r, b) // 2)
        r = min(r, cap + 35)
        b = min(b, cap + 35)
    return r, g, b


def process(src: Path, mood: str) -> dict[str, object]:
    raw_dst = SRC / f"{mood}-src.jpg"
    SRC.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, raw_dst)

    im = Image.open(src).convert("RGBA").resize(TARGET, Image.Resampling.LANCZOS)
    px = im.load()
    w, h = im.size
    keyed = 0
    kept = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_key(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                keyed += 1
                continue
            mag = (r + b) / 2 - g
            if mag > 70 and g < 160 and min(r, b) > 90:
                alpha = max(0, min(255, int(255 - (mag - 70) * 2.4)))
                if alpha < 28:
                    px[x, y] = (0, 0, 0, 0)
                    keyed += 1
                    continue
                r2, g2, b2 = despill(r, g, b)
                px[x, y] = (r2, g2, b2, alpha)
                kept += 1
                continue
            r2, g2, b2 = despill(r, g, b)
            px[x, y] = (r2, g2, b2, 255)
            kept += 1

    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = px[x, y]
            if a == 0 or not is_key(r, g, b):
                continue
            n = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    if px[x + dx, y + dy][3] == 0:
                        n += 1
            if n >= 4:
                px[x, y] = (0, 0, 0, 0)
                keyed += 1
                kept -= 1

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if a < 90:
                px[x, y] = (0, 0, 0, 0)
            elif a < 220:
                px[x, y] = (r, g, b, 255)

    if im.split()[3].getbbox() is None:
        raise RuntimeError(f"{mood}: fully transparent after key")

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{mood}-enemies.png"
    im.save(out, "PNG", optimize=True)
    return {
        "mood": mood,
        "keyed": keyed,
        "kept": kept,
        "path": str(out),
        "size": im.size,
        "bytes": out.stat().st_size,
    }


def main() -> int:
    for num, mood in MAP.items():
        src = IMG / f"{num}.jpg"
        if not src.exists():
            raise SystemExit(f"missing {src}")
        stats = process(src, mood)
        print(
            f"{mood}: keyed={stats['keyed']} kept={stats['kept']} "
            f"{stats['size']} {stats['bytes']}B"
        )
    print("base sheet:", BASE, BASE.stat().st_size if BASE.exists() else "missing")
    print("done", len(MAP), "biome sheets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
