#!/usr/bin/env python3
"""Build grimdark pixel-art enemy atlases (v6) from Imagine strips + BiRefNet.

1. Map Imagine outputs → creature strips
2. Force edge-black background, nearest-neighbor pixelate into 320 cells
3. Pack base atlas (ash-neutral grimdark)
4. Expect biome plates under _src/biome-raw/{mood}.jpg (full sheet)
5. BiRefNet cell keying on non-black plates OR flood-clear black for dark sprites

Prefer: black background plates; BiRefNet after converting edge-black to a
neutral grey plate so dark silhouettes survive.
"""

from __future__ import annotations

import argparse
import shutil
from collections import deque
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
V6 = ROOT / "public" / "assets" / "sprites" / "enemies-v6"
IMG_DIR = Path(
    r"C:\Users\cristian\.grok\sessions\D%3A%5CDEV%5Cdungeon-escape"
    r"\019fa1ad-88ce-7f53-9201-3c898cedeeeb\images"
)

# Visual map of Imagine session files → roster order rows
PIXEL_BASE_MAP = {
    15: "carrion",
    13: "goblin",
    14: "ghost",
    12: "ratling",
    22: "husk",
    19: "imp",
    18: "zombie-orc",
    16: "spider",
    20: "bone-slime",
    17: "white-eyed-shadow",
    21: "carrion-stalker",
}

