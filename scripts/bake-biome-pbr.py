#!/usr/bin/env python3
"""
Bake seamless albedo companions + depth/normal/rough for biome tiles.

Does not use Depth Anything by default (soft maps fight pixel art).
Makes a wrap-safe stack so tile edges match for albedo AND data maps.

Writes:
  {surface}-seamless.png  (optional runtime albedo)
  {surface}-depth.png
  {surface}-normal.png
  {surface}-rough.png

Also overwrites {surface}.png with seamless version only when --write-albedo.
Default: write seamless as -seamless.png AND still write PBR from seamless buffer;
runtime can load either. We write PBR from seamless in-memory and optionally
replace albedo with --write-albedo (recommended once).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BIOMES = ROOT / "public" / "assets" / "textures" / "biomes"
SURFACES = ("floor", "wall", "ceiling")
BIOME_IDS = (
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
OUT_SIZE = 512
BLEND = 0.14


def load_rgb(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    if img.size != (OUT_SIZE, OUT_SIZE):
        img = img.resize((OUT_SIZE, OUT_SIZE), Image.Resampling.NEAREST)
    return np.asarray(img)


def save_png(path: Path, rgb: np.ndarray) -> None:
    Image.fromarray(rgb, mode="RGB").save(path, optimize=True)
    print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


def border_mismatch(arr: np.ndarray) -> float:
    rgb = arr[..., :3].astype(np.float32)
    horizontal = np.abs(rgb[:, 0] - rgb[:, -1]).mean()
    vertical = np.abs(rgb[0] - rgb[-1]).mean()
    return float(max(horizontal, vertical))


def edge_blend_seamless(arr: np.ndarray, blend_ratio: float = BLEND) -> np.ndarray:
    """Opposite borders become identical — required for per-tile UV 0..1 wrapping."""
    h, w = arr.shape[:2]
    blend = max(8, min(int(min(h, w) * blend_ratio), min(h, w) // 4))
    out = arr.astype(np.float32).copy()

    def ease(t: float) -> float:
        return t * t * (3.0 - 2.0 * t)

    for x in range(blend):
        t = ease(x / max(1, blend - 1))
        mixed = out[:, x] * t + out[:, w - 1 - x] * (1.0 - t)
        out[:, x] = mixed
        out[:, w - 1 - x] = mixed
    for y in range(blend):
        t = ease(y / max(1, blend - 1))
        mixed = out[y] * t + out[h - 1 - y] * (1.0 - t)
        out[y] = mixed
        out[h - 1 - y] = mixed
    if arr.dtype == np.uint8:
        return np.clip(np.rint(out), 0, 255).astype(np.uint8)
    return out.astype(np.float32)


def box_blur(channel: np.ndarray, radius: int = 1) -> np.ndarray:
    if radius <= 0:
        return channel
    out = channel.astype(np.float32)
    acc = np.zeros_like(out)
    n = 0
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            acc += np.roll(np.roll(out, dy, 0), dx, 1)
            n += 1
    return acc / n


def height_from_albedo(albedo: np.ndarray) -> np.ndarray:
    luma = albedo.astype(np.float32).mean(axis=2) / 255.0
    lo, hi = np.percentile(luma, 10), np.percentile(luma, 90)
    h = np.clip((luma - lo) / (hi - lo + 1e-6), 0.0, 1.0)
    h = box_blur(h, 1)
    h = (h - h.min()) / (h.max() - h.min() + 1e-8)
    # Seamless height so normals wrap
    return edge_blend_seamless(h, BLEND)


def depth_to_normal(height: np.ndarray, strength: float = 3.6) -> np.ndarray:
    d_dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * strength
    d_dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5 * strength
    nx = -d_dx
    ny = -d_dy
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    nx /= length
    ny /= length
    nz /= length
    encoded = np.stack(
        [
            ((nx * 0.5 + 0.5) * 255).clip(0, 255),
            ((ny * 0.5 + 0.5) * 255).clip(0, 255),
            ((nz * 0.5 + 0.5) * 255).clip(0, 255),
        ],
        axis=-1,
    ).astype(np.uint8)
    encoded = edge_blend_seamless(encoded, BLEND * 0.65)
    # Blending RGB normals shortens them. Restore unit length after the seam pass.
    vector = encoded.astype(np.float32) / 255.0 * 2.0 - 1.0
    vector /= np.linalg.norm(vector, axis=2, keepdims=True) + 1e-8
    return np.clip(np.rint((vector * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)


def roughness_from_height(albedo: np.ndarray, height: np.ndarray) -> np.ndarray:
    luma = albedo.astype(np.float32).mean(axis=2) / 255.0
    detail = np.abs(luma - box_blur(luma, 1))
    rough = 0.64 + (1.0 - height) * 0.2 + detail * 0.65
    rough = np.clip(rough, 0.52, 0.94)
    g = (rough * 255).astype(np.uint8)
    return edge_blend_seamless(np.stack([g, g, g], axis=-1), BLEND * 0.8)


def process_one(albedo_path: Path, write_albedo: bool) -> None:
    stem = albedo_path.stem
    parent = albedo_path.parent
    print(f"bake {albedo_path.relative_to(ROOT)}")
    raw = load_rgb(albedo_path)
    albedo = raw if border_mismatch(raw) <= 2 else edge_blend_seamless(raw, BLEND)
    height = height_from_albedo(albedo)
    normal = depth_to_normal(height, strength=3.6)
    rough = roughness_from_height(albedo, height)
    depth_rgb = np.stack([(height * 255).astype(np.uint8)] * 3, axis=-1)

    if write_albedo:
        save_png(parent / f"{stem}.png", albedo)
    save_png(parent / f"{stem}-depth.png", depth_rgb)
    save_png(parent / f"{stem}-normal.png", normal)
    save_png(parent / f"{stem}-rough.png", rough)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write-albedo",
        action="store_true",
        default=True,
        help="Overwrite albedo with seamless version (default true)",
    )
    parser.add_argument("--keep-albedo", action="store_true", help="Do not overwrite albedo.png")
    parser.add_argument(
        "--biomes",
        nargs="+",
        choices=BIOME_IDS,
        default=list(BIOME_IDS),
        help="Only bake the selected biome ids",
    )
    args = parser.parse_args()
    write_albedo = args.write_albedo and not args.keep_albedo
    print(f"mode=albedo-height seamless write_albedo={write_albedo}")

    count = 0
    for biome in args.biomes:
        folder = BIOMES / biome
        if not folder.is_dir():
            continue
        for surface in SURFACES:
            path = folder / f"{surface}.png"
            if not path.is_file():
                continue
            process_one(path, write_albedo)
            count += 1
    print(f"done — {count} sets")
    return 0 if count else 1


if __name__ == "__main__":
    sys.exit(main())
