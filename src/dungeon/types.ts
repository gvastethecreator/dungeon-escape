export interface GridCell {
  x: number;
  y: number;
}

export interface DungeonOptions {
  width?: number;
  height?: number;
  roomTarget?: number;
  minRoomSize?: number;
  maxRoomSize?: number;
  roomPadding?: number;
  corridorRadius?: number;
  extraConnectionRate?: number;
  placementAttemptsPerRoom?: number;
}

export interface NormalizedDungeonOptions {
  width: number;
  height: number;
  roomTarget: number;
  minRoomSize: number;
  maxRoomSize: number;
  roomPadding: number;
  corridorRadius: number;
  extraConnectionRate: number;
  placementAttemptsPerRoom: number;
}

export type RoomRole = "entrance" | "exit" | "room";

export interface DungeonRoom {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  center: GridCell;
  role: RoomRole;
}

export type EdgeKind = "tree" | "loop";

export interface DungeonEdge {
  left: number;
  right: number;
  distance: number;
  kind: EdgeKind;
}

export type DungeonStairDirection = "up" | "down";

export interface DungeonDoorway {
  edgeIndex: number;
  roomId: number;
  connectedRoomId: number;
  cell: GridCell;
  outside: GridCell;
  outDx: -1 | 0 | 1;
  outDy: -1 | 0 | 1;
}

/**
 * Structural masks owned by the play generator. Rendering may decorate this
 * topology, but it must not guess room openings from the final floor bitmap.
 */
export interface DungeonTopologyMetadata {
  roomIds: Int16Array;
  corridors: Uint8Array;
  doorways: DungeonDoorway[];
  /** Exact centerline carved for each graph edge, indexed like DungeonData.edges. */
  routes?: GridCell[][];
}

export interface DungeonStair {
  id: string;
  direction: DungeonStairDirection;
  cell: GridCell;
  targetFloor: number;
  yaw: number;
  /** Shared id for the aligned vertical shaft linking two floors. */
  shaftId: string;
  /** Grid cells reserved for the flight and its two supported landings. */
  footprint: GridCell[];
}

export interface DungeonFloorMetadata {
  /** Zero-based floor index used by runtime and saves. */
  index: number;
  /** One-based floor number used by player-facing UI. */
  number: number;
  count: number;
  rootSeed: string;
  stairs: DungeonStair[];
  /** Cells crossed by a flight, with an open ceiling or deck hole. */
  openVerticalCells?: GridCell[];
}

export interface DungeonStats {
  roomCount: number;
  floorCount: number;
  reachableFloorCount: number;
  edgeCount: number;
  loopCount: number;
  exitDistance: number;
}

export interface DungeonData {
  seed: string;
  seedHash: number;
  options: NormalizedDungeonOptions;
  grid: Uint8Array[];
  width: number;
  height: number;
  rooms: DungeonRoom[];
  edges: DungeonEdge[];
  spawn: GridCell;
  exit: GridCell;
  entranceRoomId: number;
  exitRoomId: number;
  distances: Int32Array;
  topologySignature: string;
  stats: DungeonStats;
  topology?: DungeonTopologyMetadata;
  floor?: DungeonFloorMetadata;
  forge?: DungeonForgeMetadata;
}

export interface DungeonForgeMetadata {
  name: string;
  themeKey: string;
  roomTypes: Record<number, string>;
  source: "dungeon-forge";
  seed: number;
  decorDensity: number;
  maxBfs: number;
  maxDepth: number;
  roomIds: Int16Array;
  corridors: Uint8Array;
  doorways: Uint8Array;
  bfs: Int32Array;
  pools: Uint8Array;
  lakeMask: Uint8Array;
  rooms: ForgeRoomMetadata[];
  props: ForgePropMetadata[];
  spawns: ForgeSpawnMetadata[];
  torches: ForgeTorchMetadata[];
  arches: ForgeArchMetadata[];
}

export interface ForgeRoomMetadata {
  id: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  type: string;
  arch?: string;
  shape?: string;
  depth?: number;
  difficulty?: number;
  degree?: number;
  grave?: boolean;
  lake?: boolean;
}

export interface ForgePropMetadata {
  kind: string;
  x: number;
  y: number;
  roomId?: number;
  rot?: number;
  scale?: number;
  v?: number;
  dx?: number;
  dy?: number;
  ice?: boolean;
}

export interface ForgeSpawnMetadata {
  x: number;
  y: number;
  tier: number;
  roomId: number;
}

export interface ForgeTorchMetadata {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface ForgeArchMetadata {
  x: number;
  y: number;
  px: number;
  py: number;
  len: number;
  /** Optional normal from the corridor into its joined room. */
  roomDx?: number;
  roomDy?: number;
}
