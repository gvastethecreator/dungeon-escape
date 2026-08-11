#!/usr/bin/env python3
"""Extract the current promoted enemy idles for biome screen-art generation."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "assets-source" / "enemies" / "v8" / "manifest.json"
DEFAULT_OUTPUT = (
    ROOT / "assets-source" / "imagegen" / "biome-screen-art-v2" / "references"
)
RUNNER_SOURCE = (
    ROOT
    / "assets-source"
    / "imagegen"
    / "biome-screen-art-v1"
    / "references"
    / "runner-reference.png"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract 2x nearest-neighbor enemy references from promoted v8 atlases."
    )
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest_path = args.manifest.resolve()
    output_dir = args.output.resolve()
    enemy_dir = output_dir / "enemies"
    contact_dir = output_dir / "contact-sheets"
    enemy_dir.mkdir(parents=True, exist_ok=True)
    contact_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    records: list[dict[str, object]] = []

    shutil.copy2(RUNNER_SOURCE, output_dir / "runner-reference.png")

    for biome, atlas_record in manifest["biome_atlases"].items():
        atlas_path = ROOT / "public" / atlas_record["path"].lstrip("/")
        animation_package_path = ROOT / atlas_record["animation_package"]
        animation_package = json.loads(animation_package_path.read_text(encoding="utf-8"))
        cell_width, cell_height = animation_package["cell"]
        actual_atlas_hash = sha256(atlas_path)
        if actual_atlas_hash != atlas_record["sha256"]:
            raise RuntimeError(
                f"Atlas hash mismatch for {biome}: {actual_atlas_hash} != {atlas_record['sha256']}"
            )

        contact = Image.new("RGB", (1280, 960), (15, 14, 17))
        draw = ImageDraw.Draw(contact)
        with Image.open(atlas_path) as source_image:
            atlas = source_image.convert("RGBA")
            if list(atlas.size) != animation_package["size"]:
                raise RuntimeError(
                    f"Atlas size mismatch for {biome}: {atlas.size} != {animation_package['size']}"
                )
            for index, (enemy, enemy_record) in enumerate(
                animation_package["enemies"].items()
            ):
                movement_row = enemy_record["movement_row"]
                source_x = 0
                source_y = movement_row * cell_height
                box = (
                    source_x,
                    source_y,
                    source_x + cell_width,
                    source_y + cell_height,
                )
                crop = atlas.crop(box).resize((320, 320), Image.Resampling.NEAREST)
                output_path = enemy_dir / f"{biome}-{enemy}.png"
                crop.save(output_path, format="PNG", optimize=True)

                column = index % 4
                row = index // 4
                contact.alpha_composite(
                    crop,
                    (column * 320, row * 320),
                ) if contact.mode == "RGBA" else contact.paste(
                    crop,
                    (column * 320, row * 320),
                    crop,
                )
                draw.rectangle(
                    (column * 320, row * 320 + 292, column * 320 + 319, row * 320 + 319),
                    fill=(8, 8, 10),
                )
                draw.text(
                    (column * 320 + 8, row * 320 + 300),
                    enemy,
                    fill=(230, 224, 208),
                )

                records.append(
                    {
                        "biome": biome,
                        "enemy": enemy,
                        "path": output_path.relative_to(ROOT).as_posix(),
                        "sourceAtlas": atlas_path.relative_to(ROOT).as_posix(),
                        "sourceAtlasSha256": actual_atlas_hash,
                        "sourceAnimationPackage": animation_package_path.relative_to(
                            ROOT
                        ).as_posix(),
                        "sourceRect": [
                            source_x,
                            source_y,
                            cell_width,
                            cell_height,
                        ],
                        "outputSize": [320, 320],
                        "sha256": sha256(output_path),
                    }
                )
        contact.save(contact_dir / f"{biome}-roster.png", format="PNG", optimize=True)

    reference_manifest = {
        "version": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourceManifest": manifest_path.relative_to(ROOT).as_posix(),
        "runnerReference": {
            "path": (output_dir / "runner-reference.png").relative_to(ROOT).as_posix(),
            "sha256": sha256(output_dir / "runner-reference.png"),
        },
        "count": len(records),
        "records": records,
    }
    (output_dir / "reference-manifest.json").write_text(
        json.dumps(reference_manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "ok": True,
                "references": len(records),
                "biomes": len(manifest["biome_atlases"]),
                "output": output_dir.relative_to(ROOT).as_posix(),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
