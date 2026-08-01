import type { DungeonDomainState } from "../domain/bridge";
import { ANNIHILATION_PULSE_DURATION_SECONDS } from "./AnnihilationPulse";
import { LUMINOUS_WARD_DURATION_SECONDS } from "./LuminousWard";
import { FOG_CLEAR_DURATION_SECONDS } from "./FogClear";
import { FRENZY_CURSE_DURATION_SECONDS } from "./FrenzyCurse";
import { GLOOM_CURSE_DURATION_SECONDS } from "./GloomCurse";
import { MOBILITY_BOOST_DURATION_SECONDS } from "./MobilityBoost";
import { isRunSource, type RunSource } from "./RunSource";
import { SLOW_CURSE_DURATION_SECONDS } from "./SlowCurse";
import { TIME_FREEZE_DURATION_SECONDS } from "./TimeFreeze";
import { STONE_ORDER, type StoneId } from "../ui/copy";

export const LOCAL_RUN_SAVE_KEY = "blackflag.dungeon.run.v1";
export const LOCAL_RUN_SAVE_VERSION = 4 as const;
export type CustomMapKind = "procedural" | "forge";

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
  /** Full-floor fog reveal from the map pickup. */
  mapRevealed?: boolean;
  /** Active speed/stamina/floor-trap immunity time. */
  mobilityBoostRemaining?: number;
  /** Temporary fog-clear window remaining. */
  fogClearRemaining?: number;
  /** Timed cursed slowdown remaining. */
  slowCurseRemaining?: number;
  /** Timed enemy frenzy remaining. */
  frenzyCurseRemaining?: number;
  /** Timed gloom/darkness remaining. */
  gloomCurseRemaining?: number;
  /** Sticky floor swarm pressure after the swarm curse chest. */
  swarmCurseActive?: boolean;
  /** Active zero-based floor in a deterministic campaign floor set. */
  activeFloor?: number;
  /** Root seed used to regenerate every sibling floor. */
  campaignRootSeed?: string;
  /** Biome identity needed to regenerate the same campaign floor count. */
  campaignBiomeId?: string;
  /** Fog-of-war cells retained separately for each visited floor. */
  visitedFloors?: Record<string, string[]>;
  /** Optional per-stone find offsets in run seconds. */
  perStoneSeconds?: Partial<Record<StoneId, number>>;
}

