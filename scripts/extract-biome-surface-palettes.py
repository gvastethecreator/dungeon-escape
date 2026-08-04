#!/usr/bin/env python3
"""Extract deterministic OKLab palettes from the runtime biome albedo maps."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TEXTURES = ROOT / "public" / "assets" / "textures" / "biomes"
OUTPUT = ROOT / "src" / "world" / "BiomeSurfacePalettes.generated.ts"
SURFACES = ("floor", "wall", "ceiling")


def srgb_to_linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def linear_to_srgb(channel: float) -> float:
    channel = max(0.0, min(1.0, channel))
    return channel * 12.92 if channel <= 0.0031308 else 1.055 * channel ** (1 / 2.4) - 0.055


def rgb_to_oklab(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    r, g, b = (srgb_to_linear(value / 255) for value in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = math.copysign(abs(l) ** (1 / 3), l), math.copysign(abs(m) ** (1 / 3), m), math.copysign(abs(s) ** (1 / 3), s)
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def oklab_to_rgb(lab: tuple[float, float, float]) -> tuple[int, int, int]:
    lightness, a, b = lab
    l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    blue = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return tuple(round(linear_to_srgb(value) * 255) for value in (r, g, blue))


def average(colors: list[tuple[float, float, float]]) -> tuple[float, float, float]:
    return tuple(sum(color[index] for color in colors) / len(colors) for index in range(3))  # type: ignore[return-value]


def packed_hex(lab: tuple[float, float, float]) -> str:
    r, g, b = oklab_to_rgb(lab)
    return f"0x{r:02x}{g:02x}{b:02x}"


def palette(path: Path) -> dict[str, str]:
    image = Image.open(path).convert("RGB").resize((64, 64), Image.Resampling.BOX)
    labs = sorted((rgb_to_oklab(pixel) for pixel in image.get_flattened_data()), key=lambda color: color[0])
    count = len(labs)
    shadow = average(labs[round(count * 0.08) : round(count * 0.28)])
    base = average(labs[round(count * 0.3) : round(count * 0.7)])
    highlight = average(labs[round(count * 0.72) : round(count * 0.92)])
    chromatic = sorted(labs[round(count * 0.12) : round(count * 0.88)], key=lambda color: math.hypot(color[1], color[2]))
    accent = average(chromatic[round(len(chromatic) * 0.88) :])
    chroma = min(0.075, math.hypot(base[1], base[2]) * 1.1)
    hue = math.atan2(base[2], base[1])
    # Keep props legible without imposing one bright tint on every biome. The
    # surface median controls value while hue/chroma stay perceptually bounded.
    prop_lightness = min(0.68, max(0.52, base[0] + 0.16))
    prop_tint = (prop_lightness, math.cos(hue) * chroma, math.sin(hue) * chroma)
    return {
        "shadow": packed_hex(shadow),
        "base": packed_hex(base),
        "highlight": packed_hex(highlight),
        "accent": packed_hex(accent),
        "propTint": packed_hex(prop_tint),
    }


def main() -> None:
    biome_dirs = sorted(path for path in TEXTURES.iterdir() if path.is_dir())
    lines = [
        'import type { DungeonMoodId } from "../systems/DungeonMood";',
        "",
        'export type BiomeSurfacePaletteRole = "floor" | "wall" | "ceiling";',
        "",
        "export interface BiomeSurfacePalette {",
        "  readonly shadow: number;",
        "  readonly base: number;",
        "  readonly highlight: number;",
        "  readonly accent: number;",
        "  readonly propTint: number;",
        "}",
        "",
        "/** Generated from the shipped biome albedo maps in perceptual OKLab. */",
        "export const BIOME_SURFACE_PALETTES: Readonly<",
        "  Record<DungeonMoodId, Readonly<Record<BiomeSurfacePaletteRole, BiomeSurfacePalette>>>",
        "> = Object.freeze({",
    ]
    for biome_dir in biome_dirs:
        lines.append(f"  {biome_dir.name}: {{")
        for surface in SURFACES:
            values = palette(biome_dir / f"{surface}.webp")
            lines.append(f"    {surface}: {{")
            for key, value in values.items():
                lines.append(f"      {key}: {value},")
            lines.append("    },")
        lines.append("  },")
    lines.extend(
        [
            "});",
            "",
            "export function biomeSurfacePalette(",
            "  mood: DungeonMoodId,",
            "  surface: BiomeSurfacePaletteRole,",
            "): BiomeSurfacePalette {",
            "  return BIOME_SURFACE_PALETTES[mood][surface];",
            "}",
            "",
        ]
    )
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
