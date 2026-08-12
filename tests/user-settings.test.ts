import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  DEFAULT_USER_SETTINGS,
  USER_SETTINGS_KEY,
  readUserSettings,
  writeUserSettings,
} from "../src/game/UserSettings";
import { applyTextureSmoothing } from "../src/systems/TextureSmoothing";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("persistent user settings", () => {
  test("defaults texture smoothing to off and round-trips bounded volumes", () => {
    const storage = memoryStorage();
    expect(readUserSettings(storage)).toEqual(DEFAULT_USER_SETTINGS);
    expect(
      writeUserSettings(
        {
          musicVolume: 0.35,
          effectsVolume: 0.8,
          textureSmoothing: true,
        },
        storage,
      ),
    ).toBe(true);
    expect(readUserSettings(storage)).toEqual({
      musicVolume: 0.35,
      effectsVolume: 0.8,
      textureSmoothing: true,
    });
    storage.setItem(
      USER_SETTINGS_KEY,
      JSON.stringify({ musicVolume: 4, effectsVolume: -2, textureSmoothing: "yes" }),
    );
    expect(readUserSettings(storage)).toEqual({
      musicVolume: 1,
      effectsVolume: 0,
      textureSmoothing: false,
    });
  });

  test("switches live material textures between nearest and linear sampling", () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    const shaderTexture = new THREE.Texture();
    // Synthetic image so the smoother can touch fully-ready textures only.
    texture.image = { width: 4, height: 4 };
    shaderTexture.image = { width: 4, height: 4 };
    texture.generateMipmaps = true;
    scene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: texture })),
    );
    scene.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(),
        new THREE.ShaderMaterial({ uniforms: { atlas: { value: shaderTexture } } }),
      ),
    );
    expect(applyTextureSmoothing(scene, false)).toBe(2);
    expect(texture.magFilter).toBe(THREE.NearestFilter);
    // Non-mip nearest avoids black uploads on atlases still decoding.
    expect(texture.minFilter).toBe(THREE.NearestFilter);
    expect(shaderTexture.magFilter).toBe(THREE.NearestFilter);
    expect(applyTextureSmoothing(scene, true)).toBe(2);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    // Re-applying the same policy must not bump texture versions (no GPU re-upload).
    const versionBefore = texture.version;
    const shaderVersionBefore = shaderTexture.version;
    expect(applyTextureSmoothing(scene, true)).toBe(2);
    expect(texture.version).toBe(versionBefore);
    expect(shaderTexture.version).toBe(shaderVersionBefore);
  });
});
