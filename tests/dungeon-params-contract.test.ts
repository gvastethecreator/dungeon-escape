import { describe, expect, test } from "bun:test";
import { executeSim, type FullRunSnapshot } from "../src/domain/runtime";
import { DEFAULT_DUNGEON_PARAMS } from "../src/domain/core";
import type { AuthorityClient } from "../src/authority/client";
import { createDomainBridge } from "../src/domain/bridge";
import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  normalizeForgeDungeonParams,
  prepareDungeonForge,
  type ForgeDungeonPayload,
} from "../src/dungeon/importDungeonForge";
import { DUNGEON_PRESETS } from "../src/editor/presets";

const W = 7;
const H = 5;
const index = (x: number, y: number) => y * W + x;
const grid = new Uint8Array(W * H);
for (let x = 1; x <= 5; x += 1) grid[index(x, 2)] = 1;
const roomId = new Int16Array(W * H).fill(-1);
for (const x of [1, 2]) roomId[index(x, 2)] = 0;
for (const x of [4, 5]) roomId[index(x, 2)] = 1;

const forgePayload: ForgeDungeonPayload = {
  valid: true,
  seed: 1337,
  name: "Contract Crypt",
  W,
  H,
  grid,
  roomId,
  corridor: new Uint8Array(W * H),
  doorway: new Uint8Array(W * H),
  bfs: new Int32Array(W * H).fill(-1),
  rooms: [
    {
      id: 0,
      cx: 1,
      cy: 2,
      w: 2,
      h: 1,
      type: "entrance",
    },
    {
      id: 1,
      cx: 5,
      cy: 2,
      w: 2,
      h: 1,
      type: "boss",
    },
  ],
  edges: [{ a: 0, b: 1, isLoop: false }],
  entrance: 0,
  boss: 1,
  params: { roomCount: 80, loopChance: 0.8, decorDensity: 0.34, themeKey: "molten" },
};

