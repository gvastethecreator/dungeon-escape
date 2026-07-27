#!/usr/bin/env python3
"""Reprocess imported enemy strips and pack biome RGBA atlases.

The raw import stays immutable under enemies-v8/_src/strips-biome. A reviewed
assignment manifest maps each destination biome to the folder that holds the
right source strip. Background removal runs per 320 px cell, then every row is
registered against one shared union box before atlas composition.

The final path uses BiRefNet plus a conservative edge-connected background
veto. The veto removes large source-plate blobs that the model keeps while a
protected band retains dark sprite outlines next to colored subject pixels.

Examples:
  python scripts/pack-enemy-strips-v8.py --mood fungal --device cuda
  python scripts/pack-enemy-strips-v8.py --device cuda --publish
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections import deque
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
V8 = ROOT / "public" / "assets" / "sprites" / "enemies-v8"
RAW_ROOT = V8 / "_src" / "strips-biome"
DEFAULT_OUT = V8 / "biomes"
DEFAULT_ASSIGNMENTS = V8 / "source-assignments.json"
RUNTIME = ROOT / "public" / "assets" / "sprites" / "enemies-v6"
QA_ROOT = ROOT / ".scratch" / "enemies-v8" / "qa"

CELL = 320
COLS = 4
SAFE_MARGIN = 16
SHEET_SIZE = (COLS * CELL, 11 * CELL)
NEUTRAL_PLATE = (96, 96, 98)

HYBRID_ROW_METHODS = {
    ("molten", "carrion"): "biref-edge",
    ("molten", "imp"): "biref-edge",
    ("obsidian", "bone-slime"): "biref-strict-edge",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def report_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return resolved.as_posix()


def load_assignments(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    moods = data.get("moods")
    roster = data.get("roster")
    if not isinstance(moods, list) or not moods:
        raise SystemExit(f"invalid moods in {path}")
    if not isinstance(roster, list) or not roster:
        raise SystemExit(f"invalid roster in {path}")
    return data


def resolve_source(assignments: dict[str, Any], mood: str, kind: str) -> tuple[str, Path]:
    overrides = assignments.get("overrides", {})
    source_mood = overrides.get(kind, {}).get(mood, mood)
    folder = RAW_ROOT / source_mood
    candidates = (folder / f"{kind}.png", folder / f"{kind}.jpg", folder / f"{kind}.jpeg")
    source = next((candidate for candidate in candidates if candidate.exists()), None)
    if source is None:
        raise FileNotFoundError(f"missing source for {mood}/{kind} under {folder}")
    return source_mood, source


def split_strip(source: Path) -> list[Image.Image]:
    with Image.open(source) as loaded:
        image = loaded.convert("RGB")
    width, height = image.size
    if abs(width / height - COLS) > 0.05:
        raise ValueError(f"{source} must be a 4:1 strip, got {image.size}")
    frames: list[Image.Image] = []
    for column in range(COLS):
        left = round(column * width / COLS)
        right = round((column + 1) * width / COLS)
        frame = image.crop((left, 0, right, height)).resize(
            (CELL, CELL), Image.Resampling.LANCZOS
        )
        frames.append(frame)
    return frames


def edge_background_mask(
    image: Image.Image, *, strict: bool = False
) -> tuple[Image.Image, tuple[int, int, int]]:
    """Return an edge-connected source-background mask and its median color."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    samples: list[tuple[int, int, int]] = []
    stride = max(1, min(width, height) // 96)
    for x in range(0, width, stride):
        samples.append(pixels[x, 0])
        samples.append(pixels[x, height - 1])
    for y in range(0, height, stride):
        samples.append(pixels[0, y])
        samples.append(pixels[width - 1, y])
    channels = [sorted(sample[index] for sample in samples) for index in range(3)]
    middle = len(samples) // 2
    background = (channels[0][middle], channels[1][middle], channels[2][middle])
    br, bg, bb = background
    background_max = max(background)

    visited = bytearray(width * height)
    mask = Image.new("L", (width, height), 0)
    mask_pixels = mask.load()
    queue: deque[tuple[int, int]] = deque()

    def candidate(x: int, y: int) -> bool:
        r, g, b = pixels[x, y]
        distance = abs(r - br) + abs(g - bg) + abs(b - bb)
        neutral = max(r, g, b) - min(r, g, b) <= 24
        if distance <= (30 if strict else 54):
            return True
        if (
            not strict
            and background_max <= 64
            and neutral
            and max(r, g, b) <= min(84, background_max + 40)
        ):
            return True
        return False

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

    # Keep a narrow dark outline around colors that clearly differ from the plate.
    foreground_seed = Image.new("L", (width, height), 0)
    seed_pixels = foreground_seed.load()
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            distance = abs(r - br) + abs(g - bg) + abs(b - bb)
            if distance >= 96 and max(r, g, b) >= 36:
                seed_pixels[x, y] = 255
    protected = foreground_seed.filter(ImageFilter.MaxFilter(5))
    protected_pixels = protected.load()
    for y in range(height):
        for x in range(width):
            if protected_pixels[x, y]:
                mask_pixels[x, y] = 0
    return mask, background


def make_plate(image: Image.Image, background_mask: Image.Image) -> Image.Image:
    plate = image.convert("RGB").copy()
    fill = Image.new("RGB", plate.size, NEUTRAL_PLATE)
    plate.paste(fill, (0, 0), background_mask)
    return plate


def load_model(device: str):
    import torch
    from transformers import AutoModelForImageSegmentation

    print(f"device={device}")
    print("loading ZhengPeng7/BiRefNet")
    model = AutoModelForImageSegmentation.from_pretrained(
        "ZhengPeng7/BiRefNet",
        trust_remote_code=True,
        dtype=torch.float32,
    )
    return model.to(device=device, dtype=torch.float32).eval()


def model_alpha(model, device: str, plate: Image.Image) -> Image.Image:
    import torch
    from torchvision import transforms

    transform = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    tensor = transform(plate).unsqueeze(0).to(device=device, dtype=torch.float32)
    with torch.no_grad():
        prediction = model(tensor)[-1].sigmoid().float().cpu()
    return transforms.ToPILImage()(prediction[0].squeeze()).resize(
        plate.size, Image.Resampling.BILINEAR
    )


def harden_alpha(alpha: Image.Image) -> Image.Image:
    return alpha.convert("L").point(
        lambda value: 0
        if value < 24
        else (255 if value > 224 else round((value - 24) * 255 / 200))
    )


def apply_alpha(
    image: Image.Image,
    background_mask: Image.Image,
    method: str,
    model,
    device: str,
) -> Image.Image:
    if method == "edge":
        alpha = background_mask.point(lambda value: 0 if value else 255)
    else:
        alpha = model_alpha(model, device, make_plate(image, background_mask))
        if method in ("biref-edge", "biref-strict-edge"):
            alpha_pixels = alpha.load()
            background_pixels = background_mask.load()
            for y in range(alpha.height):
                for x in range(alpha.width):
                    if background_pixels[x, y]:
                        alpha_pixels[x, y] = 0
        alpha = harden_alpha(alpha)
    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def register_row(frames: list[Image.Image]) -> tuple[list[Image.Image], tuple[int, int, int, int]]:
    boxes = [frame.getchannel("A").point(lambda value: 255 if value >= 8 else 0).getbbox() for frame in frames]
    valid = [box for box in boxes if box]
    if not valid:
        raise ValueError("row extraction produced no alpha")
    union = (
        min(box[0] for box in valid),
        min(box[1] for box in valid),
        max(box[2] for box in valid),
        max(box[3] for box in valid),
    )
    union_width = max(1, union[2] - union[0])
    union_height = max(1, union[3] - union[1])
    target = CELL - SAFE_MARGIN * 2
    scale = min(target / union_width, target / union_height, 1.0)
    resized_width = max(1, round(union_width * scale))
    resized_height = max(1, round(union_height * scale))
    destination_x = (CELL - resized_width) // 2
    destination_y = CELL - SAFE_MARGIN - resized_height
    registered: list[Image.Image] = []
    for frame in frames:
        cropped = frame.crop(union).resize(
            (resized_width, resized_height), Image.Resampling.LANCZOS
        )
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        cell.alpha_composite(cropped, (destination_x, destination_y))
        registered.append(cell)
    return registered, union


def frame_metrics(frame: Image.Image) -> dict[str, Any]:
    alpha = frame.getchannel("A")
    histogram = alpha.histogram()
    total = frame.width * frame.height
    bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
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


def process_row(
    assignments: dict[str, Any],
    mood: str,
    kind: str,
    method: str,
    model,
    device: str,
) -> tuple[list[Image.Image], dict[str, Any]]:
    source_mood, source = resolve_source(assignments, mood, kind)
    row_method = HYBRID_ROW_METHODS.get((mood, kind), "biref") if method == "hybrid" else method
    strict_background = row_method in ("biref", "biref-strict-edge")
    extracted: list[Image.Image] = []
    backgrounds: list[list[int]] = []
    for frame in split_strip(source):
        background_mask, background = edge_background_mask(frame, strict=strict_background)
        extracted.append(apply_alpha(frame, background_mask, row_method, model, device))
        backgrounds.append(list(background))
    registered, union = register_row(extracted)
    return registered, {
        "kind": kind,
        "destination_mood": mood,
        "source_mood": source_mood,
        "source": report_path(source),
        "source_sha256": sha256(source),
        "source_size_bytes": source.stat().st_size,
        "source_dimensions": list(Image.open(source).size),
        "background_method": row_method,
        "background_colors": backgrounds,
        "extracted_union_bbox": list(union),
        "frames": [frame_metrics(frame) for frame in registered],
    }


def checker(size: tuple[int, int], step: int = 16) -> Image.Image:
    image = Image.new("RGBA", size, (43, 43, 47, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            if (x // step + y // step) % 2 == 0:
                draw.rectangle(
                    (x, y, min(x + step - 1, size[0] - 1), min(y + step - 1, size[1] - 1)),
                    fill=(78, 78, 84, 255),
                )
    return image


def write_contact(atlas: Image.Image, mood: str, roster: list[str], path: Path) -> None:
    font_path = Path(r"C:\Windows\Fonts\segoeui.ttf")
    font = ImageFont.truetype(str(font_path), 14) if font_path.exists() else ImageFont.load_default()
    thumb = 160
    label = 140
    header = 34
    output = Image.new("RGB", (label + COLS * thumb, header + len(roster) * thumb), (22, 22, 25))
    draw = ImageDraw.Draw(output)
    draw.text((8, 8), f"{mood} - reprocessed RGBA", fill=(245, 245, 242), font=font)
    for row, kind in enumerate(roster):
        y = header + row * thumb
        draw.text((8, y + 68), kind, fill=(245, 245, 242), font=font)
        for column in range(COLS):
            frame = atlas.crop((column * CELL, row * CELL, (column + 1) * CELL, (row + 1) * CELL))
            frame.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
            panel = checker((thumb, thumb), 12)
            panel.alpha_composite(frame, ((thumb - frame.width) // 2, (thumb - frame.height) // 2))
            output.paste(panel.convert("RGB"), (label + column * thumb, y))
    path.parent.mkdir(parents=True, exist_ok=True)
    output.save(path)


def process_mood(
    assignments: dict[str, Any],
    mood: str,
    method: str,
    model,
    device: str,
    out_root: Path,
) -> dict[str, Any]:
    roster: list[str] = assignments["roster"]
    atlas = Image.new("RGBA", SHEET_SIZE, (0, 0, 0, 0))
    rows: dict[str, Any] = {}
    print(f"=== {mood}")
    for row, kind in enumerate(roster):
        frames, row_report = process_row(assignments, mood, kind, method, model, device)
        row_strip = Image.new("RGBA", (COLS * CELL, CELL), (0, 0, 0, 0))
        for column, frame in enumerate(frames):
            row_strip.alpha_composite(frame, (column * CELL, 0))
        atlas.alpha_composite(row_strip, (0, row * CELL))
        rows[kind] = row_report
        print(f"  {kind}: {row_report['source_mood']}/{kind}")
    destination = out_root / f"{mood}-enemies.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, "PNG", optimize=True)
    contact = QA_ROOT / method / f"{mood}-contact.png"
    write_contact(atlas, mood, roster, contact)
    return {
        "mood": mood,
        "atlas": report_path(destination),
        "atlas_sha256": sha256(destination),
        "atlas_size_bytes": destination.stat().st_size,
        "atlas_dimensions": list(atlas.size),
        "contact": report_path(contact),
        "rows": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Reprocess and pack biome enemy strips")
    parser.add_argument("--assignments", type=Path, default=DEFAULT_ASSIGNMENTS)
    parser.add_argument("--mood", action="append", default=[])
    parser.add_argument(
        "--method",
        choices=("edge", "biref", "biref-edge", "biref-strict-edge", "hybrid"),
        default="hybrid",
    )
    parser.add_argument("--device", default=None)
    parser.add_argument("--out-root", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--publish", action="store_true", help="copy validated output into enemies-v6")
    args = parser.parse_args()

    args.assignments = args.assignments.resolve()
    args.out_root = args.out_root.resolve()

    assignments = load_assignments(args.assignments)
    requested = args.mood or assignments["moods"]
    unknown = sorted(set(requested) - set(assignments["moods"]))
    if unknown:
        raise SystemExit(f"unknown moods: {unknown}")

    model = None
    device = args.device or "cpu"
    if args.method != "edge":
        import torch

        device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
        model = load_model(device)

    reports = [
        process_mood(assignments, mood, args.method, model, device, args.out_root)
        for mood in requested
    ]
    report_file = QA_ROOT / args.method / "atlas-report.json"
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "version": 1,
        "kind": "biome-enemy-atlas-report",
        "status": "pass"
        if all(
            frame["edge_nonzero"] == 0 and frame["bbox"]
            for mood in reports
            for row in mood["rows"].values()
            for frame in row["frames"]
        )
        else "warn",
        "method": args.method,
        "background_model": "ZhengPeng7/BiRefNet" if args.method != "edge" else None,
        "device": device,
        "assignments": report_path(args.assignments),
        "moods": reports,
    }
    report_file.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {report_file} status={report['status']}")

    if args.publish:
        if set(requested) != set(assignments["moods"]):
            raise SystemExit("--publish requires all moods")
        for mood in assignments["moods"]:
            source = args.out_root / f"{mood}-enemies.png"
            destination = RUNTIME / "biomes" / source.name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            print(f"published {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
