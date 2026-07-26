#!/usr/bin/env python3
"""Key pure/near-magenta backgrounds out of pixel art sprites to clean RGBA PNGs."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image


def is_magenta_key(r: int, g: int, b: int) -> bool:
    # Solid #FF00FF and near-magenta fringes from compression.
    if r >= 200 and b >= 200 and g <= 140:
        return True
    if r >= 180 and b >= 180 and g <= 120 and (r + b) > 2.4 * (g + 1):
        return True
    # Hot pink / magenta-ish residual
    if r >= 160 and b >= 140 and g <= 100 and abs(r - b) < 80:
        return True
    return False


def despill(r: int, g: int, b: int) -> tuple[int, int, int]:
    # Pull magenta fringe toward greyscale of non-magenta channels.
    if r > 140 and b > 140 and g < min(r, b) * 0.85:
        cap = max(g, min(r, b) // 2)
        r = min(r, cap + 40)
        b = min(b, cap + 40)
    return r, g, b


def key_image(src: Path, dst: Path) -> dict[str, int]:
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    keyed = 0
    kept = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_magenta_key(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                keyed += 1
                continue
            r2, g2, b2 = despill(r, g, b)
            # Soft edge: if mostly magenta but not pure, fade alpha
            magenta_score = (r + b) / 2 - g
            if magenta_score > 90 and g < 150:
                alpha = max(0, min(255, int(255 - (magenta_score - 90) * 2.2)))
                if alpha < 24:
                    px[x, y] = (0, 0, 0, 0)
                    keyed += 1
                    continue
                px[x, y] = (r2, g2, b2, alpha)
                kept += 1
                continue
            px[x, y] = (r2, g2, b2, 255)
            kept += 1
    # Second pass: kill isolated magenta islands left as fully opaque
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if not is_magenta_key(r, g, b):
                continue
            transparent_n = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    if px[x + dx, y + dy][3] == 0:
                        transparent_n += 1
            if transparent_n >= 4:
                px[x, y] = (0, 0, 0, 0)
                keyed += 1
                kept -= 1
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "PNG")
    return {"keyed": keyed, "kept": kept, "w": w, "h": h}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--suffix", default="")
    args = parser.parse_args()
    for src in args.inputs:
        name = src.stem
        if name.endswith("-src"):
            name = name[: -len("-src")]
        dst = args.out_dir / f"{name}{args.suffix}.png"
        stats = key_image(src, dst)
        print(f"{src.name} -> {dst.name}: keyed={stats['keyed']} kept={stats['kept']} {stats['w']}x{stats['h']}")


if __name__ == "__main__":
    main()
