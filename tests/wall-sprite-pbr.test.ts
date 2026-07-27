import { describe, expect, test } from "bun:test";

const worldSource = await Bun.file(new URL("../src/world/DungeonWorld.ts", import.meta.url)).text();
const assetSource = await Bun.file(new URL("../src/world/AssetLibrary.ts", import.meta.url)).text();

describe("flat wall sprite material contract", () => {
  test("ships every derived atlas companion", async () => {
    const moods = [
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
    ];
    for (const mood of moods) {
      for (const kind of ["depth", "normal", "rough"]) {
        const file = Bun.file(
          new URL(
            `../public/assets/sprites/biomes/${mood}-wall-decor-${kind}.png`,
            import.meta.url,
          ),
        );
        expect(await file.exists()).toBe(true);
        expect(file.size).toBeGreaterThan(4_000);
      }
    }
    for (const kind of ["depth", "normal", "rough"]) {
      const file = Bun.file(
        new URL(`../public/assets/sprites/iron-ash-wall-art-${kind}.png`, import.meta.url),
      );
      expect(await file.exists()).toBe(true);
      expect(file.size).toBeGreaterThan(4_000);
    }
  });

  test("keeps square atlas cells flat and uniformly scaled", () => {
    expect(worldSource).toContain("new THREE.PlaneGeometry(spriteSize, spriteSize)");
    expect(worldSource).toContain("this.tempScale.set(spriteScale, spriteScale, 1)");
    expect(worldSource).not.toContain("createPictureFrameGeometry");
    expect(worldSource).not.toContain("wall decor dimensional frames");
  });

  test("binds derived PBR maps while leaving depth off the geometry", () => {
    expect(worldSource).toContain("normalMap: textures.normal");
    expect(worldSource).toContain("roughnessMap: textures.rough");
    expect(worldSource).toContain("material.userData.depthTexture = textures.depth");
    expect(worldSource).not.toContain("displacementMap: textures.depth");
    expect(assetSource).toContain("biomeWallDecorPbr");
    expect(assetSource).toContain("wallArtPbr");
  });
});
