#!/usr/bin/env python3
"""Lock a selected sprite-grid region to the exact idle frame.

The reviewed motion stays inside ``--animated-box``. Every pixel outside that
box is restored from slot 0, preventing a video model from mutating unrelated
anatomy while preserving the selected articulated motion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_box(value: str) -> tuple[float, float, float, float]:
    parts = tuple(float(part.strip()) for part in value.split(","))
    if len(parts) != 4 or not (0 <= parts[0] < parts[2] <= 1) or not (
        0 <= parts[1] < parts[3] <= 1
    ):
        raise argparse.ArgumentTypeError(
            "animated box must be normalized x0,y0,x1,y1 inside 0..1"
        )
    return parts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--state", required=True)
    parser.add_argument("--animated-box", required=True, type=parse_box)
    parser.add_argument("--reason", required=True)
    args = parser.parse_args()

    run = args.run_dir.resolve()
    raw_path = run / "raw" / f"{args.state}.png"
    report_path = run / "provider" / "grok-imagine" / args.state / "video-source.json"
    provenance_path = run / "source-provenance.json"
    if not raw_path.is_file() or not report_path.is_file() or not provenance_path.is_file():
        raise FileNotFoundError("run is missing raw grid, video source report, or provenance")

    with Image.open(raw_path) as source:
        grid = source.convert("RGB")
    if grid.width % 2 or grid.height % 2:
        raise ValueError(f"expected a 2x2 grid, got {grid.size}")
    cell_w, cell_h = grid.width // 2, grid.height // 2
    idle = grid.crop((0, 0, cell_w, cell_h))
    x0, y0, x1, y1 = args.animated_box
    box = (
        round(x0 * cell_w),
        round(y0 * cell_h),
        round(x1 * cell_w),
        round(y1 * cell_h),
    )

    stabilized = Image.new("RGB", grid.size)
    for slot in range(4):
        sx = (slot % 2) * cell_w
        sy = (slot // 2) * cell_h
        if slot in (0, 3):
            frame = idle.copy()
        else:
            selected = grid.crop((sx, sy, sx + cell_w, sy + cell_h))
            frame = idle.copy()
            frame.paste(selected.crop(box), (box[0], box[1]))
        stabilized.paste(frame, (sx, sy))
    stabilized.save(raw_path, format="PNG", optimize=False)

    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["selection_reviewed"] = True
    report["sampling_mode"] = "manual-reviewed-region-lock"
    report["postprocess"] = {
        "method": "exact-idle-region-lock",
        "animated_box_normalized": list(args.animated_box),
        "animated_box_pixels": list(box),
        "reference_slot": 0,
        "stabilized_slots": [1, 2],
        "exact_idle_slots": [0, 3],
        "reason": args.reason,
    }
    report["output"].update(
        {
            "path": f"raw/{args.state}.png",
            "sha256": sha256(raw_path),
            "size_bytes": raw_path.stat().st_size,
            "width": grid.width,
            "height": grid.height,
        }
    )
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
    matched = False
    for accepted in provenance.get("accepted_sources", []):
        if args.state in accepted.get("states", []):
            accepted["sha256"] = sha256(raw_path)
            accepted["size_bytes"] = raw_path.stat().st_size
            # The provenance schema keeps provider-source entries intentionally
            # narrow. The upstream report is the durable location for derived
            # processing metadata.
            accepted.pop("derived_processing", None)
            matched = True
    if not matched:
        raise ValueError(f"provenance has no accepted source for state {args.state}")
    provenance["notes"] = (
        "accepted through completed $grok-imagine video-from-image invocation, "
        "manual frame review, and documented exact-idle region stabilization"
    )
    provenance_path.write_text(
        json.dumps(provenance, indent=2) + "\n", encoding="utf-8"
    )

    print(
        json.dumps(
            {
                "status": "pass",
                "raw": str(raw_path.relative_to(ROOT)),
                "sha256": sha256(raw_path),
                "animated_box_pixels": box,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
