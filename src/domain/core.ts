/**
 * Simulation contracts and pure run execution.
 * Free of Three.js, DOM, and concrete persistence drivers.
 */

export type SurfaceId = "dungeon";

export const SURFACE_IDS: readonly SurfaceId[] = ["dungeon"] as const;

export type Seed = string;

/** Shared Dungeon settings stored in the simulation snapshot. */
export type DungeonParams = {
  roomTarget: number;
  loopRate: number;
  decorDensity: number;
  mapWidth: number;
  mapHeight: number;
  minRoomSize: number;
  maxRoomSize: number;
  corridorRadius: number;
  roomPadding: number;
  enemyDensity: number;
  lightLevel: number;
  profile: string;
};

export type DungeonParamKey = keyof DungeonParams;
export type DungeonNumericParamKey = Exclude<DungeonParamKey, "profile">;
export type DungeonParamsProfile = "generation-input" | "observed-build";

export type DungeonParamRange = Readonly<{
  min: number;
  max: number;
  step?: number;
}>;

/** Editor and procedural-generator input. These limits keep generation tractable. */
export const DUNGEON_GENERATION_INPUT_RANGES = Object.freeze({
  roomTarget: { min: 8, max: 28 },
  loopRate: { min: 0, max: 45 },
  decorDensity: { min: 0, max: 100 },
  mapWidth: { min: 41, max: 99, step: 2 },
  mapHeight: { min: 41, max: 99, step: 2 },
  minRoomSize: { min: 3, max: 12 },
  maxRoomSize: { min: 4, max: 16 },
  corridorRadius: { min: 0, max: 2 },
  roomPadding: { min: 1, max: 4 },
  enemyDensity: { min: 0, max: 100 },
  lightLevel: { min: 10, max: 100 },
} as const satisfies Record<DungeonNumericParamKey, DungeonParamRange>);

/**
 * Geometry observed after a build or import. It records the real graph without
 * forcing it back through the narrower procedural-generation controls.
 */
export const DUNGEON_OBSERVED_BUILD_RANGES = Object.freeze({
  roomTarget: { min: 2, max: 80 },
  loopRate: { min: 0, max: 100 },
  decorDensity: { min: 0, max: 100 },
  mapWidth: { min: 3, max: 1024 },
  mapHeight: { min: 3, max: 1024 },
  minRoomSize: { min: 1, max: 15 },
  maxRoomSize: { min: 1, max: 18 },
  corridorRadius: { min: 0, max: 3 },
  roomPadding: { min: 1, max: 4 },
  enemyDensity: { min: 0, max: 100 },
  lightLevel: { min: 10, max: 100 },
} as const satisfies Record<DungeonNumericParamKey, DungeonParamRange>);

export const DUNGEON_PARAM_PROFILES = Object.freeze({
  "generation-input": DUNGEON_GENERATION_INPUT_RANGES,
  "observed-build": DUNGEON_OBSERVED_BUILD_RANGES,
} satisfies Record<
  DungeonParamsProfile,
  Readonly<Record<DungeonNumericParamKey, DungeonParamRange>>
>);

export const DEFAULT_DUNGEON_PARAMS: Readonly<DungeonParams> = Object.freeze({
  roomTarget: 16,
  loopRate: 20,
  decorDensity: 60,
  mapWidth: 73,
  mapHeight: 73,
  minRoomSize: 5,
  maxRoomSize: 9,
  corridorRadius: 0,
  roomPadding: 2,
  enemyDensity: 50,
  lightLevel: 70,
  profile: "balanced",
});

export type DungeonParamsInput = Partial<Record<DungeonParamKey, unknown>>;

export type DungeonParamsContractOptions = Readonly<{
  profile: DungeonParamsProfile;
  fallback?: Readonly<DungeonParams>;
}>;

export type DungeonParamsValidation =
  | { ok: true; params: DungeonParams }
  | { ok: false; message: string };

function normalizeRange(value: unknown, fallback: number, range: DungeonParamRange): number {
  const source = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.min(range.max, Math.max(range.min, Math.round(source)));
  if (!range.step) return clamped;
  const stepped = range.min + Math.round((clamped - range.min) / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, stepped));
}

function normalizeProfile(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function validRange(value: unknown, range: DungeonParamRange): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= range.min &&
    value <= range.max &&
    (range.step === undefined || (value - range.min) % range.step === 0)
  );
}

