import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  DEFAULT_MODEL_QA_ID,
  MODEL_QA_LOAD_TIMEOUT_MS,
  MODEL_QA_CATALOG,
  MODEL_QA_REFERENCE_COUNT,
  MODEL_QA_VIEWS,
  collectModelQaMetrics,
  createIdempotentCleanup,
  createModelQaLoadBarrier,
  createModelQaModel,
  createModelQaState,
  disposeModelQaResources,
  frameModelQaCamera,
  getModelQaBounds,
  parseModelQaQuery,
  settleModelQaState,
} from "../src/model-lab";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

describe("model QA lab", () => {
  test("allows a cold PBR texture load to finish before timing out", () => {
    expect(MODEL_QA_LOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
  });

  test("capture proof outlives the load barrier and audits late network failures", async () => {
    const source = await Bun.file(new URL("../scripts/cdp-model-lab.ts", import.meta.url)).text();
    expect(source).toContain("MODEL_WAIT_TIMEOUT_MS = 30_000");
    expect(source).toContain("NETWORK_IDLE_TIMEOUT_MS = 45_000");
    expect(source).toContain('send(ws, "Network.enable")');
    expect(source).toContain('send(ws, "Network.setCacheDisabled"');
    expect(source).toContain("cacheDisabled: shotIndex === 0");
    expect(source).toContain("networkErrors");
    expect(source).toContain("reconcileCompletedResourceTimings");
    expect(source).toContain("entry.responseEnd > 0 && pending.has(entry.name)");
    expect(source).toContain("cdp-model-lab-profile-${process.pid}-${Date.now()}");
    expect(source).toContain("MODEL_QA_MOOD");
    expect(source).toContain("MODEL_QA_CDP_PORT");
    expect(source).toContain('shot === "--all" || shot === "--all-six" || shot === "--all-doors"');
    expect(source).toContain('allFlag === "--all-six"');
    expect(source).toContain('allFlag === "--all-doors"');
    expect(source).toContain("matched-door-moods");
    expect(source).toContain('["front", "right", "back", "left", "rear-left", "top"]');
    expect(source).toContain("capture-manifest.json");
    expect(source).toContain("mood: qa.mood");
  });

  test("isolated lab prevents favicon noise and exposes a visible keyboard focus", async () => {
    const html = await Bun.file(new URL("../model-lab.html", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/model-lab.css", import.meta.url)).text();
    expect(html).toContain('<link rel="icon" href="data:," />');
    expect(css).toContain("#model-lab-canvas:focus-visible");
    expect(css).toContain("outline: 2px solid #91b7b0");
  });

  test("lists every accepted reference before optional runtime variants", async () => {
    const manifest = (await Bun.file(
      new URL("../assets-source/imagegen/model-references-v2/manifest.json", import.meta.url),
    ).json()) as { objects: Array<{ id: string }> };
    const rosterIds = MODEL_QA_CATALOG.slice(0, MODEL_QA_REFERENCE_COUNT).map(({ id }) => id);
    expect(MODEL_QA_REFERENCE_COUNT).toBe(55);
    expect(JSON.stringify(rosterIds)).toBe(JSON.stringify(manifest.objects.map(({ id }) => id)));
    expect(MODEL_QA_CATALOG.slice(MODEL_QA_REFERENCE_COUNT).map(({ id }) => id)).toEqual([
      "door-ancient",
      "door-molten",
      "door-frost",
      "door-grim",
      "door-verdant",
      "door-ash",
      "door-iron",
      "door-obsidian",
      "door-sunken",
      "door-fungal",
      "door-backrooms",
      "annihilation-pulse",
    ]);
  });

  test("parses canonical model and view queries with safe fallbacks", () => {
    expect(parseModelQaQuery("?model=crypt-stone&view=top")).toEqual({
      id: "crypt-stone",
      view: "top",
      mood: "neutral",
      errors: [],
    });

    const fallback = parseModelQaQuery("?model=missing&view=diagonal");
    expect(fallback.id).toBe(DEFAULT_MODEL_QA_ID);
    expect(fallback.view).toBe("front");
    expect(fallback.mood).toBe("neutral");
    expect(fallback.errors).toHaveLength(2);

    expect(parseModelQaQuery("?model=treasure-chest&view=front&mood=frost")).toMatchObject({
      id: "treasure-chest",
      view: "front",
      mood: "frost",
      errors: [],
    });
    expect(parseModelQaQuery("?model=treasure-chest&view=front&mood=neutral")).toMatchObject({
      mood: "neutral",
      errors: [],
    });
    const invalidMood = parseModelQaQuery("?mood=studio");
    expect(invalidMood.mood).toBe("neutral");
    expect(invalidMood.errors).toEqual(["Unknown mood “studio”; using neutral lighting."]);

    for (const view of MODEL_QA_VIEWS) {
      expect(parseModelQaQuery(`?model=treasure-chest&view=${view}`)).toMatchObject({
        id: "treasure-chest",
        view,
      });
    }
  });

  test("publishes an explicit loading contract and settles once", () => {
    const state = createModelQaState(parseModelQaQuery("?model=treasure-chest&view=left"));
    expect(state).toMatchObject({
      ready: false,
      status: "loading",
      settled: false,
      destroyed: false,
      id: "treasure-chest",
      view: "left",
      mood: "neutral",
      bounds: null,
      errors: [],
    });
    expect(typeof state.destroy).toBe("function");

    settleModelQaState(state, "ready");
    expect(state).toMatchObject({ ready: true, status: "ready", settled: true });
    settleModelQaState(state, "error", ["late error"]);
    expect(state).toMatchObject({ ready: true, status: "ready", errors: [] });

    const failed = createModelQaState(parseModelQaQuery(""));
    settleModelQaState(failed, "error", ["texture failed"]);
    expect(failed).toMatchObject({
      ready: false,
      status: "error",
      settled: true,
      errors: ["texture failed"],
    });
  });

  test("waits for cached and active LoadingManager items before readiness", async () => {
    const manager = new THREE.LoadingManager();
    const originalStart = manager.itemStart;
    const originalEnd = manager.itemEnd;
    const originalError = manager.itemError;
    const barrier = createModelQaLoadBarrier(manager, 100);
    let settled = false;
    void barrier.result.then(() => {
      settled = true;
    });

    manager.itemStart("cached.png");
    manager.itemEnd("cached.png");
    manager.itemStart("cold.png");
    barrier.seal();
    await Promise.resolve();
    expect(settled).toBe(false);

    manager.itemEnd("cold.png");
    expect(await barrier.result).toEqual({ status: "ready", errors: [] });
    expect(manager.itemStart).toBe(originalStart);
    expect(manager.itemEnd).toBe(originalEnd);
    expect(manager.itemError).toBe(originalError);
  });

  test("turns LoadingManager failures and timeouts into terminal errors", async () => {
    const failedManager = new THREE.LoadingManager();
    const failedBarrier = createModelQaLoadBarrier(failedManager, 100);
    failedManager.itemStart("blocked.png");
    failedBarrier.seal();
    failedManager.itemError("blocked.png");
    failedManager.itemEnd("blocked.png");
    expect(await failedBarrier.result).toEqual({
      status: "error",
      errors: ["Texture load failed: blocked.png"],
    });

    const timeoutManager = new THREE.LoadingManager();
    const originalStart = timeoutManager.itemStart;
    const timeoutBarrier = createModelQaLoadBarrier(timeoutManager, 10);
    timeoutManager.itemStart("stalled.png");
    timeoutBarrier.seal();
    expect(await timeoutBarrier.result).toEqual({
      status: "error",
      errors: ["Texture load timed out: stalled.png"],
    });
    expect(timeoutManager.itemStart).toBe(originalStart);
    timeoutManager.itemEnd("stalled.png");
  });

  test("cancels loading and runs every cleanup action once", async () => {
    const manager = new THREE.LoadingManager();
    const originalStart = manager.itemStart;
    const barrier = createModelQaLoadBarrier(manager, 100);
    manager.itemStart("cancelled.png");
    barrier.seal();
    barrier.cancel();
    barrier.cancel();
    expect(await barrier.result).toEqual({ status: "cancelled", errors: [] });
    expect(manager.itemStart).toBe(originalStart);
    manager.itemEnd("cancelled.png");

    const calls = [0, 0, 0];
    const cleanup = createIdempotentCleanup([
      () => {
        calls[0]! += 1;
      },
      () => {
        calls[1]! += 1;
        throw new Error("cleanup failure");
      },
      () => {
        calls[2]! += 1;
      },
    ]);
    expect(cleanup()).toEqual(["cleanup failure"]);
    expect(cleanup()).toEqual(["cleanup failure"]);
    expect(calls).toEqual([1, 1, 1]);
  });

  test("disposes shared model resources once per cleanup", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    let geometryDisposals = 0;
    let materialDisposals = 0;
    let textureDisposals = 0;
    geometry.dispose = () => {
      geometryDisposals += 1;
    };
    material.dispose = () => {
      materialDisposals += 1;
    };
    texture.dispose = () => {
      textureDisposals += 1;
    };

    disposeModelQaResources(root, null);
    expect({ geometryDisposals, materialDisposals, textureDisposals }).toEqual({
      geometryDisposals: 1,
      materialDisposals: 1,
      textureDisposals: 1,
    });
  });

  test("creates real catalog roots with finite Box3 bounds and model metrics", () => {
    const materials = createDungeonMaterials({ compact: true });
    for (const { id } of MODEL_QA_CATALOG) {
      const root = createModelQaModel(id, materials);
      const bounds = getModelQaBounds(root);
      const metrics = collectModelQaMetrics(root);

      expect(bounds.radius).toBeGreaterThan(0);
      expect(bounds.size.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(metrics.triangles).toBeGreaterThan(0);
      expect(metrics.geometries).toBeGreaterThan(0);
      expect(metrics.materials).toBeGreaterThan(0);
      expect(metrics.textures).toBeGreaterThan(0);
      expect(metrics.calls).toBeNull();
    }
  });

  test("frames Box3 bounds from the requested canonical camera direction", () => {
    const root = createModelQaModel("reliquary-altar", createDungeonMaterials({ compact: true }));
    const bounds = getModelQaBounds(root);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);

    frameModelQaCamera(camera, bounds, "right", 16 / 9);
    expect(camera.position.x).toBeGreaterThan(bounds.center[0]);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(camera.near);

    frameModelQaCamera(camera, bounds, "top", 1);
    expect(camera.position.y).toBeGreaterThan(bounds.center[1]);

    frameModelQaCamera(camera, bounds, "rear-left", 4 / 3);
    expect(camera.position.x).toBeLessThan(bounds.center[0]);
    expect(camera.position.z).toBeLessThan(bounds.center[2]);
  });

  test("keeps the six-view contract while making door right views oblique", () => {
    expect(MODEL_QA_VIEWS).toEqual(["front", "right", "back", "left", "rear-left", "top"]);
    const bounds = getModelQaBounds(
      createModelQaModel("door-frost", createDungeonMaterials({ compact: true })),
    );
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);

    frameModelQaCamera(camera, bounds, "right", 4 / 3, "door-frost");
    const offset = camera.position.sub(new THREE.Vector3(...bounds.center));
    const yawDegrees = THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z));
    expect(yawDegrees).toBeGreaterThanOrEqual(25);
    expect(yawDegrees).toBeLessThanOrEqual(40);
    expect(offset.x).toBeGreaterThan(0);
    expect(offset.z).toBeGreaterThan(0);
  });

  test("uses useful canonical views for floor and ceiling mounted models", () => {
    const materials = createDungeonMaterials({ compact: true });
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    const signalBounds = getModelQaBounds(createModelQaModel("boss-room-signal", materials));

    frameModelQaCamera(camera, signalBounds, "front", 4 / 3, "boss-room-signal");
    expect(camera.position.y).toBeGreaterThan(signalBounds.center[1]);
    expect(camera.position.z).toBeGreaterThan(signalBounds.center[2]);

    const signalFront = camera.position.clone();
    frameModelQaCamera(camera, signalBounds, "top", 4 / 3, "boss-room-signal");
    expect(camera.position.y).toBeGreaterThan(signalBounds.center[1]);
    expect(camera.position.z).toBeCloseTo(signalBounds.center[2], 5);
    expect(camera.position.distanceTo(signalFront)).toBeGreaterThan(0.1);

    const rootsBounds = getModelQaBounds(createModelQaModel("ground-root-tangle", materials));
    frameModelQaCamera(camera, rootsBounds, "front", 4 / 3, "ground-root-tangle");
    expect(camera.position.y).toBeGreaterThan(rootsBounds.center[1]);
    expect(camera.position.z).toBeGreaterThan(rootsBounds.center[2]);

    const fixtureBounds = getModelQaBounds(createModelQaModel("fluorescent-fixture", materials));
    frameModelQaCamera(camera, fixtureBounds, "front", 4 / 3, "fluorescent-fixture");
    expect(camera.position.y).toBeLessThan(fixtureBounds.center[1]);
  });

  test("maps the campfire entry to the batched production assembly", () => {
    const campfire = createModelQaModel(
      "floor-campfire",
      createDungeonMaterials({ compact: true }),
    );
    expect(campfire.getObjectByName("Floor campfire VFX")).toBeDefined();
    expect(campfire.userData.sculptRuntime.runtimeBatching).toMatchObject({
      sourceMeshes: 18,
      drawCalls: 3,
      materialBatches: 3,
    });
    expect(collectModelQaMetrics(campfire)).toMatchObject({
      triangles: 616,
      geometries: 3,
      materials: 3,
    });
  });

  test("measures only visible model branches and omits tagged VFX", () => {
    const root = new THREE.Group();
    const visible = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    const hiddenBranch = new THREE.Group();
    hiddenBranch.visible = false;
    hiddenBranch.add(
      new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshStandardMaterial()),
    );
    const vfxBranch = new THREE.Group();
    vfxBranch.userData.vfxOnly = true;
    vfxBranch.add(new THREE.Mesh(new THREE.BoxGeometry(60, 60, 60), new THREE.MeshBasicMaterial()));
    root.add(visible, hiddenBranch, vfxBranch);

    expect(collectModelQaMetrics(root)).toMatchObject({
      triangles: 12,
      geometries: 1,
      materials: 1,
    });
    expect(getModelQaBounds(root).size).toEqual([1, 1, 1]);
  });

  test("applies the requested biome door plate in mood captures", () => {
    const door = createModelQaModel(
      "dungeon-door",
      createDungeonMaterials({ compact: true }),
      "frost",
    );
    const leaf = door.getObjectByName("Left closed iron-bound door leaf") as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    expect(leaf.material.map?.name).toBe("/assets/textures/biomes/frost/door.png");
    expect(leaf.material.normalMap?.name).toBe("/assets/textures/biomes/frost/door-normal.png");
    expect(leaf.material.roughnessMap?.name).toBe(
      "/assets/textures/biomes/frost/door-roughness.png",
    );
    expect(leaf.material.metalnessMap?.name).toBe(
      "/assets/textures/biomes/frost/door-metalness.png",
    );
    expect(leaf.material.metalness).toBe(1);
  });

  test("uses representative biome plates for neutral door inspection", () => {
    const materials = createDungeonMaterials({ compact: true });
    const dungeonDoor = createModelQaModel("dungeon-door", materials, "neutral");
    const officeDoor = createModelQaModel("office-door", materials, "neutral");
    const dungeonLeaf = dungeonDoor.getObjectByName(
      "Left closed iron-bound door leaf",
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const officeLeaf = officeDoor.getObjectByName(
      "Left closed iron-bound door leaf",
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

    expect(dungeonLeaf.material.map?.name).toBe("/assets/textures/biomes/ancient/door.png");
    expect(officeLeaf.material.map?.name).toBe("/assets/textures/biomes/backrooms/door.png");
  });
});