ROSTER = [
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

MOODS = [
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

CELL = 320
COLS = 4
ROWS = 11
SHEET_W = COLS * CELL
SHEET_H = ROWS * CELL
PIXEL_SCALE = 4  # logical pixel size inside each 320 cell


def flood_near_black_to(
    im: Image.Image,
    fill: tuple[int, int, int],
    thr: int = 28,
) -> Image.Image:
    """Flood-fill edge-connected near-black into `fill` (keeps interior black body)."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def dark(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        return r <= thr and g <= thr and b <= thr

    def push(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            return
        if not dark(x, y):
            return
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
        px[x, y] = fill
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)
    return rgb


def pixelate_strip(im: Image.Image) -> Image.Image:
    """Resize strip to exact 1280x320 with chunky pixels."""
    im = im.convert("RGB").resize((SHEET_W, CELL), Image.Resampling.LANCZOS)
    # Downsample per cell then nearest up for crisp pixels
    logical_w = SHEET_W // PIXEL_SCALE
    logical_h = CELL // PIXEL_SCALE
    small = im.resize((logical_w, logical_h), Image.Resampling.BILINEAR)
    # Quantize palette for grimdark limited colors
    q = small.quantize(colors=32, method=Image.Quantize.MEDIANCUT).convert("RGB")
    chunky = q.resize((SHEET_W, CELL), Image.Resampling.NEAREST)
    # Force pure black background via edge flood
    return flood_near_black_to(chunky, (0, 0, 0), thr=22)


def fit_cells_from_strip(strip: Image.Image) -> Image.Image:
    """Ensure 4 equal cells, bottom-weighted content."""
    strip = strip.convert("RGB").resize((SHEET_W, CELL), Image.Resampling.LANCZOS)
    out = Image.new("RGB", (SHEET_W, CELL), (0, 0, 0))
    for col in range(COLS):
        cell = strip.crop((col * (strip.width // COLS), 0, (col + 1) * (strip.width // COLS), strip.height))
        cell = cell.resize((CELL, CELL), Image.Resampling.LANCZOS)
        cell = flood_near_black_to(cell, (0, 0, 0), thr=24)
        # pixelate cell
        logical = CELL // PIXEL_SCALE
        small = cell.resize((logical, logical), Image.Resampling.BILINEAR)
        q = small.quantize(colors=28, method=Image.Quantize.MEDIANCUT).convert("RGB")
        cell = q.resize((CELL, CELL), Image.Resampling.NEAREST)
        cell = flood_near_black_to(cell, (0, 0, 0), thr=18)
        out.paste(cell, (col * CELL, 0))
    return out


def collect_base_strips(out_dir: Path) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for num, kind in PIXEL_BASE_MAP.items():
        src = IMG_DIR / f"{num}.jpg"
        if not src.exists():
            raise SystemExit(f"missing Imagine strip {src}")
        strip = fit_cells_from_strip(Image.open(src))
        dst = out_dir / f"{kind}-pixel-strip.png"
        strip.save(dst)
        paths[kind] = dst
        print(f"base strip {kind} ← {num}.jpg → {dst.name}")
    return paths


def pack_atlas(strips: dict[str, Path], out: Path) -> Image.Image:
    atlas = Image.new("RGB", (SHEET_W, SHEET_H), (0, 0, 0))
    for row, kind in enumerate(ROSTER):
        strip = Image.open(strips[kind]).convert("RGB")
        if strip.size != (SHEET_W, CELL):
            strip = strip.resize((SHEET_W, CELL), Image.Resampling.NEAREST)
        atlas.paste(strip, (0, row * CELL))
    out.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(out)
    print(f"packed {out} {atlas.size}")
    return atlas


def plate_for_biref(rgb: Image.Image) -> Image.Image:
    """Replace edge black with mid-grey so BiRefNet sees a plate; keep interior dark."""
    return flood_near_black_to(rgb, (90, 90, 92), thr=20)


def harden_alpha(rgba: Image.Image) -> Image.Image:
    r, g, b, a = rgba.split()
    a = a.point(lambda v: 0 if v < 90 else (255 if v > 140 else int((v - 90) * (255 / 50))))
    return Image.merge("RGBA", (r, g, b, a))


def biref_key_sheet(model, device: str, plate_rgb: Image.Image) -> Image.Image:
    import torch
    from torchvision import transforms

    atlas = Image.new("RGBA", (SHEET_W, SHEET_H), (0, 0, 0, 0))
    transform = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    for row in range(ROWS):
        for col in range(COLS):
            x0, y0 = col * CELL, row * CELL
            cell = plate_rgb.crop((x0, y0, x0 + CELL, y0 + CELL))
            # grey plate version for model
            plate = plate_for_biref(cell)
            tensor = transform(plate).unsqueeze(0).to(device=device, dtype=torch.float32)
            with torch.no_grad():
                preds = model(tensor)[-1].sigmoid().float().cpu()
            mask = transforms.ToPILImage()(preds[0].squeeze()).resize((CELL, CELL), Image.BILINEAR)
            rgba = cell.convert("RGBA")
            rgba.putalpha(mask.convert("L"))
            rgba = harden_alpha(rgba)
            # kill residual plate grey on edges
            px = rgba.load()
            for y in range(CELL):
                for x in range(CELL):
                    r, g, b, a = px[x, y]
                    if a == 0:
                        continue
                    if abs(r - 90) < 18 and abs(g - 90) < 18 and abs(b - 92) < 18:
                        px[x, y] = (0, 0, 0, 0)
            atlas.paste(rgba, (x0, y0), rgba)
        print(f"  biref row {row + 1}/{ROWS}")
    return atlas


def load_biref(device: str):
    import torch
    from transformers import AutoModelForImageSegmentation

    print(f"device={device}")
    print("loading ZhengPeng7/BiRefNet …")
    model = AutoModelForImageSegmentation.from_pretrained(
        "ZhengPeng7/BiRefNet",
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    model = model.to(device=device, dtype=torch.float32)
    model.eval()
    return model


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["base", "biref-base", "biref-biomes", "all"], default="base")
    parser.add_argument("--device", default=None)
    args = parser.parse_args()

    strips_dir = V6 / "_src" / "pixel-base-strips"
    base_rgb = V6 / "_src" / "base-pixel-black-atlas.png"
    base_out = V6 / "iron-ash-enemies-v6.png"
    biomes_out = V6 / "biomes"
    biome_raw = V6 / "_src" / "biome-raw"

    if args.stage in ("base", "all"):
        strips = collect_base_strips(strips_dir)
        pack_atlas(strips, base_rgb)
        # temporary RGB black atlas is also the game sheet until BiRefNet
        shutil.copy2(base_rgb, base_out.with_suffix(".rgb.png"))

    if args.stage in ("biref-base", "all"):
        import torch

        device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
        model = load_biref(device)
        plate = Image.open(base_rgb).convert("RGB")
        keyed = biref_key_sheet(model, device, plate)
        base_out.parent.mkdir(parents=True, exist_ok=True)
        keyed.save(base_out)
        print(f"wrote {base_out} {keyed.size} {base_out.stat().st_size}B")

        # also write as ash default biome if missing
        biomes_out.mkdir(parents=True, exist_ok=True)
        ash = biomes_out / "ash-enemies.png"
        if not ash.exists():
            shutil.copy2(base_out, ash)
            print(f"seeded {ash}")

    if args.stage in ("biref-biomes", "all"):
        import torch

        device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
        model = load_biref(device)
        biomes_out.mkdir(parents=True, exist_ok=True)
        for mood in MOODS:
            raw = biome_raw / f"{mood}.jpg"
            alt = biome_raw / f"{mood}.png"
            src = raw if raw.exists() else alt
            if not src.exists():
                print(f"skip missing biome plate {mood}")
                continue
            plate = Image.open(src).convert("RGB").resize((SHEET_W, SHEET_H), Image.Resampling.LANCZOS)
            # pixelate whole sheet lightly
            logical = (SHEET_W // PIXEL_SCALE, SHEET_H // PIXEL_SCALE)
            small = plate.resize(logical, Image.Resampling.BILINEAR)
            q = small.quantize(colors=40, method=Image.Quantize.MEDIANCUT).convert("RGB")
            plate = q.resize((SHEET_W, SHEET_H), Image.Resampling.NEAREST)
            plate = flood_near_black_to(plate, (0, 0, 0), thr=18)
            keyed = biref_key_sheet(model, device, plate)
            out = biomes_out / f"{mood}-enemies.png"
            keyed.save(out)
            print(f"wrote {out} {out.stat().st_size}B")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
