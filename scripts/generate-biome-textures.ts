/**
 * Biome surface textures are authored with Grok Imagine (non-deterministic).
 *
 * Albedo: public/assets/textures/biomes/{mood}/{floor|wall|ceiling}.png
 * PBR:    {surface}-normal.png, {surface}-rough.png, {surface}-depth.png
 *         baked via Depth Anything V2 (scripts/bake-biome-pbr.py).
 *
 * To regenerate albedo: Grok Imagine image_edit from iron-ash references.
 * To regenerate PBR:    bun run bake:biome-pbr  (needs .venv-pbr + CUDA torch)
 *
 * Runtime: AssetLibrary.getBiomeSurfaces(moodId) + applyBiomeMaps.
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/assets/textures/biomes");
const BIOMES = ["ancient", "molten", "frost", "grim", "verdant", "ash", "iron"] as const;
const SURFACES = ["floor", "wall", "ceiling"] as const;

let missing = 0;
for (const id of BIOMES) {
  for (const surface of SURFACES) {
    const path = join(OUT, id, `${surface}.png`);
    if (!existsSync(path)) {
      console.error(`missing Imagine texture: ${path}`);
      missing += 1;
    } else {
      console.log(`ok ${id}/${surface}.png`);
    }
  }
}
if (missing > 0) {
  console.error(`${missing} missing — regenerate with Grok Imagine, not procedural fill.`);
  process.exit(1);
}
console.log("all 21 Imagine biome textures present");
