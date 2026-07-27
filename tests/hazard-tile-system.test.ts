import { describe, expect, test } from "bun:test";

import type { DungeonData, DungeonRoom } from "../src/dungeon/types";
import { hazardKindsForMood, planHazardTiles } from "../src/world/HazardTileSystem";

function dungeonFixture(): DungeonData {
  const rooms: DungeonRoom[] = Array.from({ length: 10 }, (_, id) => ({
    id,
    x: id * 10,
    y: 2,
    width: 8,
    height: 8,
    center: { x: id * 10 + 4, y: 6 },
    role: id === 0 ? "entrance" : id === 9 ? "exit" : "room",
  }));
  return {
    seed: "HAZARD-MAP",
    seedHash: 1,
    options: {
      width: 110,
      height: 14,
      roomTarget: 10,
      minRoomSize: 8,
      maxRoomSize: 8,
      roomPadding: 2,
      corridorRadius: 1,
      extraConnectionRate: 0,
      placementAttemptsPerRoom: 1,
    },
    grid: Array.from({ length: 14 }, () => new Uint8Array(110)),
    width: 110,
    height: 14,
    rooms,
    edges: [],
    spawn: rooms[0]!.center,
    exit: rooms[9]!.center,
    entranceRoomId: 0,
    exitRoomId: 9,
    distances: new Int32Array(110 * 14),
    topologySignature: "hazard-fixture",
    stats: {
      roomCount: 10,
      floorCount: 640,
      reachableFloorCount: 640,
      edgeCount: 9,
      loopCount: 0,
      exitDistance: 90,
    },
  };
}

describe("biome hazard tiles", () => {
  test("assigns distinct hazards to representative biomes", () => {
    expect(hazardKindsForMood("molten")).toEqual(["fire", "spikes"]);
    expect(hazardKindsForMood("frost")).toEqual(["ice", "spikes"]);
    expect(hazardKindsForMood("sunken")).toEqual(["toxin", "ice"]);
    expect(hazardKindsForMood("fungal")).toEqual(["toxin", "fire"]);
  });

  test("plans a deterministic spread and respects reserved cells", () => {
    const dungeon = dungeonFixture();
    const first = planHazardTiles(dungeon, "molten");
    const excluded = new Set([`${first[0]!.cell.x},${first[0]!.cell.y}`]);
    expect(planHazardTiles(dungeon, "molten")).toEqual(first);
    expect(new Set(first.map((tile) => `${tile.cell.x},${tile.cell.y}`)).size).toBe(first.length);
    expect(planHazardTiles(dungeon, "molten", excluded)).not.toContainEqual(first[0]);
    expect(first.every((tile) => tile.kind === "fire" || tile.kind === "spikes")).toBe(true);
  });

  test("uses the imagegen atlas for animated frames, raised spikes and status effects", async () => {
    const source = await Bun.file(
      new URL("../src/world/HazardTileSystem.ts", import.meta.url),
    ).text();
    expect(source).toContain("hazard-tiles-pixel-v1.webp");
    expect(source).not.toContain("CanvasRenderingContext2D");
    expect(source).toContain("HAZARD_ANIMATION_FRAMES");
    expect(source).toContain("new THREE.ConeGeometry");
    expect(source).toContain('movementScale: kind === "ice" ? 0.82 : 1');
    expect(source).toContain("this.toxinRemaining = 3.2");
    const atlas = Bun.file(
      new URL("../public/assets/textures/hazards/hazard-tiles-pixel-v1.webp", import.meta.url),
    );
    expect(await atlas.exists()).toBe(true);
    expect(atlas.size).toBeLessThan(200_000);
  });
});