/** Normalize values using one explicit contract profile. */
export function normalizeDungeonParams(
  input: DungeonParamsInput,
  options: DungeonParamsContractOptions,
): DungeonParams {
  const fallback = options.fallback ?? DEFAULT_DUNGEON_PARAMS;
  const ranges = DUNGEON_PARAM_PROFILES[options.profile];
  const params = {
    roomTarget: normalizeRange(input.roomTarget, fallback.roomTarget, ranges.roomTarget),
    loopRate: normalizeRange(input.loopRate, fallback.loopRate, ranges.loopRate),
    decorDensity: normalizeRange(input.decorDensity, fallback.decorDensity, ranges.decorDensity),
    mapWidth: normalizeRange(input.mapWidth, fallback.mapWidth, ranges.mapWidth),
    mapHeight: normalizeRange(input.mapHeight, fallback.mapHeight, ranges.mapHeight),
    minRoomSize: normalizeRange(input.minRoomSize, fallback.minRoomSize, ranges.minRoomSize),
    maxRoomSize: normalizeRange(input.maxRoomSize, fallback.maxRoomSize, ranges.maxRoomSize),
    corridorRadius: normalizeRange(
      input.corridorRadius,
      fallback.corridorRadius,
      ranges.corridorRadius,
    ),
    roomPadding: normalizeRange(input.roomPadding, fallback.roomPadding, ranges.roomPadding),
    enemyDensity: normalizeRange(input.enemyDensity, fallback.enemyDensity, ranges.enemyDensity),
    lightLevel: normalizeRange(input.lightLevel, fallback.lightLevel, ranges.lightLevel),
    profile: normalizeProfile(input.profile, fallback.profile),
  };
  return params.minRoomSize <= params.maxRoomSize
    ? params
    : { ...params, maxRoomSize: params.minRoomSize };
}

/** Reject invalid host input without changing the current Dungeon parameter snapshot. */
export function validateDungeonParams(
  input: DungeonParamsInput,
  options: DungeonParamsContractOptions,
): DungeonParamsValidation {
  const fallback = options.fallback ?? DEFAULT_DUNGEON_PARAMS;
  const ranges = DUNGEON_PARAM_PROFILES[options.profile];
  for (const [key, range] of Object.entries(ranges) as [
    DungeonNumericParamKey,
    DungeonParamRange,
  ][]) {
    const value = input[key];
    if (value !== undefined && !validRange(value, range)) {
      return {
        ok: false,
        message: `${key} must be an integer ${range.min}..${range.max} for ${options.profile}`,
      };
    }
  }
  if (input.profile !== undefined && (typeof input.profile !== "string" || !input.profile.trim())) {
    return { ok: false, message: "profile must be a non-empty string" };
  }

  const minRoomSize = input.minRoomSize === undefined ? fallback.minRoomSize : input.minRoomSize;
  const maxRoomSize = input.maxRoomSize === undefined ? fallback.maxRoomSize : input.maxRoomSize;
  if (
    typeof minRoomSize === "number" &&
    typeof maxRoomSize === "number" &&
    minRoomSize > maxRoomSize
  ) {
    return { ok: false, message: "minRoomSize must not exceed maxRoomSize" };
  }
  const params = normalizeDungeonParams(input, options);
  return { ok: true, params };
}

export type GameTime = {
  /** Fictional world time units (not wall clock). */
  worldTicks: number;
};

export type GameCommand = {
  type: string;
  payload?: unknown;
};

export type GameEvent = {
  type: string;
  payload?: unknown;
  at: GameTime;
};

export type SimulationContext = {
  now: GameTime;
  seed: Seed;
};

export type PendingDecision = {
  id: string;
  summary: string;
  options: string[];
};

export type RunSnapshot = {
  id: string;
  seed: Seed;
  worldTicks: number;
  schemaVersion: number;
  contentVersion: string;
  /** Free-form chronicle notes for foundation demos. */
  notes: string[];
  pendingDecisions: PendingDecision[];
};

export type SurfaceProjection = {
  surfaceId: SurfaceId;
  runId: string;
  seed: Seed;
  worldTicks: number;
  schemaVersion: number;
  contentVersion: string;
  notes: string[];
  pendingDecisions: PendingDecision[];
  headline: string;
};

export type ExecuteOk = {
  ok: true;
  run: RunSnapshot;
  events: GameEvent[];
  pendingDecisions: PendingDecision[];
};

export type ExecuteErr = {
  ok: false;
  error: {
    code: "unknown_command" | "invalid_payload" | "invalid_surface";
    message: string;
  };
  run: RunSnapshot;
  events: GameEvent[];
  pendingDecisions: PendingDecision[];
};

export type ExecuteResult = ExecuteOk | ExecuteErr;

export const SCHEMA_VERSION = 1;
export const CONTENT_VERSION = "v0-foundation";

export function createEmptyResult(_now: GameTime): {
  events: GameEvent[];
  pendingDecisions: PendingDecision[];
} {
  return { events: [], pendingDecisions: [] };
}

export function createInitialRun(seed: Seed = "seed-0", id = "run-local"): RunSnapshot {
  return {
    id,
    seed,
    worldTicks: 0,
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    notes: [],
    pendingDecisions: [],
  };
}

export function isSurfaceId(value: string): value is SurfaceId {
  return (SURFACE_IDS as readonly string[]).includes(value);
}

function at(run: RunSnapshot): GameTime {
  return { worldTicks: run.worldTicks };
}

