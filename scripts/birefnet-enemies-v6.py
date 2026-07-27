#!/usr/bin/env python3
"""BiRefNet-key enemy v6 biome plates (black-bg Imagine edits).

Uses edge flood of near-black → mid-grey plate so dark silhouettes survive,
runs BiRefNet per 320 cell, hardens alpha, writes biomes/*.png.

  D:\\DEV\\blackflag.club\\apps\\dungeon\\.venv-pbr\\Scripts\\python.exe \\
    scripts/birefnet-enemies-v6.py
"""

from __future__ import annotations

import argparse
import shutil
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
V6 = ROOT / "public" / "assets" / "sprites" / "enemies-v6"
RAW = V6 / "_src" / "biome-raw"
OUT = V6 / "biomes"
CELL = 320
COLS = 4
ROWS = 11
W, H = COLS * CELL, ROWS * CELL

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


def flood_near_black(im: Image.Image, fill: tuple[int, int, int], thr: int = 22) -> Image.Image:
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def dark(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        return r <= thr and g <= thr and b <= thr

    def push(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not visited[y][x] and dark(x, y):
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


def harden(rgba: Image.Image) -> Image.Image:
    r, g, b, a = rgba.split()
    a = a.point(lambda v: 0 if v < 88 else (255 if v > 135 else int((v - 88) * (255 / 47))))
    return Image.merge("RGBA", (r, g, b, a))


def load_model(device: str):
    import torch
    from transformers import AutoModelForImageSegmentation

    print(f"device={device}")
    print("loading ZhengPeng7/BiRefNet …")
    model = AutoModelForImageSegmentation.from_pretrained(
        "ZhengPeng7/BiRefNet",
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    return model.to(device=device, dtype=torch.float32).eval()


def process_sheet(model, device: str, src: Path, dest: Path) -> None:
    import torch
    from torchvision import transforms

    plate = Image.open(src).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
    # Work RGB for paste; plate grey for model
    work = plate.copy()
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    transform = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    print(f"=== {src.name}")
    for row in range(ROWS):
        for col in range(COLS):
            x0, y0 = col * CELL, row * CELL
            cell = work.crop((x0, y0, x0 + CELL, y0 + CELL))
            plate_cell = flood_near_black(cell, (88, 88, 90), thr=24)
            tensor = transform(plate_cell).unsqueeze(0).to(device=device, dtype=torch.float32)
            with torch.no_grad():
                preds = model(tensor)[-1].sigmoid().float().cpu()
            mask = transforms.ToPILImage()(preds[0].squeeze()).resize((CELL, CELL), Image.BILINEAR)
            rgba = cell.convert("RGBA")
            rgba.putalpha(mask.convert("L"))
            rgba = harden(rgba)
            # remove residual grey plate
            px = rgba.load()
            for y in range(CELL):
                for x in range(CELL):
                    r, g, b, a = px[x, y]
                    if a == 0:
                        continue
                    if abs(r - 88) < 16 and abs(g - 88) < 16 and abs(b - 90) < 16:
                        px[x, y] = (0, 0, 0, 0)
            atlas.paste(rgba, (x0, y0), rgba)
        print(f"  row {row + 1}/{ROWS}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(dest, "PNG", optimize=True)
    print(f"wrote {dest} ({dest.stat().st_size}B)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mood", default=None)
    parser.add_argument("--device", default=None)
    args = parser.parse_args()

    import torch

    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(device)

    moods = [args.mood] if args.mood else MOODS
    for mood in moods:
        if mood == "ash":
            # keep original HQ alpha atlas as ash
            src = V6 / "iron-ash-enemies-v6.png"
            if src.exists():
                OUT.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, OUT / "ash-enemies.png")
                print(f"ash ← original HQ {src}")
            continue
        raw = RAW / f"{mood}.jpg"
        if not raw.exists():
            print(f"skip missing {raw}")
            continue
        process_sheet(model, device, raw, OUT / f"{mood}-enemies.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
