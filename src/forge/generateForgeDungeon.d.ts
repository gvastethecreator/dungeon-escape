import type { ForgeDungeonPayload } from "../dungeon/importDungeonForge";
import type {
  ForgeArchMetadata,
  ForgePropMetadata,
  ForgeRoomMetadata,
  ForgeSpawnMetadata,
  ForgeTorchMetadata,
  GridCell,
} from "../dungeon/types";
import type { ForgeThemeId } from "./ForgeThemeProfiles";

export type ForgeGenerationParams = Readonly<{
  seed: number;
  roomCount: number;
  loopChance: number;
  decorDensity: number;
  themeKey: ForgeThemeId;
}>;

export type GeneratedForgeRoom = ForgeRoomMetadata &
  Readonly<{
    arch: string;
    shape: string;
    depth: number;
    difficulty: number;
    degree: number;
  }>;

export type GeneratedForgeEdge = ForgeDungeonPayload["edges"][number] &
  Readonly<{ isCritical: boolean }>;

export type ForgeGenerationStats = {
  rooms: number;
  edges: number;
  loops: number;
  critLen: number;
  floorTiles: number;
  reach: number;
  genMs: number;
  attempts: number;
  sealedBoundaryLeaks: number;
  preservedBoundaryOpenings: number;
};

export type GeneratedForgeDungeon = Omit<
  ForgeDungeonPayload,
  | "grid"
  | "roomId"
  | "corridor"
  | "doorway"
  | "bfs"
  | "maxBfs"
  | "maxDepth"
  | "rooms"
  | "edges"
  | "props"
  | "spawns"
  | "torches"
  | "pools"
  | "lakeCells"
  | "lakeMask"
  | "arches"
  | "params"
> & {
  grid: Uint8Array;
  roomId: Int16Array;
  corridor: Uint8Array;
  doorway: Uint8Array;
  bfs: Int16Array;
  maxBfs: number;
  maxDepth: number;
  rooms: GeneratedForgeRoom[];
  edges: GeneratedForgeEdge[];
  edgeRoutes: GridCell[][];
  props: ForgePropMetadata[];
  spawns: ForgeSpawnMetadata[];
  torches: ForgeTorchMetadata[];
  pools: GridCell[];
  lakeCells: GridCell[];
  lakeMask: Uint8Array;
  arches: ForgeArchMetadata[];
  params: ForgeGenerationParams;
  stats: ForgeGenerationStats;
};

/**
 * Build a deterministic Forge v1 payload.
 *
 * @throws {TypeError} When params is not an object.
 * @throws {RangeError} When a seed, room count, rate, density, or theme is outside the public contract.
 */
export declare function generateForgeDungeon(params: ForgeGenerationParams): GeneratedForgeDungeon;
