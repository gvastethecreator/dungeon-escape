import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { SceneTextureRegistry } from "../src/systems/SceneTextureRegistry";

class DeferredImage extends EventTarget {
  width = 0;
  height = 0;
  loadListeners = 0;

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (type === "load") this.loadListeners += 1;
    super.addEventListener(type, callback, options);
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    if (type === "load") this.loadListeners -= 1;
    super.removeEventListener(type, callback, options);
  }

  finish(): void {
    this.width = 4;
    this.height = 4;
    this.dispatchEvent(new Event("load"));
  }
}

function readyTexture(): THREE.Texture {
  const texture = new THREE.Texture({ width: 4, height: 4 });
  texture.generateMipmaps = true;
  return texture;
}

describe("SceneTextureRegistry", () => {
  test("updates ready textures without touching unrelated visual state or re-uploading no-op toggles", () => {
    const registry = new SceneTextureRegistry(false);
    const texture = readyTexture();
    texture.name = "registered-atlas";
    texture.wrapS = THREE.MirroredRepeatWrapping;
    texture.repeat.set(3, 5);
    registry.register(texture);

    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(texture.minFilter).toBe(THREE.NearestFilter);
    const nearestVersion = texture.version;
    expect(registry.setSmoothing(false)).toBe(0);
    expect(texture.version).toBe(nearestVersion);

    expect(registry.setSmoothing(true)).toBe(1);
    expect(Number(texture.magFilter)).toBe(THREE.LinearFilter);
    expect(Number(texture.minFilter)).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.version).toBe(nearestVersion + 1);
    expect(texture.name).toBe("registered-atlas");
    expect(texture.wrapS).toBe(THREE.MirroredRepeatWrapping);
    expect(texture.repeat.toArray()).toEqual([3, 5]);
  });

  test("applies the latest mode when a pending image becomes renderable", () => {
    const registry = new SceneTextureRegistry(false);
    const image = new DeferredImage();
    const texture = new THREE.Texture(image);
    texture.generateMipmaps = true;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    registry.register(texture);
    expect(registry.diagnostics()).toEqual({
      smoothingEnabled: false,
      registered: 1,
      pending: 1,
    });
    expect(image.loadListeners).toBe(1);
    expect(registry.setSmoothing(true)).toBe(0);

    image.finish();
    expect(Number(texture.magFilter)).toBe(THREE.LinearFilter);
    expect(Number(texture.minFilter)).toBe(THREE.LinearMipmapLinearFilter);
    expect(registry.diagnostics().pending).toBe(0);
    expect(image.loadListeners).toBe(0);
  });

  test("registers DataTexture, CanvasTexture, and clones without owning their disposal", () => {
    const registry = new SceneTextureRegistry(true);
    const data = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const canvas = new THREE.CanvasTexture({ width: 2, height: 2 } as HTMLCanvasElement);
    const clone = data.clone();
    const textures = [
      registry.register(data),
      registry.register(canvas),
      registry.registerClone(data, clone),
    ];
    let disposals = 0;
    for (const texture of textures) texture.addEventListener("dispose", () => (disposals += 1));

    expect(textures.every((texture) => registry.has(texture))).toBe(true);
    expect(registry.diagnostics().registered).toBe(3);
    expect(registry.unregister(clone)).toBe(true);
    registry.clear();

    expect(registry.diagnostics().registered).toBe(0);
    expect(disposals).toBe(0);
  });

  test("propagates source readiness and the latest smoothing mode to multiple pending clones", () => {
    const registry = new SceneTextureRegistry(false);
    const image = new DeferredImage();
    const source = new THREE.Texture(image);
    const firstClone = source.clone();
    const secondClone = source.clone();
    const textures = [source, firstClone, secondClone];
    for (const texture of textures) {
      texture.generateMipmaps = true;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
    }

    registry.registerClone(source, firstClone);
    registry.registerClone(source, secondClone);
    expect(registry.diagnostics().pending).toBe(3);
    expect(image.loadListeners).toBe(1);
    registry.register(source);
    registry.registerClone(source, firstClone);
    registry.registerClone(source, secondClone);
    expect(image.loadListeners).toBe(1);
    registry.setSmoothing(true);
    registry.setSmoothing(false);
    registry.setSmoothing(true);

    image.finish();

    for (const texture of textures) {
      expect(Number(texture.magFilter)).toBe(THREE.LinearFilter);
      expect(Number(texture.minFilter)).toBe(THREE.LinearMipmapLinearFilter);
    }
    expect(registry.diagnostics().pending).toBe(0);
    expect(image.loadListeners).toBe(0);
  });

  test("keeps remaining clone registrations independent when source or sibling unregisters", () => {
    const registry = new SceneTextureRegistry(false);
    const image = new DeferredImage();
    const source = new THREE.Texture(image);
    const firstClone = source.clone();
    const secondClone = source.clone();
    const textures = [source, firstClone, secondClone];
    let disposals = 0;
    for (const texture of textures) {
      texture.generateMipmaps = true;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.addEventListener("dispose", () => (disposals += 1));
    }
    registry.registerClone(source, firstClone);
    registry.registerClone(source, secondClone);

    expect(registry.unregister(source)).toBe(true);
    expect(image.loadListeners).toBe(1);
    registry.setSmoothing(true);
    image.finish();
    expect(Number(firstClone.magFilter)).toBe(THREE.LinearFilter);
    expect(Number(secondClone.magFilter)).toBe(THREE.LinearFilter);
    expect(source.magFilter).toBe(THREE.NearestFilter);

    expect(registry.unregister(firstClone)).toBe(true);
    registry.setSmoothing(false);
    expect(Number(firstClone.magFilter)).toBe(THREE.LinearFilter);
    expect(secondClone.magFilter).toBe(THREE.NearestFilter);
    registry.clear();
    expect(registry.diagnostics().registered).toBe(0);
    expect(disposals).toBe(0);
  });

  test("keeps one shared listener until the last pending member unregisters", () => {
    const registry = new SceneTextureRegistry(false);
    const image = new DeferredImage();
    const source = new THREE.Texture(image);
    const firstClone = source.clone();
    const secondClone = source.clone();
    registry.registerClone(source, firstClone);
    registry.registerClone(source, secondClone);

    expect(image.loadListeners).toBe(1);
    expect(registry.unregister(source)).toBe(true);
    expect(image.loadListeners).toBe(1);
    expect(registry.unregister(firstClone)).toBe(true);
    expect(image.loadListeners).toBe(1);
    expect(registry.unregister(secondClone)).toBe(true);
    expect(image.loadListeners).toBe(0);
  });

  test("deduplicates distinct group targets and clears both after one readiness refresh", () => {
    const registry = new SceneTextureRegistry(true);
    const sourceImage = new DeferredImage();
    const cloneImage = new DeferredImage();
    const source = new THREE.Texture(sourceImage);
    const clone = new THREE.Texture(cloneImage);
    source.magFilter = clone.magFilter = THREE.NearestFilter;
    source.minFilter = clone.minFilter = THREE.NearestFilter;
    registry.registerClone(source, clone);
    registry.registerClone(source, clone);

    expect(sourceImage.loadListeners).toBe(1);
    expect(cloneImage.loadListeners).toBe(1);
    sourceImage.width = sourceImage.height = 4;
    cloneImage.width = cloneImage.height = 4;
    sourceImage.dispatchEvent(new Event("load"));

    expect(Number(source.magFilter)).toBe(THREE.LinearFilter);
    expect(Number(clone.magFilter)).toBe(THREE.LinearFilter);
    expect(sourceImage.loadListeners).toBe(0);
    expect(cloneImage.loadListeners).toBe(0);
    expect(registry.diagnostics().pending).toBe(0);
  });

  test("merges readiness groups without duplicating their target listeners", () => {
    const registry = new SceneTextureRegistry(false);
    const firstImage = new DeferredImage();
    const secondImage = new DeferredImage();
    const firstSource = new THREE.Texture(firstImage);
    const firstClone = firstSource.clone();
    const secondSource = new THREE.Texture(secondImage);
    const secondClone = secondSource.clone();
    registry.registerClone(firstSource, firstClone);
    registry.registerClone(secondSource, secondClone);

    expect(firstImage.loadListeners).toBe(1);
    expect(secondImage.loadListeners).toBe(1);
    registry.registerClone(firstSource, secondSource);
    registry.registerClone(firstSource, secondSource);

    expect(firstImage.loadListeners).toBe(1);
    expect(secondImage.loadListeners).toBe(1);
    expect(registry.diagnostics()).toEqual({
      smoothingEnabled: false,
      registered: 4,
      pending: 4,
    });
    registry.clear();
    expect(firstImage.loadListeners).toBe(0);
    expect(secondImage.loadListeners).toBe(0);
  });

  test("lets a clone become ready through its own image event", () => {
    const registry = new SceneTextureRegistry(true);
    const sourceImage = new DeferredImage();
    const cloneImage = new DeferredImage();
    const source = new THREE.Texture(sourceImage);
    const clone = new THREE.Texture(cloneImage);
    source.magFilter = clone.magFilter = THREE.NearestFilter;
    source.minFilter = clone.minFilter = THREE.NearestFilter;
    registry.registerClone(source, clone);

    cloneImage.finish();

    expect(Number(clone.magFilter)).toBe(THREE.LinearFilter);
    expect(source.magFilter).toBe(THREE.NearestFilter);
    expect(registry.diagnostics().pending).toBe(1);
    expect(sourceImage.loadListeners).toBe(1);
    registry.clear();
    expect(sourceImage.loadListeners).toBe(0);
    expect(registry.diagnostics().registered).toBe(0);
  });

  test("unregister detaches a pending load listener without applying or disposing", () => {
    const registry = new SceneTextureRegistry(true);
    const image = new DeferredImage();
    const texture = new THREE.Texture(image);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    let disposals = 0;
    texture.addEventListener("dispose", () => (disposals += 1));

    registry.register(texture);
    expect(image.loadListeners).toBe(1);
    expect(registry.unregister(texture)).toBe(true);
    expect(image.loadListeners).toBe(0);
    image.finish();

    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(texture.minFilter).toBe(THREE.NearestFilter);
    expect(disposals).toBe(0);
  });
});