function cloneRun(run: RunSnapshot): RunSnapshot {
  return {
    ...run,
    notes: [...run.notes],
    pendingDecisions: run.pendingDecisions.map((d) => ({
      ...d,
      options: [...d.options],
    })),
  };
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (payload === undefined || payload === null) return {};
  if (typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

/**
 * Pure command execution. Deterministic given the same run + command.
 */
export function executeCommand(run: RunSnapshot, command: GameCommand): ExecuteResult {
  const next = cloneRun(run);
  const events: GameEvent[] = [];

  switch (command.type) {
    case "run/noop": {
      events.push({ type: "run/noop", payload: {}, at: at(next) });
      return {
        ok: true,
        run: next,
        events,
        pendingDecisions: next.pendingDecisions,
      };
    }
    case "run/advance": {
      const body = asRecord(command.payload);
      if (body === null) {
        return {
          ok: false,
          error: { code: "invalid_payload", message: "run/advance payload must be an object" },
          run: cloneRun(run),
          events: [],
          pendingDecisions: run.pendingDecisions,
        };
      }
      const ticksRaw = body.ticks;
      const ticks =
        ticksRaw === undefined
          ? 1
          : typeof ticksRaw === "number" && Number.isInteger(ticksRaw)
            ? ticksRaw
            : NaN;
      if (!Number.isFinite(ticks) || ticks < 1 || ticks > 10_000) {
        return {
          ok: false,
          error: {
            code: "invalid_payload",
            message: "run/advance.ticks must be an integer 1..10000",
          },
          run: cloneRun(run),
          events: [],
          pendingDecisions: run.pendingDecisions,
        };
      }
      next.worldTicks += ticks;
      events.push({
        type: "run/advanced",
        payload: { ticks, worldTicks: next.worldTicks },
        at: at(next),
      });
      return {
        ok: true,
        run: next,
        events,
        pendingDecisions: next.pendingDecisions,
      };
    }
    case "run/note": {
      const body = asRecord(command.payload);
      if (body === null || typeof body.text !== "string" || body.text.trim() === "") {
        return {
          ok: false,
          error: { code: "invalid_payload", message: "run/note requires payload.text string" },
          run: cloneRun(run),
          events: [],
          pendingDecisions: run.pendingDecisions,
        };
      }
      const text = body.text.trim();
      next.notes.push(text);
      events.push({ type: "run/note-added", payload: { text }, at: at(next) });
      return {
        ok: true,
        run: next,
        events,
        pendingDecisions: next.pendingDecisions,
      };
    }
    case "run/request-decision": {
      const body = asRecord(command.payload) ?? {};
      const summary =
        typeof body.summary === "string" && body.summary.trim()
          ? body.summary.trim()
          : "A decision is pending";
      const options =
        Array.isArray(body.options) && body.options.every((o) => typeof o === "string")
          ? (body.options as string[])
          : ["accept", "defer"];
      const id =
        typeof body.id === "string" && body.id.trim()
          ? body.id.trim()
          : `decision-${next.worldTicks}-${next.pendingDecisions.length + 1}`;
      const decision: PendingDecision = { id, summary, options: [...options] };
      next.pendingDecisions = [...next.pendingDecisions, decision];
      events.push({ type: "run/decision-requested", payload: decision, at: at(next) });
      return {
        ok: true,
        run: next,
        events,
        pendingDecisions: next.pendingDecisions,
      };
    }
    case "run/resolve-decision": {
      const body = asRecord(command.payload);
      if (body === null || typeof body.id !== "string" || typeof body.choice !== "string") {
        return {
          ok: false,
          error: {
            code: "invalid_payload",
            message: "run/resolve-decision requires payload.id and payload.choice",
          },
          run: cloneRun(run),
          events: [],
          pendingDecisions: run.pendingDecisions,
        };
      }
      const idx = next.pendingDecisions.findIndex((d) => d.id === body.id);
      if (idx < 0) {
        return {
          ok: false,
          error: { code: "invalid_payload", message: `unknown decision id: ${body.id}` },
          run: cloneRun(run),
          events: [],
          pendingDecisions: run.pendingDecisions,
        };
      }
      const [resolved] = next.pendingDecisions.splice(idx, 1);
      events.push({
        type: "run/decision-resolved",
        payload: { id: resolved.id, choice: body.choice },
        at: at(next),
      });
      return {
        ok: true,
        run: next,
        events,
        pendingDecisions: next.pendingDecisions,
      };
    }
    default:
      return {
        ok: false,
        error: { code: "unknown_command", message: `unknown command: ${command.type}` },
        run: cloneRun(run),
        events: [],
        pendingDecisions: run.pendingDecisions,
      };
  }
}

export function projectSurface(run: RunSnapshot, surfaceId: SurfaceId): SurfaceProjection {
  return {
    surfaceId,
    runId: run.id,
    seed: run.seed,
    worldTicks: run.worldTicks,
    schemaVersion: run.schemaVersion,
    contentVersion: run.contentVersion,
    notes: [...run.notes],
    pendingDecisions: run.pendingDecisions.map((d) => ({
      ...d,
      options: [...d.options],
    })),
    headline: `${surfaceId} | ticks=${run.worldTicks} | notes=${run.notes.length}`,
  };
}

export function runEnvelope(run: RunSnapshot) {
  return {
    id: run.id,
    seed: run.seed,
    worldTicks: run.worldTicks,
    schemaVersion: run.schemaVersion,
    contentVersion: run.contentVersion,
  };
}