describe("Dungeon parameter contract seams", () => {
  test("every editor preset is accepted by the bridge and generator", () => {
    for (const [id, preset] of Object.entries(DUNGEON_PRESETS)) {
      const bridge = createDomainBridge(`preset-${id}`);
      const result = bridge.setParams(preset);
      expect(result.ok, id).toBe(true);
      expect(bridge.getDungeon()).toMatchObject(preset);

      const hydrated = executeSim(bridge.getRun(), {
        type: "dungeons/hydrate",
        payload: { seed: `hydrated-${id}`, ...preset },
      });
      expect(hydrated.ok, `${id} hydrate`).toBe(true);
      if (hydrated.ok) {
        expect((hydrated.run as FullRunSnapshot).domains.dungeons).toMatchObject(preset);
      }

      const dungeon = generateDungeon(`preset-${id}`, {
        roomTarget: preset.roomTarget,
        extraConnectionRate: preset.loopRate / 100,
        width: preset.mapWidth,
        height: preset.mapHeight,
        minRoomSize: preset.minRoomSize,
        maxRoomSize: preset.maxRoomSize,
        corridorRadius: preset.corridorRadius,
        roomPadding: preset.roomPadding,
      });
      expect(dungeon.options).toMatchObject({
        width: preset.mapWidth,
        height: preset.mapHeight,
        roomTarget: preset.roomTarget,
        minRoomSize: preset.minRoomSize,
        maxRoomSize: preset.maxRoomSize,
        corridorRadius: preset.corridorRadius,
        roomPadding: preset.roomPadding,
        extraConnectionRate: preset.loopRate / 100,
      });
    }
  });

  test("normalizes Forge settings and stores its snapshot instead of host defaults", () => {
    const params = normalizeForgeDungeonParams(forgePayload);
    expect(params).toEqual({
      roomTarget: 2,
      loopRate: 80,
      decorDensity: 34,
      mapWidth: W,
      mapHeight: H,
      minRoomSize: 1,
      maxRoomSize: 2,
      corridorRadius: DEFAULT_DUNGEON_PARAMS.corridorRadius,
      roomPadding: DEFAULT_DUNGEON_PARAMS.roomPadding,
      enemyDensity: DEFAULT_DUNGEON_PARAMS.enemyDensity,
      lightLevel: DEFAULT_DUNGEON_PARAMS.lightLevel,
      profile: "molten",
    });

    const prepared = prepareDungeonForge(forgePayload);
    const imported = prepared.dungeon;
    expect(prepared.params).toEqual(params);
    expect(imported.width).toBe(params.mapWidth);
    expect(imported.height).toBe(params.mapHeight);
    expect(imported.rooms).toHaveLength(params.roomTarget);
    expect(imported.options).toMatchObject({
      width: params.mapWidth,
      height: params.mapHeight,
      roomTarget: params.roomTarget,
      minRoomSize: params.minRoomSize,
      maxRoomSize: params.maxRoomSize,
      corridorRadius: params.corridorRadius,
      roomPadding: params.roomPadding,
      extraConnectionRate: params.loopRate / 100,
    });
    expect(imported.forge).toEqual(
      expect.objectContaining({
        themeKey: params.profile,
        decorDensity: params.decorDensity / 100,
      }),
    );

    const bridge = createDomainBridge("HOST-DEFAULT");
    bridge.captureBuild({
      seed: imported.seed,
      topologySignature: imported.topologySignature,
      ...params,
    });
    expect(bridge.getDungeon()).toMatchObject({ seed: imported.seed, ...params });
    expect(bridge.project().domain?.metrics).toMatchObject(params);
  });

  test("accepts observed build bounds and the prior domain baseline", () => {
    const bridge = createDomainBridge("OBSERVED");
    const params = {
      ...DEFAULT_DUNGEON_PARAMS,
      roomTarget: 80,
      mapWidth: 101,
      mapHeight: 101,
      minRoomSize: 15,
      maxRoomSize: 18,
      corridorRadius: 3,
      profile: "observed",
    };

    expect(bridge.setParams(params).ok).toBe(true);
    expect(bridge.getDungeon()).toMatchObject(params);

    const hydrated = executeSim(bridge.getRun(), {
      type: "dungeons/hydrate",
      payload: { seed: "hydrated-observed", ...params },
    });
    expect(hydrated.ok).toBe(true);
    if (hydrated.ok) {
      expect((hydrated.run as FullRunSnapshot).domains.dungeons).toMatchObject(params);
    }
  });

  test("a failed Forge import leaves the domain snapshot unchanged", () => {
    const bridge = createDomainBridge("UNCHANGED");
    const before = { ...bridge.getDungeon() };

    expect(() => {
      const prepared = prepareDungeonForge({ ...forgePayload, grid: new Uint8Array(2) });
      bridge.captureBuild({
        seed: prepared.dungeon.seed,
        topologySignature: prepared.dungeon.topologySignature,
        ...prepared.params,
      });
    }).toThrow("grid size");
    expect(bridge.getDungeon()).toEqual(before);
  });

  test("a rejected parameter patch leaves the host snapshot unchanged", () => {
    const bridge = createDomainBridge("REJECT");
    const before = { ...bridge.getDungeon() };
    const result = bridge.setParams({ corridorRadius: 4 });

    expect(result.ok).toBe(false);
    expect(bridge.getDungeon()).toEqual(before);
  });

  test("captureBuild keeps the full run intact and schedules no push when params fail", () => {
    let pushes = 0;
    const authority = {
      postCommand: async () => {
        pushes += 1;
        throw new Error("invalid capture must not reach authority");
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "PARTIAL", authority });
    const beforeRun = bridge.getRun();
    const beforeDungeon = { ...bridge.getDungeon() };

    const result = bridge.captureBuild({
      seed: "PARTIAL-MUTATION",
      topologySignature: "partial-mutation",
      ...DUNGEON_PRESETS.balanced,
      mapWidth: 2,
    });

    expect(result.ok).toBe(false);
    expect(bridge.getRun()).toBe(beforeRun);
    expect(bridge.getDungeon()).toEqual(beforeDungeon);
    expect(pushes).toBe(0);
  });

  test("captureBuild keeps the full run intact and schedules no push when topology is empty", () => {
    let pushes = 0;
    const authority = {
      postCommand: async () => {
        pushes += 1;
        throw new Error("invalid capture must not reach authority");
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "TOPOLOGY", authority });
    const beforeRun = bridge.getRun();
    const beforeDungeon = { ...bridge.getDungeon() };

    const result = bridge.captureBuild({
      seed: "AFTER",
      topologySignature: "",
      ...DUNGEON_PRESETS.balanced,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("empty topology capture should fail");
    expect(result.error).toMatchObject({
      code: "invalid_payload",
      message: "topologySignature must be non-empty",
    });
    expect(bridge.getRun()).toBe(beforeRun);
    expect(bridge.getDungeon()).toEqual(beforeDungeon);
    expect(pushes).toBe(0);
  });
});
