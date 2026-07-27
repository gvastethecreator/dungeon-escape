#!/usr/bin/env python3
"""Remove neutral plates from the generated biome prop sheets with BiRefNet.

Each source sheet is a 3x2 grid of 512px cells. BiRefNet runs on the complete
sheet so the six props keep enough visual context for a stable foreground
mask. The edge-connected neutral plate is cleared after inference as a second
guard against gray halos and floor shadows leaking into the billboard atlas.

Run with the local PBR environment:

  D:\\DEV\\blackflag.club\\apps\\dungeon\\.venv-pbr\\Scripts\\python.exe \\
    scripts/birefnet-biome-prop-sheets.py
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path
from statistics import median
from typing import Any

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "assets-source" / "imagegen" / "biome-props"
DEFAULT_OUT = ROOT / "public" / "assets" / "sprites" / "biome-props"
MODEL_ID = "ZhengPeng7/BiRefNet"
COLS = 3
ROWS = 2
CELL = 512
WIDTH = COLS * CELL
HEIGHT = ROWS * CELL
ATLAS_BORDER = 4
BIOMES = (
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


def median_rgb(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    stride = max(1, min(width, height) // 96)
    samples: list[tuple[int, int, int]] = []
    for x in range(0, width, stride):
        samples.append(rgb.getpixel((x, 0)))
        samples.append(rgb.getpixel((x, height - 1)))
    for y in range(0, height, stride):
        samples.append(rgb.getpixel((0, y)))
        samples.append(rgb.getpixel((width - 1, y)))
    return tuple(int(median([sample[index] for sample in samples])) for index in range(3))


def edge_background_mask(
    image: Image.Image, *, tolerance: int = 54
) -> tuple[Image.Image, tuple[int, int, int]]:
    """Return an edge-connected mask for the flat neutral source plate."""

    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    background = median_rgb(rgb)
    br, bg, bb = background
    visited = bytearray(width * height)
    mask = Image.new("L", (width, height), 0)
    mask_pixels = mask.load()
    queue: deque[tuple[int, int]] = deque()

    def candidate(x: int, y: int) -> bool:
        r, g, b = pixels[x, y]
        distance = abs(r - br) + abs(g - bg) + abs(b - bb)
        return distance <= tolerance

    def push(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= width or y >= height:
            return
        index = y * width + x
        if visited[index] or not candidate(x, y):
            return
        visited[index] = 1
        queue.append((x, y))

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)

    while queue:
        x, y = queue.popleft()
        mask_pixels[x, y] = 255
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)

    return mask, background


def make_model_plate(image: Image.Image, background_mask: Image.Image, background: tuple[int, int, int]) -> Image.Image:
    """Keep the model input stable even when the source plate has slight drift."""

    plate = Image.new("RGB", image.size, background)
    foreground = ImageChops.invert(background_mask)
    plate.paste(image.convert("RGB"), (0, 0), foreground)
    return plate


def load_model(device: str, model_id: str):
    try:
        import torch
        from transformers import AutoModelForImageSegmentation
    except ImportError as err:
        print(f"Missing dependency: {err}", file=sys.stderr)
        print("Use D:\\DEV\\blackflag.club\\apps\\dungeon\\.venv-pbr\\Scripts\\python.exe", file=sys.stderr)
        raise

    print(f"device={device}")
    print(f"loading {model_id} …")
    model = AutoModelForImageSegmentation.from_pretrained(
        model_id,
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    return model.to(device=device, dtype=torch.float32).eval()


def birefnet_alpha(model: Any, image: Image.Image, device: str) -> Image.Image:
    import torch
    from torchvision import transforms

    transform = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    tensor = transform(image.convert("RGB")).unsqueeze(0).to(device=device, dtype=torch.float32)
    with torch.no_grad():
        prediction = model(tensor)[-1].sigmoid().float().cpu()
    alpha = transforms.ToPILImage()(prediction[0].squeeze())
    return alpha.resize(image.size, Image.Resampling.BILINEAR).convert("L")


def harden_alpha(alpha: Image.Image, low: int, high: int) -> Image.Image:
    if high <= low:
        raise ValueError("--alpha-high must be greater than --alpha-low")
    span = high - low
    return alpha.convert("L").point(
        lambda value: 0 if value < low else (255 if value > high else int((value - low) * (255 / span)))
    )


def frame_metrics(frame: Image.Image) -> dict[str, Any]:
    alpha = frame.getchannel("A")
    histogram = alpha.histogram()
    total = frame.width * frame.height
    bbox = alpha.getbbox()
    edge_nonzero = 0
    for x in range(frame.width):
        edge_nonzero += int(alpha.getpixel((x, 0)) > 0)
        edge_nonzero += int(alpha.getpixel((x, frame.height - 1)) > 0)
    for y in range(1, frame.height - 1):
        edge_nonzero += int(alpha.getpixel((0, y)) > 0)
        edge_nonzero += int(alpha.getpixel((frame.width - 1, y)) > 0)
    return {
        "bbox": list(bbox or ()),
        "alpha_zero_ratio": round(histogram[0] / total, 6),
        "alpha_partial_ratio": round(sum(histogram[1:255]) / total, 6),
        "alpha_opaque_ratio": round(histogram[255] / total, 6),
        "edge_nonzero": edge_nonzero,
    }


def process_sheet(
    model: Any,
    source: Path,
    out_dir: Path,
    device: str,
    *,
    low: int,
    high: int,
) -> dict[str, Any]:
    biome = source.stem.removesuffix("-sprites-src")
    plate = Image.open(source).convert("RGB")
    if plate.size != (WIDTH, HEIGHT):
        plate = plate.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    background_mask, background = edge_background_mask(plate)
    model_plate = make_model_plate(plate, background_mask, background)
    sheet_alpha = harden_alpha(birefnet_alpha(model, model_plate, device), low, high)
    sheet_alpha = ImageChops.subtract(sheet_alpha, background_mask)
    sheet_rgba = plate.convert("RGBA")
    sheet_rgba.putalpha(sheet_alpha)
    sheet_rgba.paste((0, 0, 0, 0), (0, 0, WIDTH, HEIGHT), background_mask)
    atlas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    frames: list[dict[str, Any]] = []
    print(f"=== {biome} <- {source.name}")

    for row in range(ROWS):
        for column in range(COLS):
            x0, y0 = column * CELL, row * CELL
            source_cell = sheet_rgba.crop((x0, y0, x0 + CELL, y0 + CELL))
            rgba = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            rgba.alpha_composite(
                source_cell.crop((ATLAS_BORDER, ATLAS_BORDER, CELL - ATLAS_BORDER, CELL - ATLAS_BORDER)),
                (ATLAS_BORDER, ATLAS_BORDER),
            )
            atlas.alpha_composite(rgba, (x0, y0))
            frames.append(
                {
                    "index": row * COLS + column,
                    "row": row,
                    "column": column,
                    "x": x0,
                    "y": y0,
                    "w": CELL,
                    "h": CELL,
                    "background_rgb": list(background),
                    **frame_metrics(rgba),
                }
            )
        print(f"  row {row + 1}/{ROWS} done")

    out_dir.mkdir(parents=True, exist_ok=True)
    destination = out_dir / f"{biome}-props.png"
    atlas.save(destination, "PNG", optimize=True)
    print(f"wrote {destination} ({destination.stat().st_size} bytes)")
    return {
        "biome": biome,
        "source": source.relative_to(ROOT).as_posix(),
        "output": destination.relative_to(ROOT).as_posix(),
        "size": [WIDTH, HEIGHT],
        "grid": {"columns": COLS, "rows": ROWS, "cell": CELL, "border": ATLAS_BORDER},
        "model": MODEL_ID,
        "alpha": {"low": low, "high": high},
        "frames": frames,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="BiRefNet-key biome prop spritesheets")
    parser.add_argument("--src-dir", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--device", default=None, help="cuda / cpu (default: auto)")
    parser.add_argument("--mood", default=None, choices=BIOMES, help="process one biome")
    parser.add_argument("--inputs", nargs="*", type=Path, default=None)
    parser.add_argument("--alpha-low", type=int, default=60)
    parser.add_argument("--alpha-high", type=int, default=150)
    args = parser.parse_args()

    try:
        import torch
    except ImportError as err:
        print(f"Missing dependency: {err}", file=sys.stderr)
        return 1

    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(device, MODEL_ID)
    if args.inputs:
        inputs = list(args.inputs)
    else:
        moods = [args.mood] if args.mood else list(BIOMES)
        inputs = [args.src_dir / f"{mood}-sprites-src.png" for mood in moods]

    missing = [path for path in inputs if not path.is_file()]
    if missing:
        for path in missing:
            print(f"missing input: {path}", file=sys.stderr)
        return 1

    reports = [
        process_sheet(
            model,
            source,
            args.out_dir,
            device,
            low=args.alpha_low,
            high=args.alpha_high,
        )
        for source in inputs
    ]
    manifest = args.out_dir / "manifest.json"
    manifest.write_text(json.dumps({"model": MODEL_ID, "sheets": reports}, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {manifest} ({len(reports)} sheet(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
