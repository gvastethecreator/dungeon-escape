#!/usr/bin/env python3
"""Remove backgrounds from biome enemy atlas plates with BiRefNet.

Processes each 320x320 cell so the model sees a single subject, then
reassembles the 4x11 atlas at 1280x3520 with hardened alpha for billboards.

Requires the dungeon PBR venv (torch + transformers + CUDA preferred):
  D:\\DEV\\blackflag.club\\apps\\dungeon\\.venv-pbr\\Scripts\\python.exe \\
    scripts/birefnet-biome-enemy-sheets.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "public" / "assets" / "sprites" / "enemies-v5" / "_src-biome"
DEFAULT_OUT = ROOT / "public" / "assets" / "sprites" / "enemies-v5" / "biomes"
TARGET_W = 1280
TARGET_H = 3520
COLS = 4
ROWS = 11
CELL = 320

MOODS = (
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


def is_magenta_key(r: int, g: int, b: int) -> bool:
    if r >= 170 and b >= 150 and g <= 150 and (r + b) > 2.1 * (g + 1):
        return True
    if r >= 140 and b >= 160 and g <= 130 and abs(r - b) < 90 and (r + b) > 2.0 * (g + 1):
        return True
    if min(r, b) >= 150 and g <= 110:
        return True
    return False


def harden_alpha(rgba: Image.Image, thr_low: int = 96, thr_high: int = 140) -> Image.Image:
    """Solid body for MeshStandardMaterial alphaTest billboards."""
    r, g, b, a = rgba.split()
    a = a.point(
        lambda v: 0 if v < thr_low else (255 if v > thr_high else int((v - thr_low) * (255 / (thr_high - thr_low))))
    )
    out = Image.merge("RGBA", (r, g, b, a))
    return out


def residual_magenta_clear(rgba: Image.Image) -> Image.Image:
    """Kill leftover magenta plate pixels that BiRefNet sometimes keeps as low-confidence edges."""
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if is_magenta_key(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                continue
            mag = (r + b) / 2 - g
            if mag > 85 and g < 150 and min(r, b) > 100:
                # despill soft fringe
                cap = max(g, min(r, b) // 2)
                r2 = min(r, cap + 40)
                b2 = min(b, cap + 40)
                alpha = max(0, min(255, int(a - (mag - 85) * 2.0)))
                if alpha < 40:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (r2, g, b2, alpha)
    return rgba


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
    model = model.to(device=device, dtype=torch.float32)
    model.eval()
    return model


def biref_mask(model, image_rgb: Image.Image, device: str) -> Image.Image:
    import torch
    from torchvision import transforms

    original_size = image_rgb.size
    transform = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    tensor = transform(image_rgb).unsqueeze(0).to(device=device, dtype=torch.float32)
    with torch.no_grad():
        preds = model(tensor)[-1].sigmoid().float().cpu()
    mask = preds[0].squeeze()
    mask_pil = transforms.ToPILImage()(mask).resize(original_size, Image.BILINEAR)
    return mask_pil.convert("L")


def process_sheet(
    model,
    src: Path,
    out: Path,
    device: str,
    *,
    only_mood: str | None = None,
) -> None:
    mood = src.stem.replace("-src", "").replace("_src", "")
    if only_mood and mood != only_mood:
        return
    print(f"=== {mood} ← {src.name}")
    plate = Image.open(src).convert("RGB").resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
    atlas = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))

    cell_i = 0
    for row in range(ROWS):
        for col in range(COLS):
            x0 = col * CELL
            y0 = row * CELL
            cell = plate.crop((x0, y0, x0 + CELL, y0 + CELL))
            mask = biref_mask(model, cell, device)
            rgba = cell.convert("RGBA")
            rgba.putalpha(mask)
            rgba = residual_magenta_clear(rgba)
            rgba = harden_alpha(rgba)
            atlas.paste(rgba, (x0, y0), rgba)
            cell_i += 1
        print(f"  row {row + 1}/{ROWS} done")

    out.parent.mkdir(parents=True, exist_ok=True)
    dest = out / f"{mood}-enemies.png"
    atlas.save(dest, "PNG", optimize=True)
    print(f"wrote {dest} ({dest.stat().st_size} bytes)")


def main() -> int:
    parser = argparse.ArgumentParser(description="BiRefNet biome enemy atlas keying")
    parser.add_argument("--src-dir", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--device", default=None, help="cuda / cpu (default: auto)")
    parser.add_argument("--mood", default=None, help="process a single mood id")
    parser.add_argument(
        "--inputs",
        nargs="*",
        type=Path,
        default=None,
        help="explicit *-src.jpg paths (default: all mood plates in src-dir)",
    )
    args = parser.parse_args()

    try:
        import torch
    except ImportError as err:
        print(f"Missing dependency: {err}", file=sys.stderr)
        print("Use blackflag dungeon .venv-pbr python", file=sys.stderr)
        return 1

    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(device)

    if args.inputs:
        inputs = list(args.inputs)
    else:
        inputs = []
        for mood in MOODS:
            candidate = args.src_dir / f"{mood}-src.jpg"
            if candidate.exists():
                inputs.append(candidate)
            else:
                print(f"skip missing {candidate}", file=sys.stderr)

    if not inputs:
        print("no input plates found", file=sys.stderr)
        return 1

    for src in inputs:
        process_sheet(model, src, args.out_dir, device, only_mood=args.mood)

    print(f"done {len(inputs)} plate(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
