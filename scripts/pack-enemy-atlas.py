#!/usr/bin/env python3
"""Crop keyed enemy sprites tightly and pack into a runtime atlas.

Also flood-cleans residual neutral-grey studio background that BiRefNet
leaves on pale/grey creatures (ghosts, husks).
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image

KINDS = ("goblin", "skeleton", "ghost", "ratling", "husk", "imp")
PAD = 8
CELL = 512
COLS = 3
ROWS = 2


def flood_clear_studio_bg(im: Image.Image) -> Image.Image:
    """Remove edge-connected near-grey / low-alpha residual from studio plates."""
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size

    # Median edge color ≈ studio grey #6a6a6a
    edge_samples: list[tuple[int, int, int]] = []
    for x in range(0, w, max(1, w // 64)):
        edge_samples.append(px[x, 0][:3])
        edge_samples.append(px[x, h - 1][:3])
    for y in range(0, h, max(1, h // 64)):
        edge_samples.append(px[0, y][:3])
        edge_samples.append(px[w - 1, y][:3])
    edge_samples.sort()
    mid = edge_samples[len(edge_samples) // 2]
    br, bg, bb = mid

    def near_bg(r: int, g: int, b: int, a: int) -> bool:
        dist = abs(r - br) + abs(g - bg) + abs(b - bb)
        if a < 40:
            return True
        if dist <= 42 and a < 220:
            return True
        if dist <= 28:
            return True
        # flat neutral grey band even if alpha is mid
        if abs(r - g) < 14 and abs(g - b) < 14 and 70 <= r <= 145 and a < 250 and dist <= 55:
            return True
        return False

    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def try_push(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            return
        r, g, b, a = px[x, y]
        if not near_bg(r, g, b, a):
            return
        visited[y][x] = True
        q.append((x, y))

    for x in range(w):
        try_push(x, 0)
        try_push(x, h - 1)
    for y in range(h):
        try_push(0, y)
        try_push(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        try_push(x + 1, y)
        try_push(x - 1, y)
        try_push(x, y + 1)
        try_push(x, y - 1)

    # Harden remaining soft alpha so billboard alphaTest stays solid.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if a < 96:
                px[x, y] = (0, 0, 0, 0)
            elif a < 220:
                px[x, y] = (r, g, b, 255)

    return rgba


def tight_crop(im: Image.Image, pad: int = PAD) -> Image.Image:
    rgba = flood_clear_studio_bg(im)
    alpha = rgba.split()[3]
    bbox = alpha.getbbox()
    if not bbox:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(rgba.width, r + pad)
    b = min(rgba.height, b + pad)
    return rgba.crop((l, t, r, b))


def fit_in_cell(sprite: Image.Image, cell: int = CELL) -> Image.Image:
    sw, sh = sprite.size
    scale = min((cell - 16) / sw, (cell - 16) / sh)
    nw = max(1, int(sw * scale))
    nh = max(1, int(sh * scale))
    resized = sprite.resize((nw, nh), Image.Resampling.LANCZOS)
    cell_im = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    x = (cell - nw) // 2
    y = cell - nh - 8
    cell_im.paste(resized, (x, y), resized)
    return cell_im


def content_frame(cell_im: Image.Image, origin_x: int, origin_y: int) -> dict[str, int]:
    alpha = cell_im.split()[3]
    bbox = alpha.getbbox()
    if not bbox:
        return {"x": origin_x, "y": origin_y, "w": cell_im.width, "h": cell_im.height}
    l, t, r, b = bbox
    return {"x": origin_x + l, "y": origin_y + t, "w": r - l, "h": b - t}


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    keyed = root / "public" / "assets" / "sprites" / "enemies-v3" / "keyed"
    out_atlas = root / "public" / "assets" / "sprites" / "iron-ash-enemies-v3.png"
    out_meta = root / "public" / "assets" / "sprites" / "enemies-v3" / "frames.json"
    crop_dir = root / "public" / "assets" / "sprites" / "enemies-v3" / "cropped"
    crop_dir.mkdir(parents=True, exist_ok=True)

    atlas_w = COLS * CELL
    atlas_h = ROWS * CELL
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    frames: dict[str, dict] = {}

    for index, kind in enumerate(KINDS):
        src = keyed / f"{kind}.png"
        if not src.exists():
            print(f"missing {src}", file=sys.stderr)
            return 1
        cropped = tight_crop(Image.open(src))
        cropped.save(crop_dir / f"{kind}.png")
        cell = fit_in_cell(cropped)
        col = index % COLS
        row = index // COLS
        ox = col * CELL
        oy = row * CELL
        atlas.paste(cell, (ox, oy), cell)
        frame = content_frame(cell, ox, oy)
        frames[kind] = {
            "src": "/assets/sprites/iron-ash-enemies-v3.png",
            "size": [atlas_w, atlas_h],
            **frame,
        }
        print(f"{kind}: crop {cropped.size} -> frame {frame}")

    atlas.save(out_atlas)
    out_meta.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out_atlas} ({atlas_w}x{atlas_h})")
    print(f"wrote {out_meta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
