"""Build seamless low-poly PBR map sets from ImageGen albedo masters."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT / "assets-source" / "imagegen" / "material-textures-v2"
OUTPUT = PROJECT / "public" / "assets" / "textures" / "model-materials-v2"
# The ImageGen masters stay at source resolution. Low-poly props use repeated
# surface detail, so 512 px runtime plates retain the visible grain while
# cutting the shipped PBR payload and cold decode cost by roughly three quarters.
MAP_SIZE = 512


@dataclass(frozen=True)
class MaterialConfig:
    source: str
    target_luma: float
    roughness: float
    roughness_variation: float
    normal_strength: float
    crop_margin: float = 0.055
    saturation: float = 1.0
    contrast: float = 1.0
    sample_width: float = 1.0
    sample_height: float = 1.0
    wrap_mode: str = "mirrored-repeat"


MATERIALS: dict[str, MaterialConfig] = {
    "aged-oak": MaterialConfig(
        "aged-oak-albedo-source.png", 0.42, 0.9, 0.06, 2.0, saturation=0.7
    ),
    "black-iron": MaterialConfig(
        "black-iron-albedo-source.png", 0.32, 0.76, 0.1, 1.5, saturation=0.72
    ),
    "dull-brass": MaterialConfig(
        "dull-brass-albedo-source.png", 0.45, 0.68, 0.1, 1.3, saturation=0.78
    ),
    "dungeon-stone": MaterialConfig("dungeon-stone-albedo-source.png", 0.42, 0.95, 0.04, 1.8),
    "ash-ceramic": MaterialConfig("ash-ceramic-albedo-source.png", 0.43, 0.88, 0.06, 1.35),
    "aged-bone": MaterialConfig("aged-bone-albedo-source.png", 0.68, 0.96, 0.04, 1.15),
    "woven-cloth": MaterialConfig("woven-cloth-albedo-source.png", 0.34, 0.98, 0.02, 1.2),
    "cured-meat": MaterialConfig(
        "cured-meat-albedo-source.png",
        0.33,
        0.78,
        0.06,
        1.05,
        saturation=0.78,
        contrast=0.74,
        wrap_mode="clamp-to-edge",
    ),
    "dungeon-ice": MaterialConfig("dungeon-ice-albedo-source.png", 0.6, 0.55, 0.1, 1.4),
    "arcane-crystal": MaterialConfig("arcane-crystal-albedo-source.png", 0.45, 0.48, 0.14, 1.35),
    "luminous-ward-gold": MaterialConfig(
        "luminous-ward-gold-albedo-source.png",
        0.62,
        0.84,
        0.05,
        0.65,
        saturation=0.76,
        contrast=0.72,
    ),
    "root-bark": MaterialConfig(
        "root-bark-albedo-source.png",
        0.29,
        0.9,
        0.04,
        1.35,
        saturation=0.62,
        contrast=0.52,
        sample_width=0.48,
        sample_height=0.46,
    ),
    "ochre-painted-steel": MaterialConfig(
        "ochre-painted-steel-albedo-source.png", 0.48, 0.82, 0.08, 1.1, saturation=0.82
    ),
}


def set_luma(rgb: np.ndarray, target: float) -> np.ndarray:
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    current = float(np.mean(luma))
    scaled = rgb * (target / max(current, 1e-4))
    return np.clip(scaled, 0, 1)


def set_saturation(rgb: np.ndarray, saturation: float) -> np.ndarray:
    gray = (rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))[..., None]
    return np.clip(gray + (rgb - gray) * saturation, 0, 1)


def set_contrast(rgb: np.ndarray, contrast: float) -> np.ndarray:
    mean = np.mean(rgb, axis=(0, 1), keepdims=True)
    return np.clip(mean + (rgb - mean) * contrast, 0, 1)


def periodic_edge_delta(channel: np.ndarray) -> dict[str, float]:
    return {
        "horizontal": round(float(np.mean(np.abs(channel[:, 0] - channel[:, -1]))), 6),
        "vertical": round(float(np.mean(np.abs(channel[0, :] - channel[-1, :]))), 6),
    }


def center_detail_ratio(luma: np.ndarray) -> dict[str, float]:
    """Catch a flat cross painted through the center of an otherwise detailed map."""
    height_px, width_px = luma.shape
    band = max(8, min(height_px, width_px) // 16)
    dx = np.abs(np.diff(luma, axis=1))
    dy = np.abs(np.diff(luma, axis=0))
    center_x = float(np.mean(dx[:, width_px // 2 - band : width_px // 2 + band]))
    outer_x = float(
        np.mean(
            np.concatenate(
                (
                    dx[:, : width_px // 2 - band * 2].ravel(),
                    dx[:, width_px // 2 + band * 2 :].ravel(),
                )
            )
        )
    )
    center_y = float(np.mean(dy[height_px // 2 - band : height_px // 2 + band, :]))
    outer_y = float(
        np.mean(
            np.concatenate(
                (
                    dy[: height_px // 2 - band * 2, :].ravel(),
                    dy[height_px // 2 + band * 2 :, :].ravel(),
                )
            )
        )
    )
    return {
        "horizontal": round(center_x / max(outer_x, 1e-6), 4),
        "vertical": round(center_y / max(outer_y, 1e-6), 4),
    }


def build_maps(material_id: str, config: MaterialConfig) -> dict[str, object]:
    source_path = SOURCE / config.source
    with Image.open(source_path) as source_image:
        source_rgb = np.asarray(source_image.convert("RGB"), dtype=np.float32) / 255

    # Keep the authored interior intact and discard the outer generation rim.
    # Most shared materials mirror-repeat at runtime. Model-specific materials
    # can instead use authored 0..1 UVs and retain this undisturbed source crop.
    height_px, width_px, _ = source_rgb.shape
    margin_x = int(width_px * config.crop_margin)
    margin_y = int(height_px * config.crop_margin)
    available_width = width_px - margin_x * 2
    available_height = height_px - margin_y * 2
    sample_width_px = int(available_width * config.sample_width)
    sample_start_x = margin_x + (available_width - sample_width_px) // 2
    sample_end_x = sample_start_x + sample_width_px
    sample_end_y = margin_y + int(available_height * config.sample_height)
    clean_source = source_rgb[margin_y:sample_end_y, sample_start_x:sample_end_x]
    resized = Image.fromarray(np.uint8(np.clip(clean_source, 0, 1) * 255), "RGB").resize(
        (MAP_SIZE, MAP_SIZE), Image.Resampling.LANCZOS
    )
    albedo = set_luma(
        set_contrast(
            set_saturation(np.asarray(resized, dtype=np.float32) / 255, config.saturation),
            config.contrast,
        ),
        config.target_luma,
    )
    luma = albedo @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    blur = np.asarray(
        Image.fromarray(np.uint8(luma * 255), "L").filter(ImageFilter.GaussianBlur(radius=7)),
        dtype=np.float32,
    ) / 255
    height = np.clip(0.5 + (luma - blur) * 1.9 + (luma - float(np.mean(luma))) * 0.16, 0, 1)

    reflected = np.pad(height, 1, mode="reflect")
    dx = (reflected[1:-1, 2:] - reflected[1:-1, :-2]) * config.normal_strength
    dy = (reflected[2:, 1:-1] - reflected[:-2, 1:-1]) * config.normal_strength
    normal = np.dstack((-dx, dy, np.ones_like(height)))
    normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
    normal = normal * 0.5 + 0.5

    micro = np.abs(height - 0.5) * 2
    roughness = np.clip(
        config.roughness + (0.5 - micro) * config.roughness_variation,
        0.18,
        1,
    )
    ao = np.clip(0.97 - np.maximum(0.5 - height, 0) * 0.62, 0.72, 1)

    material_dir = OUTPUT / material_id
    material_dir.mkdir(parents=True, exist_ok=True)
    maps = {
        "albedo": np.uint8(albedo * 255),
        "height": np.uint8(height * 255),
        "normal": np.uint8(normal * 255),
        "roughness": np.uint8(roughness * 255),
        "ao": np.uint8(ao * 255),
    }
    paths: dict[str, str] = {}
    output_digests: dict[str, str] = {}
    for kind, pixels in maps.items():
        mode = "RGB" if pixels.ndim == 3 else "L"
        target = material_dir / f"{material_id}_{kind}.png"
        Image.fromarray(pixels, mode).save(target, compress_level=6)
        paths[kind] = str(target.relative_to(PROJECT)).replace("\\", "/")
        output_digests[kind] = hashlib.sha256(target.read_bytes()).hexdigest()

    digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
    return {
        "id": material_id,
        "source": str(source_path.relative_to(PROJECT)).replace("\\", "/"),
        "sourceSha256": digest,
        "sourceCropMargin": config.crop_margin,
        "sourceSampleHeight": config.sample_height,
        "saturation": config.saturation,
        "contrast": config.contrast,
        "sourceSampleWidth": config.sample_width,
        "wrapMode": config.wrap_mode,
        "maps": paths,
        "outputSha256": output_digests,
        "meanLuma": round(float(np.mean(luma)), 4),
        "meanRgb": [round(float(value), 4) for value in np.mean(albedo, axis=(0, 1))],
        "roughnessRange": [round(float(np.min(roughness)), 4), round(float(np.max(roughness)), 4)],
        "albedoEdgeDelta": periodic_edge_delta(albedo),
        "heightEdgeDelta": periodic_edge_delta(height),
        "centerDetailRatio": center_detail_ratio(luma),
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = [build_maps(material_id, config) for material_id, config in MATERIALS.items()]
    (OUTPUT / "manifest.json").write_text(
        json.dumps({"schemaVersion": 1, "mapSize": MAP_SIZE, "materials": records}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    for record in records:
        print(
            f"{record['id']}: luma={record['meanLuma']} "
            f"wrap={record['wrapMode']}"
        )


if __name__ == "__main__":
    main()
