import type { DungeonParams } from "../domain/core";
import { generateCompletableDungeon } from "./completeness";
import { createDungeonFloorCampaign, type DungeonFloorCampaign } from "./generateDungeonFloors";
import type { DungeonData, DungeonOptions } from "./types";

export interface DungeonGenerationRequest {
  seed: string;
  params: Readonly<DungeonParams>;
  floorCount?: number;
  activeFloor?: number;
  initialFloor?: DungeonData;
}

export interface DungeonGenerationResult {
  dungeon: DungeonData;
  floorSet: DungeonFloorCampaign | null;
  options: DungeonOptions;
}

/** Convert the product settings into the smaller topology-generator contract. */
export function dungeonOptionsFromParams(params: Readonly<DungeonParams>): DungeonOptions {
  return {
    roomTarget: params.roomTarget,
    extraConnectionRate: params.loopRate / 100,
    width: params.mapWidth,
    height: params.mapHeight,
    minRoomSize: params.minRoomSize,
    maxRoomSize: params.maxRoomSize,
    corridorRadius: params.corridorRadius,
    roomPadding: params.roomPadding,
  };
}

/**
 * Pure generation boundary. It does not read DOM state or call editor code.
 * Multi-floor requests materialize the complete resident stack before return.
 */
export function generateDungeonBuild(request: DungeonGenerationRequest): DungeonGenerationResult {
  const seed = request.seed.trim() || "BLACK-FLAG";
  const options = dungeonOptionsFromParams(request.params);
  const requestedFloorCount = Number.isFinite(request.floorCount)
    ? Math.max(1, Math.trunc(request.floorCount!))
    : 1;

  if (requestedFloorCount === 1) {
    return {
      dungeon: request.initialFloor ?? generateCompletableDungeon(seed, options),
      floorSet: null,
      options,
    };
  }

  const floorSet = createDungeonFloorCampaign(
    seed,
    options,
    requestedFloorCount,
    request.initialFloor,
  );
  const requestedActiveFloor = Number.isFinite(request.activeFloor)
    ? Math.max(0, Math.trunc(request.activeFloor!))
    : 0;
  const activeFloor = Math.min(floorSet.count - 1, requestedActiveFloor);
  const dungeon = floorSet.floor(activeFloor);
  if (!dungeon) throw new Error(`Dungeon floor ${activeFloor + 1} was not generated.`);
  return { dungeon, floorSet, options };
}
