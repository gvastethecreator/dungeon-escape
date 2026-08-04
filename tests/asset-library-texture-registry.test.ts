import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { SceneTextureRegistry } from "../src/systems/SceneTextureRegistry";
import { AssetLibrary, ITEM_FRAMES } from "../src/world/AssetLibrary";
import { ENEMY_ANIMATIONS } from "../src/world/EnemySpriteAtlas";

function layerTextures(layer: {
  albedo: THREE.Texture;
  normal: THREE.Texture | null;
  rough: THREE.Texture | null;
  depth: THREE.Texture | null;
}): THREE.Texture[] {
  return [layer.albedo, layer.normal, layer.rough, layer.depth].filter(
    (texture): texture is THREE.Texture => texture !== null,
  );
}

describe("AssetLibrary texture registration", () => {
  test("reapplies the latest policy from asynchronous loader callbacks", () => {
    const prototype = THREE.TextureLoader.prototype;
    const originalLoad = prototype.load;
    const pending: Array<{
      texture: THREE.Texture;
      onLoad: ((texture: THREE.Texture) => void) | undefined;
    }> = [];
    prototype.load = ((_url: string, onLoad?: (texture: THREE.Texture) => void) => {
      const texture = new THREE.Texture({ width: 0, height: 0 });
      pending.push({ texture, onLoad });
      return texture;
    }) as typeof prototype.load;

    try {
      const registry = new SceneTextureRegistry(false);
      const assets = new AssetLibrary(registry);
      expect(registry.diagnostics().pending).toBe(11);

      registry.setSmoothing(true);
      const loaded = pending[0]!;
      loaded.texture.image = { width: 8, height: 8 };
      loaded.onLoad?.(loaded.texture);

      expect(loaded.texture.magFilter).toBe(THREE.LinearFilter);
      expect(loaded.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(registry.diagnostics().pending).toBe(10);
      assets.dispose();
      expect(registry.diagnostics().registered).toBe(0);
    } finally {
      prototype.load = originalLoad;
    }
  });

  test("makes every late loader callback a no-op after disposal", () => {
    const prototype = THREE.TextureLoader.prototype;
    const originalLoad = prototype.load;
    const pending: Array<{
      texture: THREE.Texture;
      onLoad: ((texture: THREE.Texture) => void) | undefined;
    }> = [];
    prototype.load = ((_url: string, onLoad?: (texture: THREE.Texture) => void) => {
      const texture = new THREE.Texture({ width: 0, height: 0 });
      pending.push({ texture, onLoad });
      return texture;
    }) as typeof prototype.load;

    try {
      const registry = new SceneTextureRegistry(false);
      const assets = new AssetLibrary(registry);
      assets.preloadBiome("frost");
      assets.biomeDoorSurface("frost");
      assets.enemyAnimation(ENEMY_ANIMATIONS.goblin);
      assets.item(ITEM_FRAMES.ironKey);
      const disposals = new Map<THREE.Texture, number>();
      for (const { texture } of pending) {
        texture.addEventListener("dispose", () => {
          disposals.set(texture, (disposals.get(texture) ?? 0) + 1);
        });
      }

      assets.dispose();
      const beforeCallbacks = pending.map(({ texture }) => ({
        texture,
        version: texture.version,
        magFilter: texture.magFilter,
        minFilter: texture.minFilter,
      }));
      for (const pendingLoad of pending) {
        pendingLoad.texture.image = { width: 8, height: 8 };
        pendingLoad.onLoad?.(pendingLoad.texture);
      }

      for (const before of beforeCallbacks) {
        expect(before.texture.version).toBe(before.version);
        expect(before.texture.magFilter).toBe(before.magFilter);
        expect(before.texture.minFilter).toBe(before.minFilter);
        expect(disposals.get(before.texture)).toBe(1);
      }
      expect(registry.diagnostics().registered).toBe(0);
      assets.dispose();
      expect([...disposals.values()].every((count) => count === 1)).toBe(true);
    } finally {
      prototype.load = originalLoad;
    }
  });

  test("registers every eager, lazy, animation, and derived frame texture and disposes each once", () => {
    const prototype = THREE.TextureLoader.prototype;
    const originalLoad = prototype.load;
    const created: THREE.Texture[] = [];
    prototype.load = ((url: string) => {
      const texture = new THREE.Texture({ width: 8, height: 8 });
      texture.name = url;
      created.push(texture);
      return texture;
    }) as typeof prototype.load;

    try {
      const registry = new SceneTextureRegistry(false);
      const assets = new AssetLibrary(registry);
      const surfaces = assets.preloadBiome("frost");
      const door = assets.biomeDoorSurface("frost");
      const wallDecor = assets.biomeWallDecorPbr("frost", 2);
      const spriteProp = assets.biomeSpriteProp("frost", 1);
      const animation = assets.enemyAnimation(ENEMY_ANIMATIONS.goblin);
      const enemyFrame = assets.enemy({
        src: "/assets/test/enemy-frame.webp",
        size: [64, 64],
        x: 0,
        y: 0,
        w: 32,
        h: 32,
      });
      const item = assets.item(ITEM_FRAMES.resolveFlask);
      const wallArt = assets.wallArtPbr(1);
      const allTextures = [
        assets.wall,
        assets.wallCrypt,
        assets.wallShrine,
        assets.wallTreasure,
        assets.wallBoss,
        assets.floor,
        assets.floorCrypt,
        assets.floorShrine,
        assets.floorTreasure,
        assets.floorBoss,
        assets.ceiling,
        ...layerTextures(surfaces.floor),
        ...layerTextures(surfaces.wall),
        ...layerTextures(surfaces.ceiling),
        ...Object.values(door),
        ...Object.values(wallDecor),
        spriteProp,
        animation,
        enemyFrame,
        item,
        ...Object.values(wallArt),
      ];
      const uniqueTextures = new Set(allTextures);

      expect(uniqueTextures.size).toBe(created.length);
      expect(registry.diagnostics()).toEqual({
        smoothingEnabled: false,
        registered: uniqueTextures.size,
        pending: 0,
      });
      expect([...uniqueTextures].every((texture) => registry.has(texture))).toBe(true);
      expect(assets.item(ITEM_FRAMES.resolveFlask)).toBe(item);
      expect(registry.diagnostics().registered).toBe(uniqueTextures.size);

      const disposalCounts = new Map<THREE.Texture, number>();
      for (const texture of uniqueTextures) {
        texture.addEventListener("dispose", () => {
          disposalCounts.set(texture, (disposalCounts.get(texture) ?? 0) + 1);
        });
      }
      assets.dispose();
      assets.dispose();

      expect(registry.diagnostics().registered).toBe(0);
      expect([...uniqueTextures].every((texture) => disposalCounts.get(texture) === 1)).toBe(true);
    } finally {
      prototype.load = originalLoad;
    }
  });
});
