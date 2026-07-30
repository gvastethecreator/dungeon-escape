#!/usr/bin/env python3
"""Bake Depth Anything V2 depth, normal, and roughness atlases for wall sprites."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "public" / "assets" / "sprites"
DEFAULT_MODEL = "depth-anything/Depth-Anything-V2-Small-hf"


def model_label(model: str) -> str:
    if "models--depth-anything--Depth-Anything-V2-Small-hf" in model:
        return DEFAULT_MODEL
    return model


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_depth(depth: np.ndarray, mask: np.ndarray) -> np.ndarray:
    values = depth[mask]
    if values.size < 16:
        return np.zeros_like(depth, dtype=np.float32)
    low, high = np.percentile(values, (3, 97))
    normalized = np.clip((depth - low) / max(1e-6, high - low), 0, 1)
    normalized[~mask] = 0
    return normalized.astype(np.float32)


def smooth(channel: np.ndarray, radius: float) -> np.ndarray:
    image = Image.fromarray(np.clip(channel * 255, 0, 255).astype(np.uint8), mode="L")
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius=radius)), dtype=np.float32) / 255


def pbr_from_depth(
    rgba: np.ndarray,
    predicted: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mask = rgba[..., 3] > 8
    rgb = rgba[..., :3].astype(np.float32) / 255
    luma = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    macro = smooth(normalize_depth(predicted, mask), 1.15)
    detail = smooth(luma, 0.55)
    height = np.clip(macro * 0.78 + detail * 0.22, 0, 1)
    height[~mask] = 0

    dy, dx = np.gradient(height)
    nx = -dx * 2.35
    ny = dy * 2.35
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    normal = np.stack(
        [
            (nx / length * 0.5 + 0.5) * 255,
            (ny / length * 0.5 + 0.5) * 255,
            (nz / length * 0.5 + 0.5) * 255,
        ],
        axis=-1,
    ).clip(0, 255).astype(np.uint8)
    normal[~mask] = (128, 128, 255)

    micro = np.abs(luma - smooth(luma, 1.0))
    roughness = np.clip(0.72 + (1 - height) * 0.18 + micro * 0.7, 0.68, 0.96)
    rough = np.repeat((roughness[..., None] * 255).astype(np.uint8), 3, axis=-1)
    rough[~mask] = 255
    depth = np.repeat((height[..., None] * 255).astype(np.uint8), 3, axis=-1)
    return depth, normal, rough


def atlas_frames(path: Path) -> tuple[Image.Image, list[tuple[int, int, int, int]]]:
    image = Image.open(path).convert("RGBA")
    if path.name.endswith("-wall-decor.png"):
        return image, [(index * 256, 0, 256, 256) for index in range(4)]
    return image, [(x * 512, y * 512, 512, 512) for y in range(2) for x in range(2)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--local-files-only", action="store_true", default=True)
    parser.add_argument("--allow-download", action="store_true")
    args = parser.parse_args()

    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    local_only = args.local_files_only and not args.allow_download
    processor = AutoImageProcessor.from_pretrained(args.model, local_files_only=local_only)
    model = AutoModelForDepthEstimation.from_pretrained(args.model, local_files_only=local_only)
    device = args.device if args.device != "cuda" or torch.cuda.is_available() else "cpu"
    model.to(device).eval()

    inputs = sorted((SPRITES / "biomes").glob("*-wall-decor.png"))
    inputs.append(SPRITES / "iron-ash-wall-art.webp")
    provenance: dict[str, object] = {
        "generator": "scripts/bake-wall-sprite-pbr.py",
        "model": model_label(args.model),
        "device": device,
        "inputs": [],
    }

    for path in inputs:
        image, frames = atlas_frames(path)
        outputs = {
            kind: Image.new("RGB", image.size, fill)
            for kind, fill in {
                "depth": (0, 0, 0),
                "normal": (128, 128, 255),
                "rough": (255, 255, 255),
            }.items()
        }
        for x, y, width, height in frames:
            frame = image.crop((x, y, x + width, y + height))
            rgba = np.asarray(frame)
            alpha = rgba[..., 3:4].astype(np.float32) / 255
            opaque_rgb = rgba[..., :3].astype(np.float32)
            visible = rgba[..., 3] > 8
            fill = np.median(opaque_rgb[visible], axis=0) if np.any(visible) else np.array([0, 0, 0])
            model_rgb = opaque_rgb * alpha + fill.reshape(1, 1, 3) * (1 - alpha)
            model_image = Image.fromarray(model_rgb.clip(0, 255).astype(np.uint8), mode="RGB")
            batch = processor(images=model_image, return_tensors="pt")
            batch = {key: value.to(device) for key, value in batch.items()}
            with torch.inference_mode():
                predicted = model(**batch).predicted_depth
            predicted = torch.nn.functional.interpolate(
                predicted.unsqueeze(1), size=(height, width), mode="bicubic", align_corners=False
            ).squeeze().float().cpu().numpy()
            depth, normal, rough = pbr_from_depth(rgba, predicted)
            for kind, data in (("depth", depth), ("normal", normal), ("rough", rough)):
                outputs[kind].paste(Image.fromarray(data, mode="RGB"), (x, y))

        stem = path.with_suffix("")
        if path.suffix.lower() == ".webp":
            stem = path.parent / path.stem
        output_paths: list[Path] = []
        for kind, output in outputs.items():
            output_path = stem.parent / f"{stem.name}-{kind}.png"
            output.save(output_path, optimize=True)
            output_paths.append(output_path)
            print(f"wrote {output_path.relative_to(ROOT)}")
        provenance["inputs"].append(
            {
                "source": path.relative_to(ROOT).as_posix(),
                "source_sha256": sha256(path),
                "outputs": [
                    {"path": output.relative_to(ROOT).as_posix(), "sha256": sha256(output)}
                    for output in output_paths
                ],
            }
        )

    provenance_path = (
        ROOT
        / "assets-source"
        / "runtime-metadata"
        / "sprites"
        / "wall-sprite-pbr-provenance.json"
    )
    provenance_path.parent.mkdir(parents=True, exist_ok=True)
    provenance_path.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {provenance_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
