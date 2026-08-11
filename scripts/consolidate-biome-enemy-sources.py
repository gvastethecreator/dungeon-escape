#!/usr/bin/env python3
"""Consolidate approved biome enemy identity sources into assets-source."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / ".scratch" / "biome-enemy-base-sprites"
DESTINATION = ROOT / "assets-source" / "enemies" / "biomes-v2"
BIOMES = [
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
]
ENEMIES = [
    "carrion",
    "goblin",
    "ghost",
    "ratling",
    "husk",
    "imp",
    "zombie-orc",
    "spider",
    "bone-slime",
    "white-eyed-shadow",
    "carrion-stalker",
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def relative(path: Path, root: Path = DESTINATION) -> str:
    return path.relative_to(root).as_posix()


def verify_package() -> dict:
    manifest_path = DESTINATION / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Missing package manifest: {manifest_path}")
    manifest = load_json(manifest_path)
    errors: list[str] = []
    entries = manifest.get("entries", [])
    if len(entries) != len(BIOMES) * len(ENEMIES):
        errors.append(f"Expected 121 entries, found {len(entries)}")
    expected_keys = [f"{biome}/{enemy}" for biome in BIOMES for enemy in ENEMIES]
    if [entry.get("key") for entry in entries] != expected_keys:
        errors.append("Manifest entry order or keys do not match the package contract")

    for entry in entries:
        key = entry["key"]
        for field in ("source", "prompt", "provenance"):
            path = DESTINATION / entry[field]["path"]
            if not path.exists():
                errors.append(f"{key}: missing {field} {path}")
                continue
            if path.stat().st_size != entry[field]["size_bytes"]:
                errors.append(f"{key}: {field} byte count drifted")
            if digest(path) != entry[field]["sha256"]:
                errors.append(f"{key}: {field} hash drifted")
        source_path = DESTINATION / entry["source"]["path"]
        if source_path.exists():
            with Image.open(source_path) as image:
                if list(image.size) != entry["source"]["dimensions"]:
                    errors.append(f"{key}: source dimensions drifted")
        prompt_path = DESTINATION / entry["prompt"]["path"]
        if prompt_path.exists() and not prompt_path.read_text(encoding="utf-8").strip():
            errors.append(f"{key}: prompt is empty")
        provenance_path = DESTINATION / entry["provenance"]["path"]
        if provenance_path.exists():
            provenance = load_json(provenance_path)
            if provenance.get("verificationStatus") != "approved-user":
                errors.append(f"{key}: provenance approval is not approved-user")
            if provenance.get("acceptedSource") != entry["source"]["path"]:
                errors.append(f"{key}: provenance source path does not match")
            if provenance.get("sha256") != entry["source"]["sha256"]:
                errors.append(f"{key}: provenance source hash does not match")
            if provenance.get("promptSha256") != entry["prompt"]["sha256"]:
                errors.append(f"{key}: provenance prompt hash does not match")
            if provenance.get("approval", {}).get("status") != "approved-user":
                errors.append(f"{key}: approval record is not approved-user")
        if entry.get("approval_status") != "approved-user":
            errors.append(f"{key}: approval status is not approved-user")

    result = {
        "version": 1,
        "kind": "biome-enemy-source-package-verification",
        "status": "pass" if not errors else "fail",
        "counts": {
            "biomes": len(BIOMES),
            "enemies_per_biome": len(ENEMIES),
            "entries": len(entries),
        },
        "errors": errors,
    }
    report_path = DESTINATION / "verification-report.json"
    report_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if errors:
        raise RuntimeError("Package verification failed:\n" + "\n".join(errors))
    return result


def consolidate() -> None:
    if DESTINATION.exists():
        raise FileExistsError(
            f"Destination already exists: {DESTINATION}. Use --verify-only for an existing package."
        )

    catalog = load_json(SCRATCH / "catalog.json")
    reviews = load_json(SCRATCH / "reviews.json")["items"]
    staging = DESTINATION.with_name(f"{DESTINATION.name}.staging")
    if staging.exists():
        raise FileExistsError(f"Staging directory already exists: {staging}")

    entries: list[dict] = []
    try:
        for biome in BIOMES:
            for enemy in ENEMIES:
                key = f"{biome}/{enemy}"
                review = reviews.get(key)
                if not review or review.get("status") != "approved-user":
                    raise ValueError(f"{key}: missing approved-user review")

                source_input = SCRATCH / "new" / biome / f"{enemy}.png"
                prompt_input = SCRATCH / "prompts" / biome / f"{enemy}.txt"
                provenance_input = SCRATCH / "provenance" / biome / f"{enemy}.json"
                for path in (source_input, prompt_input, provenance_input):
                    if not path.exists():
                        raise FileNotFoundError(path)

                source_output = staging / "sources" / biome / f"{enemy}.png"
                prompt_output = staging / "prompts" / biome / f"{enemy}.txt"
                provenance_output = staging / "provenance" / biome / f"{enemy}.json"
                source_output.parent.mkdir(parents=True, exist_ok=True)
                prompt_output.parent.mkdir(parents=True, exist_ok=True)
                provenance_output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_input, source_output)
                shutil.copy2(prompt_input, prompt_output)

                original_provenance = load_json(provenance_input)
                consolidated_provenance = {
                    **original_provenance,
                    "verificationStatus": "approved-user",
                    "acceptedSource": f"sources/{biome}/{enemy}.png",
                    "approval": {
                        "status": "approved-user",
                        "date": "2026-08-04",
                        "review_record": ".scratch/biome-enemy-base-sprites/reviews.json",
                        "notes": review.get("notes", ""),
                    },
                    "consolidation": {
                        "package": "assets-source/enemies/biomes-v2",
                        "original_source": f".scratch/biome-enemy-base-sprites/new/{biome}/{enemy}.png",
                        "original_prompt": f".scratch/biome-enemy-base-sprites/prompts/{biome}/{enemy}.txt",
                        "original_provenance": f".scratch/biome-enemy-base-sprites/provenance/{biome}/{enemy}.json",
                    },
                }
                provenance_output.write_text(
                    json.dumps(consolidated_provenance, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )

                with Image.open(source_output) as image:
                    dimensions = list(image.size)
                    mode = image.mode
                entries.append(
                    {
                        "key": key,
                        "biome": biome,
                        "enemy": enemy,
                        "label": catalog["enemies"][enemy]["label"],
                        "approval_status": "approved-user",
                        "review": {
                            "structural": review.get("structural"),
                            "framing": review.get("framing"),
                            "background": review.get("background"),
                            "notes": review.get("notes", ""),
                        },
                        "source": {
                            "path": relative(source_output, staging),
                            "sha256": digest(source_output),
                            "size_bytes": source_output.stat().st_size,
                            "dimensions": dimensions,
                            "mode": mode,
                        },
                        "prompt": {
                            "path": relative(prompt_output, staging),
                            "sha256": digest(prompt_output),
                            "size_bytes": prompt_output.stat().st_size,
                        },
                        "provenance": {
                            "path": relative(provenance_output, staging),
                            "sha256": digest(provenance_output),
                            "size_bytes": provenance_output.stat().st_size,
                        },
                        "animation": {
                            "status": "runtime-integrated" if biome == "ancient" else "not-started",
                            "identity_anchor": f"sources/{biome}/{enemy}.png",
                            "generation_background": "#808080"
                            if enemy == "white-eyed-shadow"
                            else "#000000",
                            "motion_contract": "required-before-generation",
                        },
                    }
                )

        manifest = {
            "version": 1,
            "kind": "dungeon-escape-approved-biome-enemy-sources",
            "approval_date": "2026-08-04",
            "source_type": "imagegen-identity-anchors",
            "counts": {
                "biomes": len(BIOMES),
                "enemies_per_biome": len(ENEMIES),
                "entries": len(entries),
                "approved": len(entries),
            },
            "biome_order": BIOMES,
            "enemy_order": ENEMIES,
            "animation_order": BIOMES[1:],
            "animation_contract": {
                "camera": "front-fps",
                "movement_frames": ["idle", "phase-a", "idle-exact", "phase-b"],
                "attack_frames": ["idle-exact", "anticipation", "contact", "idle-exact"],
                "raw_layout": "2x2-per-state",
                "background_removal": "lucida",
                "lucida_revision": "6ee11122534c8de59402a589d2293c198cfbf848",
                "segmentation": "adaptive",
                "registered_cell": [512, 512],
                "runtime_cell": [160, 160],
                "runtime_pivot": {"x": 80, "bottom": 152},
            },
            "entries": entries,
        }
        (staging / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        decisions_input = (
            ROOT
            / ".scratch"
            / "biome-enemy-animation-spritesheets"
            / "CREATURE_ANIMATION_DECISIONS.md"
        )
        if decisions_input.exists():
            docs = staging / "docs"
            docs.mkdir(parents=True, exist_ok=True)
            shutil.copy2(decisions_input, docs / "ancient-animation-decisions.md")
        staging.rename(DESTINATION)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise

    result = verify_package()
    print(json.dumps(result, indent=2, ensure_ascii=False))


def sync_scratch_approvals() -> None:
    reviews_path = SCRATCH / "reviews.json"
    inventory_path = SCRATCH / "inventory.json"
    reviews = load_json(reviews_path)
    inventory = load_json(inventory_path)
    expected_keys = {f"{biome}/{enemy}" for biome in BIOMES for enemy in ENEMIES}
    review_items = reviews.get("items", {})
    if set(review_items) != expected_keys:
        raise ValueError("Scratch reviews do not match the 121-entry package")
    for key in sorted(expected_keys):
        review_items[key]["status"] = "approved-user"
        biome, enemy = key.split("/", 1)
        provenance_path = SCRATCH / "provenance" / biome / f"{enemy}.json"
        provenance = load_json(provenance_path)
        provenance["verificationStatus"] = "approved-user"
        provenance_path.write_text(
            json.dumps(provenance, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    for entry in inventory.get("entries", []):
        if entry["key"] in expected_keys:
            entry["status"] = "approved-user"
    reviews_path.write_text(
        json.dumps(reviews, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    inventory_path.write_text(
        json.dumps(inventory, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print("Synchronized 121 scratch approvals")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--sync-scratch-approvals", action="store_true")
    args = parser.parse_args()
    if args.sync_scratch_approvals:
        sync_scratch_approvals()
        return
    if args.verify_only:
        result = verify_package()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return
    consolidate()


if __name__ == "__main__":
    main()
