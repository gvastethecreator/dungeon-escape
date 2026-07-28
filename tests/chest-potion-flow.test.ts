import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  canCollectPickup,
  canInteractWithChest,
  chestRewardAutoActivates,
  CHEST_INTERACTION_DISTANCE,
  PICKUP_COLLECTION_DISTANCE,
} from "../src/world/StaticDungeonScene";
import { createForgeChest } from "../src/world/ForgePropFactory";
import { createResolveFlask } from "../src/world/ItemFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

describe("chest potion flow", () => {
  test("only offers a closed chest within the deliberate interaction range", () => {
    expect(canInteractWithChest(CHEST_INTERACTION_DISTANCE, false)).toBe(true);
    expect(canInteractWithChest(CHEST_INTERACTION_DISTANCE + 0.001, false)).toBe(false);
    expect(canInteractWithChest(0.5, true)).toBe(false);
    expect(canInteractWithChest(Number.NaN, false)).toBe(false);
  });

  test("automatically collects and activates both power rewards after their chest reveal", () => {
    expect(chestRewardAutoActivates("time-freeze")).toBe(true);
    expect(chestRewardAutoActivates("luminous-ward")).toBe(true);
    expect(chestRewardAutoActivates("resolve")).toBe(false);
    expect(canCollectPickup(Number.POSITIVE_INFINITY, true)).toBe(true);
    expect(canCollectPickup(PICKUP_COLLECTION_DISTANCE, false)).toBe(true);
    expect(canCollectPickup(PICKUP_COLLECTION_DISTANCE + 0.001, false)).toBe(false);
  });

  test("spreads two time-freeze and two luminous-ward chests along route depth", async () => {
    const staticSceneSource = await Bun.file(
      new URL("../src/world/StaticDungeonScene.ts", import.meta.url),
    ).text();
    expect(staticSceneSource).toContain(
      "Power chests: two time-freeze + two luminous-ward, spread along route",
    );
    expect(staticSceneSource).toContain('for (const fraction of [0.28, 0.72] as const)');
    expect(staticSceneSource).toContain('for (const fraction of [0.42, 0.88] as const)');
  });

  test("keeps the lid on a real rear hinge for the open animation", () => {
    const chest = createForgeChest(createDungeonMaterials());
    expect(chest.lid.name).toBe("Chest lid hinge");
    expect(chest.lid.parent).toBe(chest.root);
    expect(chest.lid.position.z).toBeLessThan(0);
    expect(chest.lid.getObjectByName("Chest arched lid")).toBeDefined();
    expect(chest.root.getObjectByName("Chest lock")).toBeDefined();
  });

  test("uses the sculpted flask silhouette, cage, cross and pickup anchors", () => {
    const flask = createResolveFlask(createDungeonMaterials());
    const bounds = new THREE.Box3().setFromObject(flask).getSize(new THREE.Vector3());
    const runtime = flask.userData.sculptRuntime as {
      sockets: { pickup: THREE.Object3D; glow: THREE.Object3D };
      colliders: Array<{ type: string; isTrigger: boolean }>;
    };

    expect(bounds.x).toBeGreaterThan(0.55);
    expect(bounds.y).toBeGreaterThan(0.75);
    expect(flask.getObjectByName("Resolve flask liquid")).toBeDefined();
    expect(flask.getObjectByName("Flask front iron cage")).toBeDefined();
    expect(flask.getObjectByName("Flask side iron cage")).toBeDefined();
    expect(flask.getObjectByName("Raised resolve cross")).toBeDefined();
    expect(runtime.sockets.pickup.name).toBe("Resolve pickup anchor");
    expect(runtime.sockets.glow.name).toBe("Resolve glow anchor");
    expect(runtime.colliders[0]).toMatchObject({ type: "sphere", isTrigger: true });
  });
});
