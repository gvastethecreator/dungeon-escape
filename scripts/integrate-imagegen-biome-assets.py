"""Crop ImageGen masters into runtime biome surfaces, doors and wall sprites.

ImageGen owns every albedo/sprite pixel. This script only crops, keys chroma,
normalizes size/color and derives data maps from the generated surface atlas.
Pass source files once; canonical masters are copied to assets-source/imagegen.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


APP_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = APP_ROOT / "assets-source" / "imagegen"
PUBLIC_ROOT = APP_ROOT / "public" / "assets"
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
EXPANDED = ("obsidian", "sunken", "fungal", "backrooms")
SURFACES = ("floor", "wall", "ceiling")
PALETTES = {
    "ancient": (151, 121, 72),
    "molten": (164, 75, 47),
    "frost": (154, 199, 214),
    "grim": (112, 91, 112),
    "verdant": (105, 137, 80),
    "ash": (139, 120, 99),
    "iron": (137, 136, 130),
    "obsidian": (122, 70, 137),
    "sunken": (77, 135, 127),
    "fungal": (137, 101, 157),
    "backrooms": (190, 174, 101),
}
ROUGHNESS = {"obsidian": 0.56, "sunken": 0.42, "fungal": 0.82, "backrooms": 0.84}


def canonical_source(name: str, supplied: Path | None) -> Path:
    SOURCE_ROOT.mkdir(parents=True, exist_ok=True)
    target = SOURCE_ROOT / name
    if supplied:
        if not supplied.is_file():
            raise FileNotFoundError(supplied)
        shutil.copy2(supplied, target)
    if not target.is_file():
        raise FileNotFoundError(f"missing ImageGen master: {target}")
    return target


def crop_grid(image: Image.Image, columns: int, rows: int, column: int, row: int) -> Image.Image:
    x0 = round(column * image.width / columns)
    x1 = round((column + 1) * image.width / columns)
    y0 = round(row * image.height / rows)
    y1 = round((row + 1) * image.height / rows)
    return image.crop((x0, y0, x1, y1))


def pixel_normal(height: np.ndarray) -> np.ndarray:
    softened = np.asarray(
        Image.fromarray((height * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.2)),
        dtype=np.float32,
    ) / 255
    dx = np.roll(softened, -1, axis=1) - np.roll(softened, 1, axis=1)
    dy = np.roll(softened, -1, axis=0) - np.roll(softened, 1, axis=0)
    normal = np.dstack((-dx * 2.8, dy * 2.8, np.ones_like(height)))
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    return np.clip((normal * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8)


def save_surface(cell: Image.Image, biome: str, surface: str) -> None:
    target = PUBLIC_ROOT / "textures" / "biomes" / biome
    target.mkdir(parents=True, exist_ok=True)
    albedo = ImageEnhance.Contrast(cell.convert("RGB")).enhance(1.04)
    albedo = albedo.resize((512, 512), Image.Resampling.LANCZOS)
    albedo.save(target / f"{surface}.png", optimize=True)
    gray = np.asarray(ImageOps.grayscale(albedo), dtype=np.float32) / 255
    height = np.clip((gray - gray.min()) / max(0.001, float(gray.max() - gray.min())), 0, 1)
    rough_base = ROUGHNESS[biome] + (0.06 if surface == "ceiling" else 0)
    rough = np.clip(rough_base + (0.5 - gray) * 0.14, 0.2, 0.98)
    Image.fromarray(pixel_normal(height), "RGB").save(target / f"{surface}-normal.png", optimize=True)
    Image.fromarray((rough * 255).astype(np.uint8), "L").save(
        target / f"{surface}-rough.png", optimize=True
    )
    Image.fromarray((height * 255).astype(np.uint8), "L").save(
        target / f"{surface}-depth.png", optimize=True
    )


def key_magenta(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32).copy()
    r, g, b = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    score = np.minimum(r, b) - g
    chroma = (r > 118) & (b > 102) & (score > 42)
    alpha = rgba[..., 3]
    alpha[chroma] = np.clip((126 - score[chroma]) / 84 * 255, 0, 255)
    alpha[chroma & (score > 64)] = 0
    # Remove pink matte from partially keyed edge pixels.
    ratio = np.clip(alpha / 255, 0.04, 1)[..., None]
    matte = np.array([255, 0, 255], dtype=np.float32)
    rgba[..., :3] = np.clip((rgba[..., :3] - matte * (1 - ratio)) / ratio, 0, 255)
    rgba[..., 3] = alpha
    rgba[alpha < 7] = 0
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def fit_sprite(image: Image.Image, size: int, padding: int = 8) -> Image.Image:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        return Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sprite = image.crop(bounds)
    sprite.thumbnail((size - padding * 2, size - padding * 2), Image.Resampling.LANCZOS)
    target = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    target.alpha_composite(sprite, ((size - sprite.width) // 2, (size - sprite.height) // 2))
    return target


def save_door(cell: Image.Image, biome: str) -> None:
    keyed = key_magenta(cell)
    bounds = keyed.getchannel("A").getbbox()
    if not bounds:
        raise ValueError(f"ImageGen door cell is empty: {biome}")
    sprite = keyed.crop(bounds)
    # DoorFactory supplies the 3D frame. Keep the generated leaf art, trim most baked surround.
    inset_x = round(sprite.width * (0.15 if biome != "backrooms" else 0.08))
    inset_top = round(sprite.height * (0.08 if biome != "backrooms" else 0.03))
    inset_bottom = round(sprite.height * 0.035)
    leaf = sprite.crop((inset_x, inset_top, sprite.width - inset_x, sprite.height - inset_bottom))
    background = Image.new("RGBA", leaf.size, PALETTES[biome] + (255,))
    background.alpha_composite(leaf)
    output = background.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
    target = PUBLIC_ROOT / "textures" / "biomes" / biome / "door.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    output.save(target, optimize=True)


def tint_sprite(sprite: Image.Image, color: tuple[int, int, int], strength: float) -> Image.Image:
    rgba = np.asarray(sprite.convert("RGBA"), dtype=np.float32)
    lum = rgba[..., :3].mean(axis=2, keepdims=True) / 255
    tint = np.asarray(color, dtype=np.float32).reshape(1, 1, 3)
    colored = rgba[..., :3] * (1 - strength) + tint * (0.55 + lum * 0.45) * strength
    rgba[..., :3] = np.clip(colored, 0, 255)
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def save_wall_decor(master: Image.Image) -> None:
    base_frames = []
    for frame in range(4):
        strip = crop_grid(master, 4, 1, frame, 0)
        base_frames.append(fit_sprite(key_magenta(strip), 256, 7))
    for biome in BIOMES:
        atlas = Image.new("RGBA", (1024, 256), (0, 0, 0, 0))
        strength = 0.08 if biome == "backrooms" else 0.34
        for frame, sprite in enumerate(base_frames):
            atlas.alpha_composite(tint_sprite(sprite, PALETTES[biome], strength), (frame * 256, 0))
        target = PUBLIC_ROOT / "sprites" / "biomes" / f"{biome}-wall-decor.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(target, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--surface-atlas", type=Path)
    parser.add_argument("--door-atlas", type=Path)
    parser.add_argument("--wall-decor-atlas", type=Path)
    args = parser.parse_args()

    surface_source = canonical_source("expanded-biome-surfaces-v1.png", args.surface_atlas)
    door_source = canonical_source("biome-doors-v1.png", args.door_atlas)
    decor_source = canonical_source("uncanny-wall-decor-v1.png", args.wall_decor_atlas)

    surface_master = Image.open(surface_source)
    for column, biome in enumerate(EXPANDED):
        for row, surface in enumerate(SURFACES):
            save_surface(crop_grid(surface_master, 4, 3, column, row), biome, surface)

    door_master = Image.open(door_source)
    for index, biome in enumerate(BIOMES):
        save_door(crop_grid(door_master, 4, 3, index % 4, index // 4), biome)

    save_wall_decor(Image.open(decor_source))
    print("integrated ImageGen sources: 48 surface maps, 11 doors, 11 decor atlases")


if __name__ == "__main__":
    main()
