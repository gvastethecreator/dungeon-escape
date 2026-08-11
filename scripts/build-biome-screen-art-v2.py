from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "assets-source/imagegen/biome-screen-art-v2/biome-screen-art-manifest.json"
OPTIMIZATION_MANIFEST_PATH = ROOT / "assets-source/runtime-optimization-manifest.json"
PROOF_DIR = ROOT / ".scratch/proof/biome-screen-art-v2"
TARGET_SIZE = (836, 470)
SOURCE_CROP_SIZE = (1672, 940)
BIOMES = (
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
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_sources(manifest: dict) -> None:
    missing: list[str] = []
    for biome in BIOMES:
        for kind in ("main", "ending"):
            relative = manifest["biomes"][biome]["assets"][kind]["sourcePng"]
            if not (ROOT / relative).is_file():
                missing.append(relative)
    if missing:
        raise FileNotFoundError("Missing source PNGs: " + ", ".join(missing))


def build_asset(source: Path, target: Path) -> tuple[tuple[int, int], str, str, int]:
    with Image.open(source) as image:
        image = image.convert("RGB")
        source_size = image.size
        if image.width != SOURCE_CROP_SIZE[0] or image.height < SOURCE_CROP_SIZE[1]:
            raise ValueError(f"Unexpected source size for {source}: {image.size}")
        cropped = ImageOps.fit(
            image,
            SOURCE_CROP_SIZE,
            method=Image.Resampling.NEAREST,
            centering=(0.5, 0.5),
        )
        output = cropped.resize(TARGET_SIZE, Image.Resampling.NEAREST)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.tmp.webp")
        output.save(temporary, "WEBP", quality=88, method=6)
        os.replace(temporary, target)
    return source_size, sha256(source), sha256(target), target.stat().st_size


def make_contact_sheet(manifest: dict, kind: str) -> Path:
    tile_size = (418, 235)
    label_height = 24
    columns = 3
    rows = 4
    sheet = Image.new("RGB", (columns * tile_size[0], rows * (tile_size[1] + label_height)), "#08090b")
    draw = ImageDraw.Draw(sheet)
    for index, biome in enumerate(BIOMES):
        path = ROOT / manifest["biomes"][biome]["assets"][kind]["publicWebp"]
        with Image.open(path) as image:
            tile = image.convert("RGB").resize(tile_size, Image.Resampling.NEAREST)
        x = (index % columns) * tile_size[0]
        y = (index // columns) * (tile_size[1] + label_height)
        sheet.paste(tile, (x, y))
        draw.text((x + 8, y + tile_size[1] + 5), f"{biome}-{kind}", fill="#f3d38a")
    PROOF_DIR.mkdir(parents=True, exist_ok=True)
    output = PROOF_DIR / f"{kind}-contact-sheet.png"
    sheet.save(output, "PNG", optimize=True)
    return output


def update_runtime_optimization_manifest(manifest: dict) -> None:
    optimization = json.loads(OPTIMIZATION_MANIFEST_PATH.read_text(encoding="utf-8"))
    records = {record["target"]: record for record in optimization["images"]}
    for biome in BIOMES:
        for kind in ("main", "ending"):
            asset = manifest["biomes"][biome]["assets"][kind]
            target = asset["publicWebp"]
            record = records[target]
            record.update(
                {
                    "source": target,
                    "sourceFormat": "webp",
                    "targetFormat": "webp",
                    "sourceDimensions": list(TARGET_SIZE),
                    "targetDimensions": list(TARGET_SIZE),
                    "sourceBytes": asset["publicBytes"],
                    "targetBytes": asset["publicBytes"],
                    "sourceSha256": asset["publicSha256"],
                    "targetSha256": asset["publicSha256"],
                    "resample": "none",
                    "encoding": "quality-88",
                }
            )

    source_bytes = sum(int(record["sourceBytes"]) for record in optimization["images"])
    target_bytes = sum(int(record["targetBytes"]) for record in optimization["images"])
    optimization["summary"].update(
        {
            "images": len(optimization["images"]),
            "converted": 22,
            "skipped": len(optimization["images"]) - 22,
            "sourceBytes": source_bytes,
            "targetBytes": target_bytes,
            "savedBytes": source_bytes - target_bytes,
            "savedPercent": round((1 - target_bytes / source_bytes) * 100, 2)
            if source_bytes
            else 0,
        }
    )
    OPTIMIZATION_MANIFEST_PATH.write_text(
        json.dumps(optimization, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    validate_sources(manifest)

    total_bytes = 0
    for biome in BIOMES:
        for kind in ("main", "ending"):
            record = manifest["biomes"][biome]["assets"][kind]
            source = ROOT / record["sourcePng"]
            target = ROOT / record["publicWebp"]
            source_size, source_hash, public_hash, public_bytes = build_asset(source, target)
            record.update(
                {
                    "status": "integrated",
                    "sourceSize": list(source_size),
                    "sourceSha256": source_hash,
                    "publicSize": list(TARGET_SIZE),
                    "publicSha256": public_hash,
                    "publicBytes": public_bytes,
                }
            )
            total_bytes += public_bytes

    manifest["proof"] = {
        kind: str(make_contact_sheet(manifest, kind).relative_to(ROOT)).replace("\\", "/")
        for kind in ("main", "ending")
    }
    manifest["totalPublicBytes"] = total_bytes
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    update_runtime_optimization_manifest(manifest)
    print(
        json.dumps(
            {
                "ok": True,
                "assets": 22,
                "target": TARGET_SIZE,
                "totalPublicBytes": total_bytes,
                "proof": manifest["proof"],
            }
        )
    )


if __name__ == "__main__":
    main()
