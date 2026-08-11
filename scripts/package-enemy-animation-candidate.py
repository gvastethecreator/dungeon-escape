#!/usr/bin/env python3
"""Package one reviewed 512px enemy run into the 160px runtime candidate format."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    run_dir = args.run_dir.resolve()
    output_dir = args.output_dir.resolve()
    validation_path = run_dir / "qa" / "run-validation-report.json"
    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    if validation.get("stage") != "pre-package" or validation.get("status") != "pass":
        raise ValueError(f"run has no passing pre-package gate: {validation_path}")

    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    source_atlas = run_dir / manifest["sprite_sheet_alpha"]
    with Image.open(source_atlas) as opened:
        atlas = opened.convert("RGBA")
    cell_width = int(manifest["animation"]["cellWidth"])
    cell_height = int(manifest["animation"]["cellHeight"])
    if atlas.size != (cell_width * 4, cell_height * 2):
        raise ValueError(f"unexpected source atlas geometry: {atlas.size}")

    runtime_cell = 160
    runtime = Image.new("RGBA", (runtime_cell * 4, runtime_cell * 2), (0, 0, 0, 0))
    state_order = ("idle-step", "attack")
    for row_index, state in enumerate(state_order):
        row = manifest["frame_layout"]["rows"][state]
        if len(row) != 4:
            raise ValueError(f"expected four frames for {state}")
        for frame_index, rect in enumerate(row):
            frame = atlas.crop(
                (
                    int(rect["x"]),
                    int(rect["y"]),
                    int(rect["x"] + rect["w"]),
                    int(rect["y"] + rect["h"]),
                )
            )
            frame = frame.resize(
                (runtime_cell, runtime_cell),
                Image.Resampling.LANCZOS,
            )
            runtime.alpha_composite(frame, (frame_index * runtime_cell, row_index * runtime_cell))

    output_dir.mkdir(parents=True, exist_ok=True)
    png_path = output_dir / "sprite-sheet-runtime.png"
    webp_path = output_dir / "sprite-sheet-runtime.webp"
    runtime.save(png_path, format="PNG", optimize=True)
    runtime.save(webp_path, format="WEBP", lossless=True, quality=100, method=6)

    runtime_states: dict[str, object] = {}
    for row_index, state in enumerate(state_order):
        state_manifest = manifest["animation"]["rows"][state]
        runtime_states[state] = {
            "fps": state_manifest["fps"],
            "loop": state_manifest["loop"],
            "frames": [
                {
                    "x": frame_index * runtime_cell,
                    "y": row_index * runtime_cell,
                    "w": runtime_cell,
                    "h": runtime_cell,
                }
                for frame_index in range(4)
            ],
        }

    candidate = {
        "version": 1,
        "kind": "dungeon-enemy-animation-candidate",
        "source_run": str(run_dir),
        "source_atlas": {
            "path": str(source_atlas),
            "sha256": sha256(source_atlas),
            "size": list(atlas.size),
        },
        "source_validation": {
            "path": str(validation_path),
            "input_fingerprint": validation["input_fingerprint"],
        },
        "runtime": {
            "size": list(runtime.size),
            "cell": [runtime_cell, runtime_cell],
            "pivot": {"x": 80, "bottom": 152},
            "resampling": "lanczos-per-frame",
            "states": runtime_states,
        },
        "outputs": {
            "png": {"path": png_path.name, "sha256": sha256(png_path)},
            "webp": {"path": webp_path.name, "sha256": sha256(webp_path)},
        },
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(candidate, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(candidate, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
