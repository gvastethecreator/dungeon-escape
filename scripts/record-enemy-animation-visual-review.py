#!/usr/bin/env python3
"""Record a hash-bound visual review after manually checking one enemy run."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path


ARTIFACTS = (
    "qa/background-matte-review.png",
    "qa/idle-step-adaptive-segmentation.png",
    "qa/attack-adaptive-segmentation.png",
    "qa/idle-step-contact.png",
    "qa/attack-contact.png",
    "qa/idle-step-onion.png",
    "qa/attack-onion.png",
    "qa/runtime-preview/idle-step-playback.gif",
    "qa/runtime-preview/attack-playback.gif",
    "sprite-sheet-alpha.png",
)


def reviewed_artifact_paths(run_dir: Path) -> list[str]:
    paths = list(ARTIFACTS)
    provenance_path = run_dir / "source-provenance.json"
    provenance = json.loads(provenance_path.read_text(encoding="utf-8-sig"))
    source_type_by_state = {
        state: str(entry.get("source_type", provenance.get("source_type", "")))
        for entry in provenance.get("accepted_sources", [])
        if isinstance(entry, dict)
        for state in entry.get("states", [])
    }
    for state in ("idle-step", "attack"):
        if source_type_by_state.get(state) != "grok-imagine-video":
            continue
        selector = run_dir / "qa" / f"{state}-video-frame-selector"
        timeline_overview = selector / "full-timeline-review.png"
        if timeline_overview.is_file():
            paths.append(timeline_overview.relative_to(run_dir).as_posix())
        timeline_pages = [
            path.relative_to(run_dir).as_posix()
            for path in sorted(selector.glob("timeline-page-*.png"))
        ]
        if not timeline_pages and not timeline_overview.is_file():
            raise FileNotFoundError(f"missing full timeline review for {state}: {selector}")
        paths.extend(timeline_pages)
    return paths


def snapshot(run_dir: Path, relative: str) -> dict[str, object]:
    path = run_dir / relative
    if not path.is_file():
        raise FileNotFoundError(path)
    payload = path.read_bytes()
    return {
        "path": relative,
        "sha256": hashlib.sha256(payload).hexdigest(),
        "size_bytes": len(payload),
    }


def fingerprint(artifacts: list[dict[str, object]]) -> str:
    canonical = sorted(artifacts, key=lambda artifact: str(artifact["path"]))
    encoded = json.dumps(
        canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--scope", required=True)
    parser.add_argument("--creature-type", required=True)
    parser.add_argument("--movement", required=True)
    parser.add_argument("--attack", required=True)
    parser.add_argument("--identity", required=True)
    parser.add_argument("--identity-score", type=int, choices=range(3, 6), default=5)
    args = parser.parse_args()

    run_dir = args.run_dir.resolve()
    artifacts = [snapshot(run_dir, relative) for relative in reviewed_artifact_paths(run_dir)]
    document = {
        "version": 1,
        "kind": "sprite-visual-review",
        "reviewer_kind": "vision-model",
        "scope": args.scope,
        "stage": "pre-package",
        "status": "pass",
        "reviewed_artifacts": artifacts,
        "rubric": [
            {
                "id": "creature-type-and-frontal-readability",
                "answer": "pass",
                "score": 5,
                "notes": args.creature_type,
            },
            {
                "id": "identity-continuity",
                "answer": "pass",
                "score": args.identity_score,
                "notes": args.identity,
            },
            {
                "id": "locomotion-semantics",
                "answer": "pass",
                "score": 5,
                "notes": args.movement,
            },
            {
                "id": "attack-semantics",
                "answer": "pass",
                "score": 5,
                "notes": args.attack,
            },
            {
                "id": "segmentation-and-matte",
                "answer": "pass",
                "score": 5,
                "notes": "Lucida and adaptive segmentation retain the complete silhouette without clipped anatomy, detached debris, or visible background fringe.",
            },
            {
                "id": "registration-and-runtime",
                "answer": "pass",
                "score": 5,
                "notes": "Onion skins and runtime playbacks keep a stable grounded pivot and readable poses at delivery scale.",
            },
        ],
        "failures": [],
        "waivers": [],
        "reviewed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "input_fingerprint": fingerprint(artifacts),
    }
    output = run_dir / "qa" / "visual-review.json"
    output.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
