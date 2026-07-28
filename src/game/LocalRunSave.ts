import type { DungeonDomainState } from "../domain/bridge";
import { isRunSource, type RunSource } from "./RunSource";
import { STONE_ORDER, type StoneId } from "../ui/copy";

export const LOCAL_RUN_SAVE_KEY = "blackflag.dungeon.run.v1";
export const LOCAL_RUN_SAVE_VERSION = 2 as const;

/** Player + clock fields that domain session sync does not carry. */
export interface LocalRunResumeState {
  /** Quest stopwatch when the save was written. */
  runSeconds: number;
  /** Difficulty director clock (HUD run timer / enemy pressure). */
  difficultyElapsed: number;
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    distanceTravelled: number;
  };
  /** Grid cells already revealed on the minimap (`"x,y"`). */
  visitedCells: string[];
  timeFreezeRemaining: number;
  luminousWardRemaining: number;
  /** Active annihilation pulse time; omitted in saves written before the item existed. */
  annihilationPulseRemaining?: number;
  /** Optional per-stone find offsets in run seconds. */
  perStoneSeconds?: Partial<Record<StoneId, number>>;
}

export interface LocalRunSave {
  version: 1 | typeof LOCAL_RUN_SAVE_VERSION;
  savedAt: number;
  state: DungeonDomainState;
  /** Present on v2 saves; missing on older item-only continues. */
  resume?: LocalRunResumeState;
  /**
   * Campaign runs may rank. Custom runs never do.
   * Missing on older saves → treated as campaign for continue compatibility.
   */
  runSource?: RunSource;
}

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const NUMBER_FIELDS = [
  "floor",
  "mapped",
  "threat",
  "roomTarget",
  "loopRate",
  "decorDensity",
  "mapWidth",
  "mapHeight",
  "minRoomSize",
  "maxRoomSize",
  "corridorRadius",
  "roomPadding",
  "enemyDensity",
  "lightLevel",
  "exploredCells",
  "resolve",
] as const satisfies readonly (keyof DungeonDomainState)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDungeonDomainState(value: unknown): value is DungeonDomainState {
  if (!isRecord(value)) return false;
  for (const key of NUMBER_FIELDS) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) return false;
  }
  if (typeof value.seed !== "string" || !value.seed.trim()) return false;
  if (typeof value.room !== "string" || typeof value.profile !== "string") return false;
  if (typeof value.engineMode !== "string" || typeof value.topologySignature !== "string")
    return false;
  if (typeof value.hasRelic !== "boolean" || typeof value.exitReached !== "boolean") return false;
  if (typeof value.portalOpen !== "boolean") return false;
  if (value.runMode !== "playing" && value.runMode !== "dead" && value.runMode !== "won")
    return false;
  if (!Array.isArray(value.foundStoneIds)) return false;
  const validStones = new Set<StoneId>(STONE_ORDER);
  if (!value.foundStoneIds.every((id) => typeof id === "string" && validStones.has(id as StoneId)))
    return false;
  const resolve = value.resolve;
  if (typeof resolve !== "number" || resolve < 0 || resolve > 100) return false;
  return true;
}

function isLocalRunResumeState(value: unknown): value is LocalRunResumeState {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.runSeconds) || value.runSeconds < 0) return false;
  if (!isFiniteNumber(value.difficultyElapsed) || value.difficultyElapsed < 0) return false;
  if (!isFiniteNumber(value.timeFreezeRemaining) || value.timeFreezeRemaining < 0) return false;
  if (!isFiniteNumber(value.luminousWardRemaining) || value.luminousWardRemaining < 0) return false;
  if (
    value.annihilationPulseRemaining !== undefined &&
    (!isFiniteNumber(value.annihilationPulseRemaining) || value.annihilationPulseRemaining < 0)
  )
    return false;
  if (!Array.isArray(value.visitedCells)) return false;
  if (!value.visitedCells.every((cell) => typeof cell === "string" && /^-?\d+,-?\d+$/.test(cell))) {
    return false;
  }
  if (!isRecord(value.player)) return false;
  const player = value.player;
  const x = player.x;
  const y = player.y;
  const z = player.z;
  const yaw = player.yaw;
  const pitch = player.pitch;
  const distanceTravelled = player.distanceTravelled;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(z) ||
    !isFiniteNumber(yaw) ||
    !isFiniteNumber(pitch) ||
    !isFiniteNumber(distanceTravelled)
  ) {
    return false;
  }
  if (distanceTravelled < 0) return false;
  if (value.perStoneSeconds !== undefined) {
    if (!isRecord(value.perStoneSeconds)) return false;
    const validStones = new Set<StoneId>(STONE_ORDER);
    for (const [id, seconds] of Object.entries(value.perStoneSeconds)) {
      if (!validStones.has(id as StoneId)) return false;
      if (!isFiniteNumber(seconds) || seconds < 0) return false;
    }
  }
  return true;
}

export function readLocalRunSave(storage: StoragePort = localStorage): LocalRunSave | null {
  try {
    const raw = storage.getItem(LOCAL_RUN_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || typeof parsed.savedAt !== "number") return null;
    if (!Number.isFinite(parsed.savedAt) || !isDungeonDomainState(parsed.state)) return null;
    if (parsed.version !== 1 && parsed.version !== LOCAL_RUN_SAVE_VERSION) return null;
    const resume =
      parsed.resume === undefined
        ? undefined
        : isLocalRunResumeState(parsed.resume)
          ? parsed.resume
          : null;
    if (resume === null) return null;
    const runSource = isRunSource(parsed.runSource) ? parsed.runSource : undefined;
    return {
      version: parsed.version,
      savedAt: parsed.savedAt,
      state: parsed.state,
      resume,
      ...(runSource ? { runSource } : {}),
    };
  } catch {
    return null;
  }
}

export function writeLocalRunSave(
  state: DungeonDomainState,
  storage: StoragePort = localStorage,
  savedAt = Date.now(),
  resume?: LocalRunResumeState,
  runSource?: RunSource,
): boolean {
  try {
    const save: LocalRunSave = {
      version: LOCAL_RUN_SAVE_VERSION,
      savedAt,
      state,
      ...(resume ? { resume } : {}),
      ...(runSource ? { runSource } : {}),
    };
    storage.setItem(LOCAL_RUN_SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** Older saves without runSource stay campaign-eligible so mid-run continues still rank. */
export function runSourceFromLocalSave(save: LocalRunSave | null): RunSource {
  return save?.runSource === "custom" ? "custom" : "campaign";
}

export function clearLocalRunSave(storage: StoragePort = localStorage): void {
  try {
    storage.removeItem(LOCAL_RUN_SAVE_KEY);
  } catch {
    // Private storage modes may reject writes; no user action depends on clear.
  }
}

export function canContinueLocalRun(save: LocalRunSave | null): save is LocalRunSave {
  return Boolean(save && canContinueDomainRun(save.state));
}

export function canContinueDomainRun(
  state: DungeonDomainState | null,
): state is DungeonDomainState {
  return Boolean(state && state.runMode === "playing" && !state.exitReached);
}