export interface LocalRunSave {
  version: 1 | 2 | 3 | typeof LOCAL_RUN_SAVE_VERSION;
  savedAt: number;
  state: DungeonDomainState;
  /** Present on v2 saves; missing on older item-only continues. */
  resume?: LocalRunResumeState;
  /**
   * Campaign runs may rank. Custom runs never do.
   * Missing on older saves → treated as campaign for continue compatibility.
   */
  runSource?: RunSource;
  /** v4 distinguishes reproducible custom seeds from session-only Forge imports. */
  customMapKind?: CustomMapKind;
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

// Reject corrupt/exploit-sized payloads without imposing a gameplay duration policy.
const MAX_RESUME_SECONDS = 1_000_000_000;
const MAX_RESUME_DISTANCE_M = 1_000_000;

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
  if (
    !isFiniteNumber(value.runSeconds) ||
    value.runSeconds < 0 ||
    value.runSeconds > MAX_RESUME_SECONDS
  )
    return false;
  if (
    !isFiniteNumber(value.difficultyElapsed) ||
    value.difficultyElapsed < 0 ||
    value.difficultyElapsed > MAX_RESUME_SECONDS
  )
    return false;
  if (
    !isFiniteNumber(value.timeFreezeRemaining) ||
    value.timeFreezeRemaining < 0 ||
    value.timeFreezeRemaining > TIME_FREEZE_DURATION_SECONDS
  )
    return false;
  if (
    !isFiniteNumber(value.luminousWardRemaining) ||
    value.luminousWardRemaining < 0 ||
    value.luminousWardRemaining > LUMINOUS_WARD_DURATION_SECONDS
  )
    return false;
  if (
    value.annihilationPulseRemaining !== undefined &&
    (!isFiniteNumber(value.annihilationPulseRemaining) ||
      value.annihilationPulseRemaining < 0 ||
      value.annihilationPulseRemaining > ANNIHILATION_PULSE_DURATION_SECONDS)
  )
    return false;
  if (
    value.activeFloor !== undefined &&
    (!Number.isInteger(value.activeFloor) ||
      (value.activeFloor as number) < 0 ||
      (value.activeFloor as number) > 3)
  )
    return false;
  if (
    value.campaignRootSeed !== undefined &&
    (typeof value.campaignRootSeed !== "string" || !value.campaignRootSeed.trim())
  )
    return false;
  if (
    value.campaignBiomeId !== undefined &&
    (typeof value.campaignBiomeId !== "string" || !value.campaignBiomeId.trim())
  )
    return false;
  if (value.visitedFloors !== undefined) {
    if (!isRecord(value.visitedFloors)) return false;
    for (const [floor, cells] of Object.entries(value.visitedFloors)) {
      if (!/^[0-3]$/.test(floor) || !Array.isArray(cells)) return false;
      if (!cells.every((cell) => typeof cell === "string" && /^-?\d+,-?\d+$/.test(cell))) {
        return false;
      }
    }
  }
  if (value.mapRevealed !== undefined && typeof value.mapRevealed !== "boolean") return false;
  if (
    value.mobilityBoostRemaining !== undefined &&
    (!isFiniteNumber(value.mobilityBoostRemaining) ||
      value.mobilityBoostRemaining < 0 ||
      value.mobilityBoostRemaining > MOBILITY_BOOST_DURATION_SECONDS)
  )
    return false;
  if (
    value.fogClearRemaining !== undefined &&
    (!isFiniteNumber(value.fogClearRemaining) ||
      value.fogClearRemaining < 0 ||
      value.fogClearRemaining > FOG_CLEAR_DURATION_SECONDS)
  )
    return false;
  if (
    value.slowCurseRemaining !== undefined &&
    (!isFiniteNumber(value.slowCurseRemaining) ||
      value.slowCurseRemaining < 0 ||
      value.slowCurseRemaining > SLOW_CURSE_DURATION_SECONDS)
  )
    return false;
  if (
    value.frenzyCurseRemaining !== undefined &&
    (!isFiniteNumber(value.frenzyCurseRemaining) ||
      value.frenzyCurseRemaining < 0 ||
      value.frenzyCurseRemaining > FRENZY_CURSE_DURATION_SECONDS)
  )
    return false;
  if (
    value.gloomCurseRemaining !== undefined &&
    (!isFiniteNumber(value.gloomCurseRemaining) ||
      value.gloomCurseRemaining < 0 ||
      value.gloomCurseRemaining > GLOOM_CURSE_DURATION_SECONDS)
  )
    return false;
  if (value.swarmCurseActive !== undefined && typeof value.swarmCurseActive !== "boolean")
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
  if ([x, y, z].some((coordinate) => Math.abs(coordinate) > 1_000_000)) return false;
  if (Math.abs(yaw) > 1_000_000 || Math.abs(pitch) > 1_000_000) return false;
  if (distanceTravelled < 0 || distanceTravelled > MAX_RESUME_DISTANCE_M) return false;
  if (value.perStoneSeconds !== undefined) {
    if (!isRecord(value.perStoneSeconds)) return false;
    const validStones = new Set<StoneId>(STONE_ORDER);
    for (const [id, seconds] of Object.entries(value.perStoneSeconds)) {
      if (!validStones.has(id as StoneId)) return false;
      if (!isFiniteNumber(seconds) || seconds < 0 || seconds > MAX_RESUME_SECONDS) return false;
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
    if (
      parsed.version !== 1 &&
      parsed.version !== 2 &&
      parsed.version !== 3 &&
      parsed.version !== LOCAL_RUN_SAVE_VERSION
    )
      return null;
    const resume =
      parsed.resume === undefined
        ? undefined
        : isLocalRunResumeState(parsed.resume)
          ? parsed.resume
          : null;
    if (resume === null) return null;
    const runSource = isRunSource(parsed.runSource) ? parsed.runSource : undefined;
    const customMapKind =
      parsed.customMapKind === "procedural" || parsed.customMapKind === "forge"
        ? parsed.customMapKind
        : undefined;
    return {
      version: parsed.version,
      savedAt: parsed.savedAt,
      state: parsed.state,
      resume,
      ...(runSource ? { runSource } : {}),
      ...(customMapKind ? { customMapKind } : {}),
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
  customMapKind?: CustomMapKind,
): boolean {
  try {
    const save: LocalRunSave = {
      version: LOCAL_RUN_SAVE_VERSION,
      savedAt,
      state,
      ...(resume ? { resume } : {}),
      ...(runSource ? { runSource } : {}),
      ...(runSource === "custom" && customMapKind ? { customMapKind } : {}),
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
  if (!save || !canContinueDomainRun(save.state)) return false;
  if (save.runSource === "custom") return save.customMapKind === "procedural";
  return true;
}

export function canContinueDomainRun(
  state: DungeonDomainState | null,
): state is DungeonDomainState {
  return Boolean(state && state.runMode === "playing" && !state.exitReached);
}
