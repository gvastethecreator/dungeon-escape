import type { DungeonDomainState } from "../domain/bridge";
import { STONE_ORDER, type StoneId } from "../ui/copy";

export const LOCAL_RUN_SAVE_KEY = "blackflag.dungeon.run.v1";

export interface LocalRunSave {
  version: 1;
  savedAt: number;
  state: DungeonDomainState;
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

export function readLocalRunSave(storage: StoragePort = localStorage): LocalRunSave | null {
  try {
    const raw = storage.getItem(LOCAL_RUN_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.savedAt !== "number")
      return null;
    if (!Number.isFinite(parsed.savedAt) || !isDungeonDomainState(parsed.state)) return null;
    return parsed as unknown as LocalRunSave;
  } catch {
    return null;
  }
}

export function writeLocalRunSave(
  state: DungeonDomainState,
  storage: StoragePort = localStorage,
  savedAt = Date.now(),
): boolean {
  try {
    const save: LocalRunSave = { version: 1, savedAt, state };
    storage.setItem(LOCAL_RUN_SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
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
