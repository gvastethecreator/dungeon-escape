#!/usr/bin/env python3
"""Turn square wall-decor icons into floating decals (soft/irregular alpha, no sticker plate).

- Key edge-connected plate greys (and optional pure black letterbox)
- Build subject alpha, then feather by distance from silhouette edge
- Add slight irregular noise so the falloff is not a perfect circle or square
- Center subject with padding so negative space is transparent

Usage:
  python scripts/decalize-wall-icon.py --mood ash
  python scripts/decalize-wall-icon.py --in path.png --out path.png
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "textures" / "_src-decor-v2"
CELL = 256


def near_plate(r: int, g: int, b: int) -> bool:
    """Flat neutral plate / AI letterbox greys (wide band)."""
    if abs(r - g) > 22 or abs(g - b) > 22:
        return False
    # includes #3C3C3E and common mid greys that form sticker cards
    return 28 <= r <= 140


def flood_key(rgba: Image.Image) -> Image.Image:
    """Transparentize edge-connected plate greys (and near-black letterbox corners)."""
    im = rgba.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def is_bg(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        if a == 0:
            return True
        # plate greys only — never flood pure black interiors (grate voids, holes)
        if near_plate(r, g, b):
            return True
        return False

    def push(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not visited[y][x] and is_bg(x, y):
            visited[y][x] = True
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)
    return im


def feather_decal(
    rgba: Image.Image,
    *,
    soft: float = 18.0,
    padding: float = 0.08,
    irregular: float = 0.35,
) -> Image.Image:
    """Soft irregular alpha falloff from subject silhouette (not square crop)."""
    im = flood_key(rgba).convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]

    # binary subject
    mask = (alpha > 20).astype(np.uint8)

    # if almost empty, return as-is
    if mask.sum() < 64:
        return im

    # distance outside subject (for soft outer edge)
    # invert mask: 1 = empty
    inv = 1 - mask
    # distance transform on empty: how far from subject
    # PIL doesn't have EDT; implement simple multi-pass approximate or use scipy if available
    try:
        from scipy import ndimage  # type: ignore

        dist_out = ndimage.distance_transform_edt(inv)
        dist_in = ndimage.distance_transform_edt(mask)
    except Exception:
        # fallback: blur mask as soft edge
        m_img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
        soft_m = m_img.filter(ImageFilter.GaussianBlur(radius=soft * 0.55))
        sm = np.asarray(soft_m).astype(np.float32) / 255.0
        # irregular
        rng = np.random.default_rng(abs(hash(im.tobytes())) % (2**32))
        noise = rng.normal(0, irregular * 0.08, size=sm.shape).astype(np.float32)
        sm = np.clip(sm + noise, 0, 1)
        arr[:, :, 3] = sm * 255.0
        out = Image.fromarray(arr.astype(np.uint8), mode="RGBA")
        return _pad_center(out, padding)

    # alpha: full inside, falloff outside over `soft` pixels
    a = np.ones_like(dist_out, dtype=np.float32)
    a[mask == 0] = np.clip(1.0 - dist_out[mask == 0] / max(soft, 1e-3), 0, 1)
    # slight outer-erode of solid so edges never hard-1 against wall
    a[mask == 1] = np.clip(0.88 + 0.12 * np.clip(dist_in[mask == 1] / 6.0, 0, 1), 0, 1)

    # irregular edge: modulate falloff band with low-freq noise
    rng = np.random.default_rng(int(mask.sum()) % (2**32))
    noise = rng.normal(0, 1, size=(h // 8 + 1, w // 8 + 1)).astype(np.float32)
    noise_img = Image.fromarray(
        ((noise - noise.min()) / (float(np.ptp(noise)) + 1e-6) * 255).astype(np.uint8)
    )
    noise_img = noise_img.resize((w, h), Image.Resampling.BILINEAR)
    n = np.asarray(noise_img).astype(np.float32) / 255.0
    n = (n - 0.5) * irregular
    edge_band = (a > 0.05) & (a < 0.95)
    a[edge_band] = np.clip(a[edge_band] + n[edge_band] * 0.45, 0, 1)

    # slight gaussian on alpha for smoother blend into wall
    a_img = Image.fromarray((a * 255).astype(np.uint8), mode="L")
    a_img = a_img.filter(ImageFilter.GaussianBlur(radius=1.2))
    a = np.asarray(a_img).astype(np.float32) / 255.0

    # kill residual square sticker corners: only flat plate greys near border
    border = max(8, int(min(h, w) * 0.07))
    yy, xx = np.mgrid[0:h, 0:w]
    border_mask = (xx < border) | (xx >= w - border) | (yy < border) | (yy >= h - border)
    rgb = arr[:, :, :3]
    chroma = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    lum = np.mean(rgb, axis=2)
    flat_plate = (chroma < 24) & (lum > 35) & (lum < 145)
    a[border_mask & flat_plate] = 0.0
    # mild border fade only on the outer rim (does not crush whole subject)
    edge_dist = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(
        np.float32
    )
    rim = edge_dist < border
    fade = np.clip(edge_dist / float(border), 0, 1)
    a[rim] *= 0.55 + 0.45 * fade[rim]

    arr[:, :, 3] = np.clip(a, 0, 1) * 255.0
    # keep subject readable: slight lift where semi-opaque
    vis = arr[:, :, 3] > 8
    arr[vis, 0:3] = np.clip(arr[vis, 0:3] * 1.12 + 6, 0, 255)
    m = arr[:, :, 3] < 2
    arr[m, 0:3] = 0
    out = Image.fromarray(arr.astype(np.uint8), mode="RGBA")
    return _pad_center(out, padding)


def _pad_center(im: Image.Image, padding: float) -> Image.Image:
    """Shrink subject slightly so transparent negative space surrounds it."""
    if padding <= 0:
        return im.resize((CELL, CELL), Image.Resampling.NEAREST)
    w, h = im.size
    # bbox of non-transparent
    a = im.split()[-1]
    bbox = a.getbbox()
    if not bbox:
        canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        return canvas
    subject = im.crop(bbox)
    sw, sh = subject.size
    max_side = max(sw, sh)
    target = int(CELL * (1.0 - 2 * padding))
    scale = target / max(max_side, 1)
    nw = max(1, int(sw * scale))
    nh = max(1, int(sh * scale))
    subject = subject.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    canvas.paste(subject, ((CELL - nw) // 2, (CELL - nh) // 2), subject)
    return canvas


def process_file(src: Path, dst: Path, **kwargs) -> None:
    im = Image.open(src).convert("RGBA")
    # ensure square crop first
    w, h = im.size
    side = min(w, h)
    im = im.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
    im = im.resize((CELL, CELL), Image.Resampling.LANCZOS)
    out = feather_decal(im, **kwargs)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst)
    print(f"decal {src.name} -> {dst.name}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mood", type=str, default=None)
    ap.add_argument("--in", dest="inp", type=str, default=None)
    ap.add_argument("--out", dest="outp", type=str, default=None)
    ap.add_argument("--soft", type=float, default=18.0, help="feather radius in px")
    ap.add_argument("--padding", type=float, default=0.08)
    ap.add_argument("--irregular", type=float, default=0.35)
    ap.add_argument("--inplace", action="store_true")
    args = ap.parse_args()
    kw = dict(soft=args.soft, padding=args.padding, irregular=args.irregular)

    if args.inp:
        out = Path(args.outp) if args.outp else Path(args.inp)
        process_file(Path(args.inp), out, **kw)
        return
    if not args.mood:
        raise SystemExit("pass --mood or --in")
    d = SRC / args.mood
    for p in sorted(d.glob("*.png")):
        dst = p if args.inplace else (d / "decal" / p.name)
        process_file(p, dst, **kw)


if __name__ == "__main__":
    main()
