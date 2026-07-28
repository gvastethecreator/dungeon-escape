"""Resize and export leaderboard portrait + frame PNGs for runtime delivery."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
# Prefer grotesque v2 pack; fall back to v1 if a slug is missing there.
SOURCE = ROOT / "assets-source" / "imagegen" / "portraits-v2-grotesque"
SOURCE_FALLBACK = ROOT / "assets-source" / "imagegen" / "portraits-v1"
FRAME_SOURCE = ROOT / "assets-source" / "imagegen" / "portrait-frames-v1"
OUT = ROOT / "public" / "assets" / "ui" / "portraits"
FRAME_OUT = OUT / "frames"
SIZE = 128
FRAME_SIZE = 144

# Order matches src/leaderboard/portraits.ts — append only; never reorder.
ROSTER = [
    ("candlebat", "Candlebat"),
    ("moss-knight", "Moss Knight"),
    ("soup-mimic", "Soup Mimic"),
    ("bone-bard", "Bone Bard"),
    ("cheese-golem", "Cheese Golem"),
    ("mushroom-sage", "Mushroom Sage"),
    ("ash-imp", "Ash Imp"),
    ("frog-wizard", "Frog Wizard"),
    ("lantern-ghost", "Lantern Ghost"),
    ("rat-thief", "Rat Thief"),
    ("crystal-slug", "Crystal Slug"),
    ("teapot-elemental", "Teapot Elemental"),
    ("owl-alchemist", "Owl Alchemist"),
    ("armored-snail", "Armored Snail"),
    ("void-kitten", "Void Kitten"),
    ("pickle-knight", "Pickle Knight"),
    ("spider-librarian", "Spider Librarian"),
    ("ember-salamander", "Ember Salamander"),
    ("cobweb-nun", "Cobweb Nun"),
    ("potato-paladin", "Potato Paladin"),
    ("ice-wisp", "Ice Wisp"),
    ("goblin-chef", "Goblin Chef"),
    ("bone-fish", "Bone Fish"),
    ("stone-gargoyle", "Stone Gargoyle"),
    ("slime-prince", "Slime Prince"),
    ("crow-merchant", "Crow Merchant"),
    ("cactus-monk", "Cactus Monk"),
    ("moth-oracle", "Moth Oracle"),
    ("barrel-ogre", "Barrel Ogre"),
    ("paper-dragon", "Paper Dragon"),
    ("goblin-scout", "Goblin Scout"),
    ("orc-bruiser", "Orc Bruiser"),
    ("swamp-shaman", "Swamp Shaman"),
    ("ash-warlock", "Ash Warlock"),
    ("bone-necromancer", "Bone Necromancer"),
    ("goblin-king", "Goblin King"),
    ("orc-shaman", "Orc Shaman"),
    ("fire-mage", "Fire Mage"),
    ("ice-mage", "Ice Mage"),
    ("ring-courier", "Ring Courier"),
    ("white-staff-elder", "White Staff Elder"),
    ("iron-helm-lord", "Iron Helm Lord"),
    ("green-spiked-brawler", "Spiked Brawler"),
    ("blue-quilled-runner", "Blue Quill Runner"),
    ("red-capped-goblin", "Red Cap Mage"),
    ("hooded-assassin", "Hooded Assassin"),
    ("crystal-sorceress", "Crystal Sorceress"),
    ("rust-paladin", "Rust Paladin"),
    ("slime-knight", "Slime Knight"),
    ("dwarf-brewer", "Dwarf Brewer"),
    ("elf-ranger", "Elf Ranger"),
    ("minotaur-guard", "Minotaur Guard"),
    ("harpy-scout", "Harpy Scout"),
    ("kobold-trapper", "Kobold Trapper"),
    ("vampire-butler", "Vampire Butler"),
    ("witch-apprentice", "Witch Apprentice"),
    ("golem-mason", "Golem Mason"),
    ("naga-oracle", "Naga Oracle"),
    ("goblin-bard", "Goblin Bard"),
    ("orc-engineer", "Orc Engineer"),
    ("cyclops-chef", "Cyclops Chef"),
    ("pixie-thief", "Pixie Thief"),
    ("werewolf-monk", "Werewolf Monk"),
    ("dragon-hatchling", "Dragon Hatchling"),
    ("skeleton-pirate", "Skeleton Pirate"),
    ("troll-gardener", "Troll Gardener"),
    ("fairy-blacksmith", "Fairy Blacksmith"),
    ("basilisk-spy", "Basilisk Spy"),
    ("griffon-rider", "Griffon Rider"),
    ("merfolk-mage", "Merfolk Mage"),
    ("dryad-hunter", "Dryad Hunter"),
    ("clockwork-imp", "Clockwork Imp"),
]

FRAMES = (
    ("frame-wood", "wood"),
    ("frame-gold", "gold"),
    ("frame-silver", "silver"),
    ("frame-bronze", "bronze"),
)


def square_crop(image: Image.Image) -> Image.Image:
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def is_key_fill(r: int, g: int, b: int) -> bool:
    """Black / near-black + residual magenta used as transparent keys."""
    if max(r, g, b) <= 28:
        return True
    # Legacy magenta key from older exports.
    if r >= 190 and b >= 140 and g <= 100 and r + b > g * 3:
        return True
    return False


def flood_clear(pixels, width: int, height: int, seeds: list[tuple[int, int]]) -> None:
    """Clear key-fill pixels connected to seeds (4-connected)."""
    stack = list(seeds)
    seen: set[tuple[int, int]] = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or x < 0 or y < 0 or x >= width or y >= height:
            continue
        seen.add((x, y))
        r, g, b, a = pixels[x, y]
        if a == 0 or not is_key_fill(r, g, b):
            continue
        pixels[x, y] = (0, 0, 0, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))


def grow_hole(pixels, width: int, height: int, radius: int = 1) -> None:
    """Nibble near-black antialias along the hole edge."""
    clear: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0 or max(r, g, b) > 48:
                continue
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] == 0:
                        clear.append((x, y))
                        break
                else:
                    continue
                break
    for x, y in clear:
        pixels[x, y] = (0, 0, 0, 0)


def process_frame(source: Path, target: Path) -> None:
    """Export a frame overlay with transparent center + outer black bg."""
    with Image.open(source) as image:
        rgba = square_crop(image.convert("RGBA"))
        pixels = rgba.load()
        assert pixels is not None
        width, height = rgba.size
        for y in range(height):
            for x in range(width):
                r, g, b, _a = pixels[x, y]
                pixels[x, y] = (r, g, b, 255)

        cx, cy = width // 2, height // 2
        seeds = [
            (cx, cy),
            (0, 0),
            (width - 1, 0),
            (0, height - 1),
            (width - 1, height - 1),
            (cx, 0),
            (cx, height - 1),
            (0, cy),
            (width - 1, cy),
        ]
        flood_clear(pixels, width, height, seeds)
        grow_hole(pixels, width, height, radius=1)

        alpha = rgba.getchannel("A")
        bbox = alpha.getbbox()
        if bbox is None:
            raise RuntimeError(f"Frame has no opaque pixels: {source}")
        rgba = rgba.crop(bbox).resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)
        rgba.save(target, "PNG", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    FRAME_OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for index, (slug, title) in enumerate(ROSTER):
        source = SOURCE / f"{slug}.jpg"
        if not source.exists():
            source = SOURCE_FALLBACK / f"{slug}.jpg"
        if not source.exists():
            raise FileNotFoundError(source)
        target = OUT / f"{slug}.png"
        with Image.open(source) as image:
            square = square_crop(image.convert("RGB"))
            resized = square.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
            resized.save(target, "PNG", optimize=True)
        entries.append(
            {
                "id": index,
                "slug": slug,
                "title": title,
                "src": f"/assets/ui/portraits/{slug}.png",
                "size": SIZE,
            }
        )
        print(f"portrait {slug}: {target.stat().st_size} bytes")

    frame_entries = []
    for slug, kind in FRAMES:
        source = FRAME_SOURCE / f"{slug}.jpg"
        if not source.exists():
            raise FileNotFoundError(source)
        target = FRAME_OUT / f"{slug}.png"
        process_frame(source, target)
        frame_entries.append(
            {
                "id": kind,
                "slug": slug,
                "src": f"/assets/ui/portraits/frames/{slug}.png",
                "size": FRAME_SIZE,
            }
        )
        print(f"frame {slug}: {target.stat().st_size} bytes")

    manifest = {
        "version": 2,
        "count": len(entries),
        "size": SIZE,
        "seedPrefix": "portrait:",
        "frameKey": "black-center-flood",
        "frames": frame_entries,
        "frameByRank": {
            "1": "gold",
            "2": "silver",
            "3": "bronze",
            "default": "wood",
        },
        "entries": entries,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(entries)} portraits + {len(frame_entries)} frames")


if __name__ == "__main__":
    main()
