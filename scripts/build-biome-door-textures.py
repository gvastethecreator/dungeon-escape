"""Build biome door PBR textures from ImageGen front-albedo masters."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT / "assets-source" / "imagegen" / "biome-door-textures-v2"
OUTPUT = PROJECT / "public" / "assets" / "textures" / "biomes"
MAP_SIZE = 512


@dataclass(frozen=True)
class DoorConfig:
    target_luma: float
    roughness: float
    roughness_variation: float
    normal_strength: float
    metalness: float = 0.68


DOORS: dict[str, DoorConfig] = {
    "ancient": DoorConfig(0.40, 0.90, 0.08, 1.75),
    "molten": DoorConfig(0.34, 0.74, 0.12, 1.90),
    "frost": DoorConfig(0.58, 0.66, 0.12, 1.45),
    "grim": DoorConfig(0.36, 0.96, 0.06, 1.75),
    "verdant": DoorConfig(0.40, 0.94, 0.07, 1.70),
    "ash": DoorConfig(0.34, 0.92, 0.08, 1.65),
    "iron": DoorConfig(0.36, 0.64, 0.14, 1.55, 0.88),
    "obsidian": DoorConfig(0.18, 0.48, 0.16, 1.45, 0.04),
    "sunken": DoorConfig(0.36, 0.82, 0.10, 1.75),
    "fungal": DoorConfig(0.38, 0.90, 0.09, 1.65),
    "backrooms": DoorConfig(0.52, 0.88, 0.07, 1.25, 0.34),
}

VISUAL_REVIEWS: dict[str, dict[str, object]] = {
    "ancient": {"decision": "kept", "identityCues": ["aged oak", "worn rune bands"]},
    "molten": {"decision": "kept", "identityCues": ["charred timber", "ember-red seams"]},
    "frost": {"decision": "kept", "identityCues": ["pale frozen timber", "cold blue bands"]},
    "grim": {"decision": "regenerated", "identityCues": ["dark oak", "readable gray iron"]},
    "verdant": {"decision": "kept", "identityCues": ["olive timber", "vine-carved bands"]},
    "ash": {"decision": "regenerated", "identityCues": ["carbonized wood", "pale ash deposits"]},
    "iron": {"decision": "kept", "identityCues": ["charcoal plate", "riveted bands"]},
    "obsidian": {"decision": "regenerated", "identityCues": ["black volcanic glass", "purple mineral edges"]},
    "sunken": {"decision": "regenerated", "identityCues": ["waterlogged wood", "green algae"]},
    "fungal": {"decision": "regenerated", "identityCues": ["shelf mushrooms", "mycelium threads"]},
    "backrooms": {"decision": "kept", "identityCues": ["ochre painted steel", "worn panel edges"]},
}

LUMA_WEIGHTS = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encoded_luma(rgb: np.ndarray) -> np.ndarray:
    return rgb @ LUMA_WEIGHTS


def set_mean_luma(rgb: np.ndarray, target: float) -> np.ndarray:
    """Find a clipped RGB gain which reaches the requested encoded mean luma."""
    low = 0.0
    high = 8.0
    for _ in range(32):
        gain = (low + high) * 0.5
        current = float(np.mean(encoded_luma(np.clip(rgb * gain, 0, 1))))
        if current < target:
            low = gain
        else:
            high = gain
    return np.clip(rgb * ((low + high) * 0.5), 0, 1)


def detect_center_split(luma: np.ndarray) -> dict[str, float | int | bool]:
    """Report the strongest vertical join in the middle 20% of the authored plate."""
    edge = np.mean(np.abs(np.diff(luma, axis=1)), axis=0)
    center = luma.shape[1] // 2
    radius = max(2, luma.shape[1] // 10)
    start = center - radius
    end = center + radius
    detected = start + int(np.argmax(edge[start:end]))
    offset = detected - center
    return {
        "detectedColumn": detected,
        "offsetPixels": offset,
        "withinTolerance": abs(offset) <= 8,
        "centerEdge": round(float(np.mean(edge[center - 1 : center + 1])), 6),
        "detectedEdge": round(float(edge[detected]), 6),
    }


def save_map(path: Path, pixels: np.ndarray) -> None:
    mode = "RGB" if pixels.ndim == 3 else "L"
    Image.fromarray(np.uint8(np.clip(pixels, 0, 1) * 255), mode).save(path, optimize=True)


def build_metalness_map(
    biome: str,
    albedo: np.ndarray,
    luma: np.ndarray,
    detail: np.ndarray,
    peak: float,
) -> np.ndarray:
    """Extract a restrained per-pixel metal response from each authored plate.

    The ImageGen masters contain the straps, rivets and plates in the albedo. A
    single scalar made those regions react like timber. These masks use the
    known palette of each plate, then soften the selection so mipmaps do not
    create bright one-pixel seams.
    """
    red, green, blue = (albedo[..., channel] for channel in range(3))
    chroma = np.max(albedo, axis=2) - np.min(albedo, axis=2)
    neutral = np.clip(1.0 - chroma * 5.0, 0, 1)
    score = np.zeros_like(luma)

    if biome == "iron":
        score = 0.76 + detail * 0.24
    elif biome == "backrooms":
        # Ochre paint still covers a steel leaf. Keep the response restrained.
        score = 0.58 + detail * 0.18
    elif biome == "frost":
        cool_band = np.clip((blue - red - 0.025) * 7.5, 0, 1)
        score = np.maximum(cool_band, neutral * detail * 0.55)
    elif biome == "grim":
        score = neutral * np.clip((luma - 0.22) * 4.2, 0, 1)
    elif biome == "ancient":
        dark_iron = neutral * np.clip((0.43 - luma) * 4.0, 0, 1)
        score = np.maximum(dark_iron, neutral * detail * 0.72)
    elif biome == "ash":
        copper = np.clip((red - green - 0.015) * 7.0, 0, 1) * np.clip(
            (green - blue) * 8.0, 0, 1
        )
        score = np.maximum(copper, neutral * detail * 0.38)
    elif biome == "sunken":
        bronze = np.clip((red - green - 0.015) * 7.0, 0, 1) * np.clip(
            (green - blue - 0.005) * 7.0, 0, 1
        )
        score = np.maximum(bronze, neutral * detail * 0.52)
    elif biome == "molten":
        score = neutral * detail * np.clip((0.48 - luma) * 3.0, 0, 1)
    elif biome == "verdant":
        score = neutral * detail * 0.34
    elif biome == "fungal":
        score = neutral * detail * 0.24
    elif biome == "obsidian":
        # Volcanic glass is a dielectric. Facets belong in normal/roughness.
        score = detail * 0.04

    score_image = Image.fromarray(np.uint8(np.clip(score, 0, 1) * 255), "L").filter(
        ImageFilter.GaussianBlur(radius=0.75)
    )
    softened = np.asarray(score_image, dtype=np.float32) / 255
    floor = 0.015 if biome not in {"iron", "backrooms"} else 0.08
    return np.clip(floor + softened * (peak - floor), 0, 1)


def build_door(biome: str, config: DoorConfig) -> dict[str, object]:
    source_path = SOURCE / f"{biome}-door-albedo-source.png"
    with Image.open(source_path) as source_image:
        source_rgb = source_image.convert("RGB")
        width, height = source_rgb.size
        crop_size = min(width, height)
        left = (width - crop_size) // 2
        top = (height - crop_size) // 2
        square = source_rgb.crop((left, top, left + crop_size, top + crop_size))
        resized = square.resize((MAP_SIZE, MAP_SIZE), Image.Resampling.LANCZOS)

    albedo = set_mean_luma(np.asarray(resized, dtype=np.float32) / 255, config.target_luma)
    luma = encoded_luma(albedo)
    blurred = np.asarray(
        Image.fromarray(np.uint8(luma * 255), "L").filter(ImageFilter.GaussianBlur(radius=4)),
        dtype=np.float32,
    ) / 255
    broad = np.asarray(
        Image.fromarray(np.uint8(luma * 255), "L").filter(ImageFilter.GaussianBlur(radius=15)),
        dtype=np.float32,
    ) / 255
    height_map = np.clip(0.5 + (luma - blurred) * 1.55 + (blurred - broad) * 0.42, 0, 1)

    dx = (np.roll(height_map, -1, axis=1) - np.roll(height_map, 1, axis=1)) * config.normal_strength
    dy = (np.roll(height_map, -1, axis=0) - np.roll(height_map, 1, axis=0)) * config.normal_strength
    normal = np.dstack((-dx, dy, np.ones_like(height_map)))
    normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
    normal = normal * 0.5 + 0.5

    detail = np.clip(np.abs(luma - blurred) * 4.2, 0, 1)
    roughness = np.clip(
        config.roughness + (0.45 - detail) * config.roughness_variation,
        0.28,
        1,
    )
    metalness = build_metalness_map(biome, albedo, luma, detail, config.metalness)

    target_dir = OUTPUT / biome
    target_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "albedo": target_dir / "door.png",
        "normal": target_dir / "door-normal.png",
        "roughness": target_dir / "door-roughness.png",
        "metalness": target_dir / "door-metalness.png",
    }
    save_map(paths["albedo"], albedo)
    save_map(paths["normal"], normal)
    save_map(paths["roughness"], roughness)
    save_map(paths["metalness"], metalness)

    return {
        "id": biome,
        "source": str(source_path.relative_to(PROJECT)).replace("\\", "/"),
        "sourceSha256": sha256(source_path),
        "sourceSize": [width, height],
        "outputSize": [MAP_SIZE, MAP_SIZE],
        "maps": {
            kind: str(path.relative_to(PROJECT)).replace("\\", "/")
            for kind, path in paths.items()
        },
        "outputSha256": {kind: sha256(path) for kind, path in paths.items()},
        "meanLuma": round(float(np.mean(luma)), 4),
        "roughnessRange": [
            round(float(np.min(roughness)), 4),
            round(float(np.max(roughness)), 4),
        ],
        "metalnessRange": [
            round(float(np.min(metalness)), 4),
            round(float(np.max(metalness)), 4),
        ],
        "metalCoverage": round(float(np.mean(metalness > 0.18)), 4),
        "visualReview": {
            **VISUAL_REVIEWS[biome],
            "lightingCheck": "no directional gradient or cast shadow observed",
        },
        "centerSplit": detect_center_split(luma),
    }


def main() -> None:
    records = [build_door(biome, config) for biome, config in DOORS.items()]
    manifest = {
        "schemaVersion": 1,
        "contract": {
            "layout": "one full double-leaf front albedo split at U=0.5",
            "wrap": "clamp-to-edge",
            "lighting": "albedo contains no baked cast shadow",
            "reviewedAt": "2026-07-28",
        },
        "doors": records,
    }
    manifest_path = SOURCE / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for record in records:
        split = record["centerSplit"]
        print(
            f"{record['id']}: luma={record['meanLuma']} "
            f"split={split['detectedColumn']} offset={split['offsetPixels']} "
            f"centered={split['withinTolerance']}"
        )


if __name__ == "__main__":
    main()
