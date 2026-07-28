#!/usr/bin/env python3
"""Audit Model Lab capture completeness and basic exposure without scoring the art."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Validate Model Lab manifests and report image exposure warnings. "
            "Warnings guide visual review; they never count as visual acceptance."
        )
    )
    parser.add_argument("capture_dirs", nargs="+", type=Path)
    parser.add_argument("--required-views", default="front,right,rear-left")
    parser.add_argument("--expected-objects", type=int, default=55)
    parser.add_argument("--out", type=Path, required=True)
    return parser.parse_args()


def percentile(values: np.ndarray, value: float) -> float:
    return round(float(np.percentile(values, value)), 4)


def border_background(rgb: np.ndarray) -> np.ndarray:
    height, width, _ = rgb.shape
    patch = max(8, min(height, width) // 40)
    samples = np.concatenate(
        [
            rgb[:patch, width // 2 - patch : width // 2 + patch].reshape(-1, 3),
            rgb[-patch:, width // 2 - patch : width // 2 + patch].reshape(-1, 3),
            rgb[height // 2 - patch : height // 2 + patch, :patch].reshape(-1, 3),
            rgb[height // 2 - patch : height // 2 + patch, -patch:].reshape(-1, 3),
        ],
        axis=0,
    )
    return np.median(samples, axis=0)


def image_metrics(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    height, width, _ = rgb.shape
    crop = rgb[int(height * 0.14) : int(height * 0.92), int(width * 0.22) : int(width * 0.78)]
    luma = crop @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    background = border_background(rgb)
    color_delta = np.linalg.norm(crop - background, axis=2)
    foreground = luma[color_delta > 0.055]
    visible_ratio = float(foreground.size / luma.size)
    warnings: list[str] = []
    if visible_ratio < 0.02:
        warnings.append("very-low-visible-area")
    if foreground.size:
        foreground_mean = float(np.mean(foreground))
        foreground_p10 = percentile(foreground, 10)
        foreground_p90 = percentile(foreground, 90)
        if foreground_mean < 0.085 or foreground_p90 < 0.14:
            warnings.append("dark-foreground")
        if foreground_p90 - foreground_p10 < 0.055:
            warnings.append("low-foreground-contrast")
    else:
        foreground_mean = 0.0
        foreground_p10 = 0.0
        foreground_p90 = 0.0
    clipped_ratio = float(np.mean(luma > 0.97))
    if clipped_ratio > 0.04:
        warnings.append("highlight-clipping")
    return {
        "width": width,
        "height": height,
        "centralMean": round(float(np.mean(luma)), 4),
        "centralP10": percentile(luma, 10),
        "centralP90": percentile(luma, 90),
        "visibleAreaRatio": round(visible_ratio, 4),
        "foregroundMean": round(foreground_mean, 4),
        "foregroundP10": foreground_p10,
        "foregroundP90": foreground_p90,
        "clippedRatio": round(clipped_ratio, 4),
        "warnings": warnings,
    }


def audit_directory(directory: Path, required_views: set[str], expected_objects: int) -> dict[str, Any]:
    manifest_path = directory / "capture-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    shots = manifest.get("shots", [])
    records: list[dict[str, Any]] = []
    structural_errors: list[str] = []
    views_by_id: dict[str, set[str]] = {}
    for shot in shots:
        model_id = str(shot.get("id", ""))
        view = str(shot.get("view", ""))
        views_by_id.setdefault(model_id, set()).add(view)
        image_path = directory / str(shot.get("image", ""))
        if not shot.get("ready") or shot.get("status") != "ready" or shot.get("errors"):
            structural_errors.append(f"{model_id}:{view}:non-terminal-shot")
        if not image_path.is_file():
            structural_errors.append(f"{model_id}:{view}:missing-image")
            continue
        metrics = image_metrics(image_path)
        canvas = shot.get("canvas", {})
        if metrics["width"] != canvas.get("width") or metrics["height"] != canvas.get("height"):
            structural_errors.append(f"{model_id}:{view}:canvas-size-mismatch")
        records.append(
            {
                "id": model_id,
                "view": view,
                "mood": shot.get("mood"),
                "image": str(image_path.as_posix()),
                "renderMetrics": shot.get("metrics", {}),
                "imageMetrics": metrics,
            }
        )
    if len(views_by_id) != expected_objects:
        structural_errors.append(
            f"object-count:{len(views_by_id)}:expected-{expected_objects}"
        )
    for model_id, views in sorted(views_by_id.items()):
        missing = sorted(required_views - views)
        if missing:
            structural_errors.append(f"{model_id}:missing-views:{','.join(missing)}")
    warning_counts = Counter(
        warning for record in records for warning in record["imageMetrics"]["warnings"]
    )
    return {
        "directory": str(directory.as_posix()),
        "manifest": str(manifest_path.as_posix()),
        "mood": manifest.get("mood"),
        "shotCount": len(shots),
        "objectCount": len(views_by_id),
        "structuralErrors": structural_errors,
        "warningCounts": dict(sorted(warning_counts.items())),
        "records": records,
    }


def main() -> None:
    args = parse_args()
    required_views = {view.strip() for view in args.required_views.split(",") if view.strip()}
    audits = [
        audit_directory(directory.resolve(), required_views, args.expected_objects)
        for directory in args.capture_dirs
    ]
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "requiredViews": sorted(required_views),
        "expectedObjects": args.expected_objects,
        "acceptanceNote": (
            "This report checks capture structure and exposure signals only. "
            "A human or vision reviewer must score geometry, UVs, materials, and biome fit."
        ),
        "passedStructure": all(not audit["structuralErrors"] for audit in audits),
        "audits": audits,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "out": str(args.out),
                "passedStructure": report["passedStructure"],
                "audits": [
                    {
                        "mood": audit["mood"],
                        "shots": audit["shotCount"],
                        "objects": audit["objectCount"],
                        "errors": len(audit["structuralErrors"]),
                        "warnings": audit["warningCounts"],
                    }
                    for audit in audits
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
