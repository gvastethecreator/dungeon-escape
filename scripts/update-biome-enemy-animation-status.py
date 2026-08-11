#!/usr/bin/env python3
"""Update one batch entry from verified run and runtime candidate evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BATCH = ROOT / ".scratch" / "biome-enemy-animation-video-batch"
DEFAULT_CANDIDATES = (
    ROOT / ".scratch" / "biome-enemy-animation-spritesheets" / "candidates"
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--biome", required=True)
    parser.add_argument("--enemy", required=True)
    parser.add_argument("--batch-root", type=Path, default=DEFAULT_BATCH)
    parser.add_argument("--candidate-root", type=Path, default=DEFAULT_CANDIDATES)
    args = parser.parse_args()

    run = args.batch_root / "runs" / args.biome / args.enemy
    validation_path = run / "qa" / "run-validation-report.json"
    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    if not validation.get("ok") or validation.get("status") != "pass":
        raise ValueError(f"pre-package validation did not pass: {validation_path}")

    provenance_path = run / "source-provenance.json"
    provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
    accepted_by_state = {
        state: source
        for source in provenance.get("accepted_sources", [])
        if isinstance(source, dict)
        for state in source.get("states", [])
    }
    selected: dict[str, list[int]] = {}
    state_sources: dict[str, dict[str, object]] = {}
    for state in ("idle-step", "attack"):
        source = accepted_by_state.get(state)
        if not isinstance(source, dict):
            raise ValueError(f"missing accepted provenance for {state}: {provenance_path}")
        source_type = str(source.get("source_type", provenance.get("source_type", "")))
        state_sources[state] = {
            "source_type": source_type,
            "path": source["path"],
            "sha256": source["sha256"],
        }
        if source_type == "grok-imagine-video":
            selector_path = run / "qa" / f"{state}-video-frame-selector" / "selector.evidence.json"
            selector = json.loads(selector_path.read_text(encoding="utf-8"))
            indices = selector.get("selected_indices")
            if not isinstance(indices, list) or len(indices) != 4:
                raise ValueError(f"expected four selected indices: {selector_path}")
            selected[state] = indices

    candidate = args.candidate_root / args.biome / args.enemy
    candidate_manifest_path = candidate / "manifest.json"
    candidate_manifest = json.loads(candidate_manifest_path.read_text(encoding="utf-8"))
    if candidate_manifest.get("runtime", {}).get("size") != [640, 320]:
        raise ValueError(f"invalid runtime candidate: {candidate_manifest_path}")
    candidate_png = candidate / candidate_manifest["outputs"]["png"]["path"]
    if sha256(candidate_png) != candidate_manifest["outputs"]["png"]["sha256"]:
        raise ValueError(f"candidate hash mismatch: {candidate_png}")
    run_atlas = run / "sprite-sheet-alpha.png"
    if candidate_manifest.get("source_atlas", {}).get("sha256") != sha256(run_atlas):
        raise ValueError(f"candidate was packaged from a stale source atlas: {candidate_manifest_path}")
    if (
        candidate_manifest.get("source_validation", {}).get("input_fingerprint")
        != validation.get("input_fingerprint")
    ):
        raise ValueError(f"candidate was packaged before the current validation: {candidate_manifest_path}")

    manifest_path = args.batch_root / "batch-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entry = next(
        (
            entry
            for entry in manifest["entries"]
            if entry["biome"] == args.biome and entry["enemy"] == args.enemy
        ),
        None,
    )
    if entry is None:
        source = ROOT / "assets-source" / "enemies" / "biomes-v2" / "sources" / args.biome / f"{args.enemy}.png"
        if not source.is_file():
            raise FileNotFoundError(f"missing approved identity source: {source}")
        entry = {
            "biome": args.biome,
            "enemy": args.enemy,
            "source": source.relative_to(ROOT).as_posix(),
            "source_sha256": sha256(source),
            "run": run.relative_to(ROOT).as_posix(),
            "states": {},
        }
        manifest["entries"].append(entry)
        manifest["entries"].sort(key=lambda item: (item["biome"], item["enemy"]))
    entry["states"] = {"idle-step": "reviewed", "attack": "reviewed"}
    entry["review"] = {
        "status": "pass",
        "selected_indices": selected,
        "state_sources": state_sources,
        "validation": validation_path.relative_to(ROOT).as_posix(),
        "validation_fingerprint": validation["input_fingerprint"],
        "candidate": candidate.relative_to(ROOT).as_posix(),
        "candidate_sha256": sha256(candidate_png),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(entry, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
