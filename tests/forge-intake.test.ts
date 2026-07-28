import { describe, expect, test } from "bun:test";

import { parseForgeDungeonMessage } from "../src/dungeon/forgeIntake";
import type { ForgeDungeonPayload } from "../src/dungeon/importDungeonForge";

const W = 7;
const H = 5;
const cell = (x: number, y: number) => y * W + x;

function makeForgeMessage(): {
  type: string;
  version: number;
  dungeon: ForgeDungeonPayload;
} {
  const grid = new Uint8Array(W * H);
  for (let x = 1; x <= 5; x += 1) grid[cell(x, 2)] = 1;
  grid[cell(3, 1)] = 3;
  const roomId = new Int16Array(W * H).fill(-1);
  for (const x of [1, 2]) roomId[cell(x, 2)] = 0;
  for (const x of [4, 5]) roomId[cell(x, 2)] = 1;
  const corridor = new Uint8Array(W * H);
  corridor[cell(3, 2)] = 1;
  const bfs = new Int16Array(W * H).fill(-1);
  for (let x = 1; x <= 5; x += 1) bfs[cell(x, 2)] = x - 1;

  return {
    type: "black-flag:forge-dungeon",
    version: 1,
    dungeon: {
      valid: true,
      seed: 1337,
      name: "Intake Crypt",
      W,
      H,
      grid,
      roomId,
      corridor,
      doorway: corridor.slice(),
      bfs,
      rooms: [
        { id: 0, cx: 1, cy: 2, w: 2, h: 1, type: "entrance", depth: 0 },
        { id: 1, cx: 5, cy: 2, w: 2, h: 1, type: "boss", depth: 1 },
      ],
      edges: [{ a: 0, b: 1, isLoop: false }],
      entrance: 0,
      boss: 1,
      props: [{ kind: "banner", x: 4, y: 2, roomId: 1, scale: 1.2 }],
      params: { roomCount: 2, loopChance: 0.2, decorDensity: 0.7, themeKey: "grim" },
    },
  };
}

