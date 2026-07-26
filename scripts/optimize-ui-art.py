"""Compress the two opaque generated Dungeon UI scenes for runtime delivery."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "public" / "assets" / "ui"
NAMES = ("dungeon-cover-v1", "dungeon-victory-results-v1")


def main() -> None:
    for name in NAMES:
        source = ROOT / f"{name}.png"
        target = ROOT / f"{name}.webp"
        if not source.exists():
            if not target.exists():
                raise FileNotFoundError(f"Missing both source and optimized asset for {name}")
            print(f"reuse {target.name}: {target.stat().st_size} bytes")
            continue
        with Image.open(source) as image:
            image.convert("RGB").save(target, "WEBP", quality=91, method=6)
        print(f"{source.name}: {source.stat().st_size} -> {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
