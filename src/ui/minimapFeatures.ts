import type { StoneId } from "./copy";

/** Grid cell (x,y) for minimap rendering. */
export interface MinimapCell {
  x: number;
  y: number;
}

/** Enemy marker on the minimap: position + threat tier (0-3). */
export interface MinimapEnemy {
  cell: MinimapCell;
  tier: number;
}

/** Magic-stone quest pickup marker. */
export interface MinimapStone {
  cell: MinimapCell;
  /** When true, the stone is already bound; renderer fades it. */
  collected: boolean;
  id: StoneId;
}

export interface MinimapStair {
  cell: MinimapCell;
  direction: "up" | "down";
}

/**
 * Read-only snapshot of world entities the minimap should render.
 * Reused by `DungeonWorld.getMinimapFeatures()` until visible world state changes.
 */
export interface MinimapFeatures {
  /** Closed/open doorways — drawn as crossed bars. */
  doors: MinimapCell[];
  /** Wall torches, campfires, braziers — any active fire source. */
  fires: MinimapCell[];
  /** Live enemies (already-collected/defeated ones are filtered upstream). */
  enemies: MinimapEnemy[];
  /** The four magic-stone quest objectives. */
  stones: MinimapStone[];
  /** Resolve flasks that have not yet been picked up. */
  pickups: MinimapCell[];
  /** Time-freeze relic that has not yet been picked up. */
  timeFreeze?: MinimapCell;
  /** Luminous ward stone that has not yet been picked up. */
  luminousWard?: MinimapCell;
  /** Annihilation pulse relic that has not yet been picked up. */
  annihilationPulse?: MinimapCell;
  /** Full-map scroll pickup. */
  map?: MinimapCell;
  /** Sprint/stamina/trap-immunity draught. */
  mobility?: MinimapCell;
  /** Temporary fog-clear clarity phial. */
  clarity?: MinimapCell;
  /** Rare cursed power chests (uncollected). */
  swarmCurse?: MinimapCell;
  slowCurse?: MinimapCell;
  frenzyCurse?: MinimapCell;
  gloomCurse?: MinimapCell;
  /** Connections to adjacent dungeon floors. */
  stairs?: MinimapStair[];
  /** Special objective prop (reliquary altar / boss-shrine crystal), if any. */
  relic?: MinimapCell;
  /** Entrance / spawn marker (dungeon.spawn). */
  spawn: MinimapCell;
}