describe("Forge message intake", () => {
  test("ignores unknown values and messages for other targets", () => {
    expect(parseForgeDungeonMessage(null)).toEqual({ kind: "ignored" });
    expect(parseForgeDungeonMessage("black-flag:forge-dungeon")).toEqual({ kind: "ignored" });
    expect(parseForgeDungeonMessage({ type: "black-flag:forge-visibility" })).toEqual({
      kind: "ignored",
    });
    const hostileMessage = new Proxy(
      {},
      {
        get() {
          throw new Error("blocked read");
        },
      },
    );
    expect(parseForgeDungeonMessage(hostileMessage)).toMatchObject({
      kind: "rejected",
      error: { code: "internal-error" },
    });
  });

  test("rejects a malformed Forge envelope and unsupported versions", () => {
    const missingDungeon = parseForgeDungeonMessage({
      type: "black-flag:forge-dungeon",
      version: 1,
    });
    expect(missingDungeon).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-envelope" },
    });

    expect(
      parseForgeDungeonMessage({
        type: "black-flag:forge-dungeon",
        version: 1,
        dungeon: {},
      }),
    ).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.valid" },
    });

    const unsupported = parseForgeDungeonMessage({
      ...makeForgeMessage(),
      version: 2,
    });
    expect(unsupported).toMatchObject({
      kind: "rejected",
      error: { code: "unsupported-version", path: "version" },
    });
  });

  test("accepts a valid v1 payload with Forge water and observed params", () => {
    const result = parseForgeDungeonMessage(makeForgeMessage());
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") throw new Error("valid Forge message was rejected");

    expect(result.value.params).toMatchObject({
      roomTarget: 2,
      loopRate: 20,
      decorDensity: 70,
      mapWidth: W,
      mapHeight: H,
      profile: "grim",
    });
    expect(result.value.dungeon.grid[1]?.[3]).toBe(1);
    expect(result.value.dungeon.stats).toMatchObject({ roomCount: 2, exitDistance: 4 });
    expect(Object.isFrozen(result.value.params)).toBe(true);
  });

  test("classifies invalid parameters and disconnected topology", () => {
    const invalidParams = makeForgeMessage();
    invalidParams.dungeon.params.decorDensity = 1.2;
    expect(parseForgeDungeonMessage(invalidParams)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-params", path: "dungeon.params" },
    });

    const disconnected = makeForgeMessage();
    disconnected.dungeon.grid[cell(3, 2)] = 2;
    expect(parseForgeDungeonMessage(disconnected)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology" },
    });

    const selfEdge = makeForgeMessage();
    selfEdge.dungeon.edges[0] = { a: 0, b: 0, isLoop: false };
    expect(parseForgeDungeonMessage(selfEdge)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology", path: "dungeon.edges[0]" },
    });

    const duplicateEdge = makeForgeMessage();
    duplicateEdge.dungeon.edges.push({ a: 1, b: 0, isLoop: true });
    expect(parseForgeDungeonMessage(duplicateEdge)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology", path: "dungeon.edges[1]" },
    });
  });

  test("rejects themes outside the Forge biome catalog and recovers with a valid theme", () => {
    const message = makeForgeMessage();
    for (const themeKey of ["ash", "iron", "bogus"]) {
      message.dungeon.params.themeKey = themeKey;
      expect(parseForgeDungeonMessage(message)).toMatchObject({
        kind: "rejected",
        error: { code: "invalid-params", path: "dungeon.params.themeKey" },
      });
    }

    message.dungeon.params.themeKey = "grim";
    expect(parseForgeDungeonMessage(message)).toMatchObject({ kind: "accepted" });
  });

  test("rejects contradictory room counts and unsafe semantic ranges", () => {
    const wrongRoomCount = makeForgeMessage();
    wrongRoomCount.dungeon.params.roomCount = 80;
    expect(parseForgeDungeonMessage(wrongRoomCount)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-params", path: "dungeon.params.roomCount" },
    });

    const invalidDifficulty = makeForgeMessage();
    invalidDifficulty.dungeon.rooms[1]!.difficulty = 2;
    expect(parseForgeDungeonMessage(invalidDifficulty)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.rooms[1]" },
    });

    const invalidDepth = makeForgeMessage();
    invalidDepth.dungeon.rooms[1]!.depth = Number.MAX_SAFE_INTEGER;
    expect(parseForgeDungeonMessage(invalidDepth)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology", path: "dungeon.rooms[1].depth" },
    });

    const invalidDegree = makeForgeMessage();
    invalidDegree.dungeon.rooms[1]!.degree = 0;
    expect(parseForgeDungeonMessage(invalidDegree)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology", path: "dungeon.rooms[1].degree" },
    });

    const invalidScale = makeForgeMessage();
    invalidScale.dungeon.props![0]!.scale = -1;
    expect(parseForgeDungeonMessage(invalidScale)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.props[0]" },
    });

    const invalidVariant = makeForgeMessage();
    invalidVariant.dungeon.props![0]!.v = 3;
    expect(parseForgeDungeonMessage(invalidVariant)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.props[0]" },
    });

    const invalidTier = makeForgeMessage();
    invalidTier.dungeon.spawns = [{ x: 4, y: 2, roomId: 1, tier: -1 }];
    expect(parseForgeDungeonMessage(invalidTier)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.spawns[0]" },
    });

    const metricWithoutField = makeForgeMessage();
    delete metricWithoutField.dungeon.bfs;
    metricWithoutField.dungeon.maxBfs = 4;
    expect(parseForgeDungeonMessage(metricWithoutField)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.metrics" },
    });

    const corruptBfs = makeForgeMessage();
    corruptBfs.dungeon.bfs!.fill(-1);
    corruptBfs.dungeon.bfs![0] = 4;
    corruptBfs.dungeon.maxBfs = 4;
    expect(parseForgeDungeonMessage(corruptBfs)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology", path: "dungeon.bfs[0]" },
    });

    const mismatchedEntranceCenter = makeForgeMessage();
    mismatchedEntranceCenter.dungeon.rooms[0]!.cx = 4;
    mismatchedEntranceCenter.dungeon.bfs!.fill(-1);
    for (let x = 1; x <= 5; x += 1)
      mismatchedEntranceCenter.dungeon.bfs![cell(x, 2)] = Math.abs(4 - x);
    mismatchedEntranceCenter.dungeon.maxBfs = 3;
    expect(parseForgeDungeonMessage(mismatchedEntranceCenter)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology", path: "dungeon.rooms[0]" },
    });
  });

  test("rejects oversized maps and values outside the v1 cell domains", () => {
    const oversized = makeForgeMessage();
    oversized.dungeon.W = 1025;
    expect(parseForgeDungeonMessage(oversized)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.bounds" },
    });

    const invalidGrid = makeForgeMessage();
    invalidGrid.dungeon.grid[cell(3, 2)] = 4;
    expect(parseForgeDungeonMessage(invalidGrid)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.grid" },
    });

    const invalidMask = makeForgeMessage();
    invalidMask.dungeon.corridor![cell(3, 2)] = 2;
    expect(parseForgeDungeonMessage(invalidMask)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.corridor" },
    });

    const invalidSeed = makeForgeMessage();
    invalidSeed.dungeon.seed = -1;
    expect(parseForgeDungeonMessage(invalidSeed)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.seed" },
    });
  });

  test("rejects unsafe and out-of-grid coordinates", () => {
    const unsafe = makeForgeMessage();
    unsafe.dungeon.props![0]!.x = 1e308;
    expect(parseForgeDungeonMessage(unsafe)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.props[0]" },
    });

    const outOfGrid = makeForgeMessage();
    outOfGrid.dungeon.props![0]!.x = W;
    expect(parseForgeDungeonMessage(outOfGrid)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.props[0]" },
    });

    const outOfGridArch = makeForgeMessage();
    outOfGridArch.dungeon.arches = [{ x: 0, y: 2, px: 1, py: 0, len: 3 }];
    expect(parseForgeDungeonMessage(outOfGridArch)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.arches[0]" },
    });
  });

  test("rejects metadata that points to an unknown room id", () => {
    const message = makeForgeMessage();
    message.dungeon.spawns = [{ x: 4, y: 2, tier: 1, roomId: 999999 }];
    expect(parseForgeDungeonMessage(message)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology", path: "dungeon.spawns[0].roomId" },
    });

    const roomOnWall = makeForgeMessage();
    roomOnWall.dungeon.roomId![cell(0, 0)] = 0;
    expect(parseForgeDungeonMessage(roomOnWall)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology", path: "dungeon.roomId[0]" },
    });
  });

  test("rejects invalid directions and metadata on blocked cells", () => {
    const invalidDirection = makeForgeMessage();
    invalidDirection.dungeon.grid[cell(3, 3)] = 2;
    invalidDirection.dungeon.torches = [{ x: 3, y: 3, dx: 1, dy: 1 }];
    expect(parseForgeDungeonMessage(invalidDirection)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-payload", path: "dungeon.torches[0]" },
    });

    const blockedSpawn = makeForgeMessage();
    blockedSpawn.dungeon.grid[cell(3, 3)] = 2;
    blockedSpawn.dungeon.spawns = [{ x: 3, y: 3, tier: 1, roomId: 1 }];
    expect(parseForgeDungeonMessage(blockedSpawn)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology", path: "dungeon.spawns[0]" },
    });

    const validDirection = makeForgeMessage();
    validDirection.dungeon.grid[cell(3, 3)] = 2;
    validDirection.dungeon.torches = [{ x: 3, y: 3, dx: 0, dy: -1 }];
    expect(parseForgeDungeonMessage(validDirection)).toMatchObject({ kind: "accepted" });
  });

  test("rejects an isolated floor cell outside the connected dungeon", () => {
    const message = makeForgeMessage();
    message.dungeon.grid[cell(1, 4)] = 1;
    expect(parseForgeDungeonMessage(message)).toMatchObject({
      kind: "rejected",
      error: { code: "invalid-topology", path: "dungeon.grid" },
    });
  });

  test("does not retain mutable payload aliases", () => {
    const message = makeForgeMessage();
    const result = parseForgeDungeonMessage(message);
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") throw new Error("valid Forge message was rejected");

    message.dungeon.grid[cell(3, 1)] = 0;
    message.dungeon.roomId![cell(1, 2)] = 99;
    message.dungeon.rooms[0]!.type = "changed";
    message.dungeon.props![0]!.kind = "changed";
    message.dungeon.params.themeKey = "changed";

    expect(result.value.dungeon.grid[1]?.[3]).toBe(1);
    expect(result.value.dungeon.forge?.roomIds[cell(1, 2)]).toBe(0);
    expect(result.value.dungeon.forge?.rooms[0]?.type).toBe("entrance");
    expect(result.value.dungeon.forge?.props[0]?.kind).toBe("banner");
    expect(result.value.params.profile).toBe("grim");
  });

  test("routes the browser adapter through one intake call and never re-prepares on Apply", async () => {
    const mainSource = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(mainSource.match(/parseForgeDungeonMessage\(/g)).toHaveLength(1);

    const applyStart = mainSource.indexOf("function applyForgeDungeon(): void {");
    const applyEnd = mainSource.indexOf("function selectEditorSpawn", applyStart);
    expect(applyStart).toBeGreaterThanOrEqual(0);
    const applySource = mainSource.slice(applyStart, applyEnd);
    expect(applySource).toContain("forgePreviewDungeon ?? forgeIntake.dungeon");
    expect(applySource).toContain("const { params } = forgeIntake");
    expect(applySource).not.toContain("prepareDungeonForge");
    expect(mainSource).toContain("event.origin !== location.origin");
    expect(mainSource).toContain("event.source !== elements.forgeFrame.contentWindow");
    expect(mainSource).toContain("imported.forge?.themeKey ?? params.profile");
  });
});
