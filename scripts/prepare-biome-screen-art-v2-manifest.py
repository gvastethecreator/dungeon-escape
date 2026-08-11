from __future__ import annotations

import json
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
V1 = ROOT / "assets-source/imagegen/biome-screen-art-v1/biome-screen-art-manifest.json"
V2_DIR = ROOT / "assets-source/imagegen/biome-screen-art-v2"
V2 = V2_DIR / "biome-screen-art-manifest.json"

COMMON_PROMPT = (
    "Premium dark landscape pixel-art game key art for Dungeon Escape. Use chunky, intentional "
    "pixel clusters, hard stair-stepped edges, limited-value shading, and no smooth painterly "
    "rendering. The creatures must keep the exact readable silhouettes, anatomy, colors, and "
    "signature features from the supplied current-biome reference sprites, but integrate them "
    "naturally into the scene. Balance grotesque details with compact chibi proportions: oversized "
    "heads, eyes, mouths, claws, or limbs; small bodies; unsettling but charismatic. The recurring "
    "hero is the exact same small faceless round black-headed adventurer from the supplied hero "
    "reference, wearing a ragged black cloak, brown wraps and boots, and carrying a glowing gold "
    "stone. Cinematic 16:9 composition, strong action diagonal, readable silhouettes, deep near-black "
    "shadows, restrained practical lighting, rich biome materials. Show exactly the hero and the "
    "three supplied enemies, with no duplicate creatures and no extra creature species. No text, "
    "letters, numbers, logo, border, UI, watermark, or signature."
)


def scene_prompt(kind: str, biome_prompt: str) -> str:
    if kind == "main":
        action = (
            "Create a complete biome cover. The hero sprints toward the foreground on the right while "
            "all three enemies pursue from the center-right. Keep the left third dark, quiet, and "
            "low-detail for menu copy, while still painting a complete edge-to-edge environment."
        )
    else:
        action = (
            "Create a complete biome ending. The hero reaches the bright biome exit on the left while "
            "all three enemies remain behind in the center-left shadows. Keep the right third dark, "
            "quiet, and low-detail for results copy, while still painting a complete edge-to-edge environment."
        )
    return f"{COMMON_PROMPT} {action} Environment direction: {biome_prompt}"


def main() -> None:
    source = json.loads(V1.read_text(encoding="utf-8"))
    result = {
        "version": 2,
        "generatedWith": "built-in imagegen",
        "generatedAt": date.today().isoformat(),
        "mode": "generate with local identity references",
        "assetType": "landscape pixel-art game screen covers and endings",
        "target": {"width": 836, "height": 470, "format": "webp"},
        "artDirectory": "public/assets/ui/biome-screens",
        "sourceDirectory": "assets-source/imagegen/biome-screen-art-v2/generated",
        "heroReference": "assets-source/imagegen/biome-screen-art-v2/references/runner-reference.png",
        "enemyReferenceDirectory": "assets-source/imagegen/biome-screen-art-v2/references/enemies",
        "enemyReferenceManifest": "assets-source/imagegen/biome-screen-art-v2/references/reference-manifest.json",
        "enemyAtlasPattern": "public/assets/sprites/enemies-v8/biomes/{biome}-enemies.webp",
        "commonPrompt": COMMON_PROMPT,
        "biomes": {},
    }

    for biome, details in source["biomes"].items():
        biome_result = {
            "palette": details["palette"],
            "landmark": details["landmark"],
            "signature": details["signature"],
            "assets": {},
        }
        for kind in ("main", "ending"):
            enemy_names = [Path(name).stem.removeprefix(f"{biome}-") for name in details["enemyReferences"][kind]]
            references = [
                result["heroReference"],
                *[
                    f"{result['enemyReferenceDirectory']}/{biome}-{enemy}.png"
                    for enemy in enemy_names
                ],
            ]
            biome_result["assets"][kind] = {
                "enemies": enemy_names,
                "references": references,
                "prompt": scene_prompt(kind, details[kind]),
                "sourcePng": f"assets-source/imagegen/biome-screen-art-v2/generated/{biome}-{kind}.png",
                "publicWebp": f"public/assets/ui/biome-screens/{biome}-{kind}.webp",
                "publicUrl": details["assets"][kind],
                "status": "pending",
                "sourceSha256": None,
                "publicSha256": None,
                "publicBytes": None,
            }
        result["biomes"][biome] = biome_result

    V2_DIR.mkdir(parents=True, exist_ok=True)
    (V2_DIR / "generated").mkdir(exist_ok=True)
    V2.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "manifest": str(V2), "assets": 22}))


if __name__ == "__main__":
    main()
