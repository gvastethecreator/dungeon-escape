import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import { AtmosphereSystem } from "../src/systems/AtmosphereSystem";
import { getDungeonMood } from "../src/systems/DungeonMood";
import { SceneTextureRegistry } from "../src/systems/SceneTextureRegistry";
import { ControlCurseVfx } from "../src/world/ControlCurseVfx";
import { CullBrandVfx } from "../src/world/CullBrandVfx";
import { LuminousWardVfx } from "../src/world/LuminousWardVfx";
import { createLuminousWardGoldMaterial } from "../src/world/LuminousWardMaterial";
import { MobilityBoostVfx } from "../src/world/MobilityBoostVfx";
import { TimeFreezeVfx } from "../src/world/TimeFreezeVfx";
import { DungeonWorld } from "../src/world/DungeonWorld";
import { createForgeProp } from "../src/world/ForgePropFactory";
import { createDungeonMaterials, disposeDungeonMaterials } from "../src/world/MaterialLibrary";
import {
  hasTaggedOwnedMaterialTextures,
  ThreeResourceDisposer,
} from "../src/world/ThreeResourceDisposer";

function installCanvasDocument(): () => void {
  const previous = globalThis.document;
  const context = {
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    set fillStyle(_value: string) {},
  };
  const image = () => ({
    addEventListener() {},
    removeEventListener() {},
    set src(_value: string) {},
    get src() {
      return "";
    },
  });
  globalThis.document = {
    createElementNS: () => image(),
    createElement: (name: string) =>
      name === "canvas" ? { width: 0, height: 0, getContext: () => context } : image(),
  } as unknown as Document;
  return () => {
    globalThis.document = previous;
  };
}

describe("runtime texture owners", () => {
  test("keeps luminous reward maps owned by the template material", () => {
    const restoreDocument = installCanvasDocument();
    try {
      const registry = new SceneTextureRegistry(true);
      const material = createLuminousWardGoldMaterial({
        compact: true,
        textureSink: registry,
      });
      expect(registry.diagnostics().registered).toBe(1);
      const clone = material.clone();
      const disposer = new ThreeResourceDisposer();
      disposer.disposeOwnedMaterial(clone);
      expect(registry.diagnostics().registered).toBe(1);
      disposer.disposeOwnedMaterial(material);
      expect(registry.diagnostics().registered).toBe(0);
    } finally {
      restoreDocument();
    }
  });

  test("releases only explicitly owned Forge map clones and leaves shared sources alive", () => {
    const registry = new SceneTextureRegistry(true);
    const materials = createDungeonMaterials({ compact: true, textureSink: registry });
    for (const material of Object.values(materials)) {
      for (const texture of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.aoMap,
        material.bumpMap,
      ]) {
        if (!texture || registry.has(texture)) continue;
        texture.image = { width: 8, height: 8 };
        registry.register(texture);
      }
    }
    const sourceCount = registry.diagnostics().registered;
    const grave = createForgeProp({ kind: "grave", x: 0, y: 0 }, materials, registry)!;
    expect(registry.diagnostics().registered).toBeGreaterThan(sourceCount);

    const disposer = new ThreeResourceDisposer();
    const tagged = new Set<THREE.Material>();
    grave.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      const entries = Array.isArray(material) ? material : material ? [material] : [];
      for (const entry of entries) {
        if (hasTaggedOwnedMaterialTextures(entry)) tagged.add(entry);
      }
    });
    expect(tagged.size).toBeGreaterThan(0);
    for (const material of tagged) disposer.disposeOwnedMaterial(material);
    expect(registry.diagnostics().registered).toBe(sourceCount);

    disposer.dispose(grave);
    disposeDungeonMaterials(materials);
    expect(registry.diagnostics().registered).toBe(0);
  });

  test("keeps one app registry across DungeonWorld rebuilds and releases world ownership", () => {
    const restoreDocument = installCanvasDocument();
    const registry = new SceneTextureRegistry(true);
    let world: DungeonWorld | null = null;
    try {
      world = new DungeonWorld(new THREE.Scene(), { textureRegistry: registry });
      const eagerCount = registry.diagnostics().registered;
      expect(eagerCount).toBeGreaterThan(0);
      const dungeon = generateDungeon("WORLD-TEXTURE-REGISTRY", { roomTarget: 10 });

      world.setDungeon(dungeon, getDungeonMood("ash"));
      const builtCount = registry.diagnostics().registered;
      expect(builtCount).toBeGreaterThan(eagerCount);
      world.setDungeon(dungeon, getDungeonMood("ash"));
      expect(registry.diagnostics().registered).toBe(builtCount);

      world.dispose();
      world.dispose();
      expect(registry.diagnostics().registered).toBe(0);
    } finally {
      world?.dispose();
      restoreDocument();
    }
  });

  test("updates each procedural VFX identity once and unregisters on owner disposal", () => {
    const registry = new SceneTextureRegistry(false);
    const owners = [
      new TimeFreezeVfx(2, registry),
      new LuminousWardVfx(registry),
      new CullBrandVfx(registry),
      new ControlCurseVfx(registry),
      new MobilityBoostVfx(undefined, registry),
    ];
    expect(registry.diagnostics()).toEqual({
      smoothingEnabled: false,
      registered: 7,
      pending: 0,
    });

    const textures = new Set<THREE.Texture>();
    for (const owner of owners) {
      owner.root.traverse((object) => {
        const material = (object as THREE.Points).material;
        const entries = Array.isArray(material) ? material : material ? [material] : [];
        for (const entry of entries) {
          if ("map" in entry && entry.map instanceof THREE.Texture) textures.add(entry.map);
          if (entry instanceof THREE.ShaderMaterial) {
            const map = entry.uniforms.map?.value;
            if (map instanceof THREE.Texture) textures.add(map);
          }
        }
      });
    }
    expect(textures.size).toBe(7);
    const versions = new Map([...textures].map((texture) => [texture, texture.version]));
    expect(registry.setSmoothing(true)).toBe(7);
    for (const texture of textures) expect(texture.version).toBe(versions.get(texture)! + 1);
    expect(registry.setSmoothing(true)).toBe(0);
    for (const texture of textures) expect(texture.version).toBe(versions.get(texture)! + 1);

    for (const owner of owners) {
      owner.dispose();
      owner.dispose();
    }
    expect(registry.diagnostics().registered).toBe(0);
  });

  test("keeps persistent atmosphere maps registered across rebuilds and replaces only the mask", () => {
    const registry = new SceneTextureRegistry(true);
    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, 2.4, 4.4, registry);
    expect(registry.diagnostics().registered).toBe(2);

    atmosphere.setDungeon(generateDungeon("ATMOSPHERE-REGISTRY-A", { roomTarget: 10 }));
    expect(registry.diagnostics().registered).toBe(3);
    atmosphere.setDungeon(
      generateDungeon("ATMOSPHERE-REGISTRY-B", { roomTarget: 10 }),
      getDungeonMood("frost"),
    );
    expect(registry.diagnostics().registered).toBe(3);

    atmosphere.dispose();
    atmosphere.dispose();
    expect(registry.diagnostics().registered).toBe(0);
  });
});
