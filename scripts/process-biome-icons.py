"""Pack biome icons into a black-bg spritesheet and key transparent runtime icons.

Default keying: flood-clear near-black from the image edges (best for solid #000 plates).
Optional --birefnet: run ZhengPeng7/BiRefNet when torch/transformers are available.

  python scripts/process-biome-icons.py
  .venv-pbr\\Scripts\\python.exe scripts/process-biome-icons.py --birefnet
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets-source" / "imagegen" / "biome-icons-v1"
OUT = ROOT / "public" / "assets" / "ui" / "biome-icons"
CELL = 128
COLS = 4
ROWS = 3

# Order matches BiomeIdentity roster.
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

HOVER = {
    "ancient": "#8a96b0",
    "molten": "#e07030",
    "frost": "#7ec8e8",
    "grim": "#8a7088",
    "verdant": "#4a9a58",
    "ash": "#9a9088",
    "iron": "#8a94a0",
    "obsidian": "#7a4aaa",
    "sunken": "#2f9aaa",
    "fungal": "#9a6aba",
    "backrooms": "#c4b44a",
}


def square_crop(image: Image.Image) -> Image.Image:
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def is_near_black(r: int, g: int, b: int, limit: int = 18) -> bool:
    return max(r, g, b) <= limit


def flood_key_black(image: Image.Image, limit: int = 18) -> Image.Image:
    """Clear near-black pixels connected to the plate edges."""
    rgba = square_crop(image.convert("RGBA")).resize((CELL, CELL), Image.Resampling.LANCZOS)
    pixels = rgba.load()
    assert pixels is not None
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, _a = pixels[x, y]
            pixels[x, y] = (r, g, b, 255)

    seeds: list[tuple[int, int]] = []
    for x in range(width):
        seeds.append((x, 0))
        seeds.append((x, height - 1))
    for y in range(height):
        seeds.append((0, y))
        seeds.append((width - 1, y))

    seen: set[tuple[int, int]] = set()
    stack = list(seeds)
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or x < 0 or y < 0 or x >= width or y >= height:
            continue
        seen.add((x, y))
        r, g, b, a = pixels[x, y]
        if a == 0 or not is_near_black(r, g, b, limit):
            continue
        pixels[x, y] = (0, 0, 0, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    # Soften one-pixel fringe next to cleared holes.
    clear: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0 or max(r, g, b) > 36:
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] == 0:
                    clear.append((x, y))
                    break
    for x, y in clear:
        pixels[x, y] = (0, 0, 0, 0)
    return rgba


def birefnet_key(image: Image.Image, device: str | None = None) -> Image.Image:
    import torch
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation

    device_name = device or ("cuda" if torch.cuda.is_available() else "cpu")
    model = AutoModelForImageSegmentation.from_pretrained(
        "ZhengPeng7/BiRefNet",
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    model = model.to(device=device_name, dtype=torch.float32)
    model.eval()
    transform = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    rgb = square_crop(image.convert("RGB")).resize((CELL, CELL), Image.Resampling.LANCZOS)
    tensor = transform(rgb).unsqueeze(0).to(device=device_name, dtype=torch.float32)
    with torch.no_grad():
        preds = model(tensor)[-1].sigmoid().float().cpu()
    mask = transforms.ToPILImage()(preds[0].squeeze()).resize((CELL, CELL), Image.BILINEAR)
    mask = mask.point(lambda v: 0 if v < 96 else (255 if v > 140 else int((v - 96) * (255 / 44))))
    rgba = rgb.convert("RGBA")
    rgba.putalpha(mask.convert("L"))
    # Also clear remaining pure black plate leftovers.
    return flood_key_black(rgba, limit=12)


def pack_black_sheet(cells: list[Image.Image]) -> Image.Image:
    sheet = Image.new("RGB", (COLS * CELL, ROWS * CELL), (0, 0, 0))
    for index, cell in enumerate(cells):
        if index >= COLS * ROWS:
            break
        col = index % COLS
        row = index // COLS
        rgb = cell.convert("RGB")
        sheet.paste(rgb, (col * CELL, row * CELL))
    return sheet


def main() -> None:
    parser = argparse.ArgumentParser(description="Process biome picker icons")
    parser.add_argument("--birefnet", action="store_true", help="Use BiRefNet when available")
    parser.add_argument("--device", default=None)
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    keyed_cells: list[Image.Image] = []
    black_cells: list[Image.Image] = []
    entries = []

    for index, biome_id in enumerate(BIOMES):
        source = SOURCE / f"{biome_id}-src.jpg"
        if not source.exists():
            raise FileNotFoundError(source)
        with Image.open(source) as image:
            black = square_crop(image.convert("RGB")).resize((CELL, CELL), Image.Resampling.LANCZOS)
            black_cells.append(black)
            if args.birefnet:
                try:
                    keyed = birefnet_key(image, args.device)
                    method = "birefnet+black-flood"
                except Exception as err:  # noqa: BLE001 - fall back for offline envs
                    print(f"BiRefNet failed for {biome_id}: {err}; using black flood key")
                    keyed = flood_key_black(image)
                    method = "black-flood-fallback"
            else:
                keyed = flood_key_black(image)
                method = "black-flood"
            target = OUT / f"{biome_id}.png"
            keyed.save(target, "PNG", optimize=True)
            keyed_cells.append(keyed)
            entries.append(
                {
                    "id": biome_id,
                    "src": f"/assets/ui/biome-icons/{biome_id}.png",
                    "hover": HOVER[biome_id],
                    "cell": index,
                    "method": method,
                }
            )
            print(f"{biome_id}: {target.stat().st_size} bytes ({method})")

    sheet_black = pack_black_sheet(black_cells)
    sheet_black_path = OUT / "biome-icons-sheet-black.png"
    sheet_black.save(sheet_black_path, "PNG", optimize=True)
    # Transparent sheet for preview
    sheet_rgba = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    for index, cell in enumerate(keyed_cells):
        col = index % COLS
        row = index // COLS
        sheet_rgba.paste(cell, (col * CELL, row * CELL), cell if cell.mode == "RGBA" else None)
    sheet_rgba_path = OUT / "biome-icons-sheet.png"
    sheet_rgba.save(sheet_rgba_path, "PNG", optimize=True)

    manifest = {
        "version": 1,
        "cell": CELL,
        "cols": COLS,
        "rows": ROWS,
        "order": BIOMES,
        "sheetBlack": "/assets/ui/biome-icons/biome-icons-sheet-black.png",
        "sheet": "/assets/ui/biome-icons/biome-icons-sheet.png",
        "entries": entries,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote sheet {sheet_black_path.name} + {len(entries)} icons")


if __name__ == "__main__":
    main()
