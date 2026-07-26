import {
  CONTENT_VERSION,
  createInitialRun,
  DEFAULT_DUNGEON_PARAMS,
  SCHEMA_VERSION,
  validateDungeonParams,
  type DungeonParams,
  type ExecuteResult,
  type GameCommand,
  type GameEvent,
  type RunSnapshot,
  type SurfaceProjection,
} from "./core";

const DUNGEON_STONE_IDS = ["ember", "ash", "crypt", "verdant"] as const;

export type DungeonRunMode = "playing" | "dead" | "won";

export type DungeonDomainState = DungeonParams & {
  floor: number;
  room: string;
  mapped: number;
  threat: number;
  seed: string;
  exploredCells: number;
  hasRelic: boolean;
  exitReached: boolean;
  resolve: number;
  foundStoneIds: string[];
  portalOpen: boolean;
  runMode: DungeonRunMode;
  engineMode: "editor" | "debug" | "play";
  topologySignature: string;
};

export type DungeonDomainProjection = {
  domainId: "dungeons";
  title: string;
  summary: string;
  metrics: Record<string, string | number | boolean>;
  lines: string[];
};

export type FullRunSnapshot = RunSnapshot & {
  domains: { dungeons: DungeonDomainState };
};

export type FullSurfaceProjection = SurfaceProjection & {
  domainId: "dungeons";
  domain: DungeonDomainProjection;
  allDomainSummaries: Array<{ id: "dungeons"; title: string; summary: string }>;
};

type DungeonSessionFields = Pick<
  DungeonDomainState,
  "resolve" | "foundStoneIds" | "portalOpen" | "runMode" | "exitReached"
>;

function asObject(payload: unknown): Record<string, unknown> | null {
  if (payload === undefined || payload === null) return {};
  if (typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

function intField(
  body: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number | null {
  const value = body[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

function createDungeonState(seed: string): DungeonDomainState {
  return {
    floor: 1,
    room: "entrance",
    mapped: 1,
    threat: 1,
    seed,
    ...DEFAULT_DUNGEON_PARAMS,
    exploredCells: 0,
    hasRelic: false,
    exitReached: false,
    resolve: 100,
    foundStoneIds: [],
    portalOpen: false,
    runMode: "playing",
    engineMode: "editor",
    topologySignature: "",
  };
}

function readDungeonSession(
  body: Record<string, unknown>,
  fallback?: DungeonSessionFields,
): { ok: true; value: DungeonSessionFields } | { ok: false; message: string } {
  const resolve = body.resolve ?? fallback?.resolve;
  if (typeof resolve !== "number" || !Number.isInteger(resolve) || resolve < 0 || resolve > 100) {
    return { ok: false, message: "resolve must be an integer from 0 to 100" };
  }
  const rawFoundStoneIds = body.foundStoneIds ?? fallback?.foundStoneIds;
  if (!Array.isArray(rawFoundStoneIds))
    return { ok: false, message: "foundStoneIds must be an array" };
  const foundStoneIds = rawFoundStoneIds.filter(
    (id): id is string =>
      typeof id === "string" && (DUNGEON_STONE_IDS as readonly string[]).includes(id),
  );
  if (
    foundStoneIds.length !== rawFoundStoneIds.length ||
    new Set(foundStoneIds).size !== foundStoneIds.length
  ) {
    return { ok: false, message: "foundStoneIds contains an unknown or duplicate stone" };
  }
  const portalOpen = body.portalOpen ?? fallback?.portalOpen;
  const runMode = body.runMode ?? fallback?.runMode;
  const exitReached = body.exitReached ?? fallback?.exitReached;
  if (typeof portalOpen !== "boolean" || typeof exitReached !== "boolean") {
    return { ok: false, message: "portalOpen and exitReached must be boolean" };
  }
  if (runMode !== "playing" && runMode !== "dead" && runMode !== "won") {
    return { ok: false, message: "runMode must be playing|dead|won" };
  }
  if (portalOpen !== (foundStoneIds.length === DUNGEON_STONE_IDS.length)) {
    return { ok: false, message: "portalOpen must match the four collected stones" };
  }
  if (exitReached !== (runMode === "won") || (runMode === "won" && !portalOpen)) {
    return { ok: false, message: "exitReached and runMode are inconsistent" };
  }
  return { ok: true, value: { resolve, foundStoneIds, portalOpen, runMode, exitReached } };
}

function fail(run: FullRunSnapshot, message: string): ExecuteResult {
  return {
    ok: false,
    error: { code: "invalid_payload", message },
    run,
    events: [],
    pendingDecisions: run.pendingDecisions,
  };
}

function unknown(run: FullRunSnapshot, type: string): ExecuteResult {
  return {
    ok: false,
    error: { code: "unknown_command", message: `unknown command: ${type}` },
    run,
    events: [],
    pendingDecisions: run.pendingDecisions,
  };
}

function succeed(
  run: FullRunSnapshot,
  state: DungeonDomainState,
  event: Omit<GameEvent, "at">,
): ExecuteResult {
  const next: FullRunSnapshot = { ...run, domains: { dungeons: state } };
  return {
    ok: true,
    run: next,
    events: [{ ...event, at: { worldTicks: next.worldTicks } }],
    pendingDecisions: next.pendingDecisions,
  };
}

export function createFullRun(seed = "seed-0", id = "run-local"): FullRunSnapshot {
  return {
    ...createInitialRun(seed, id),
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    domains: { dungeons: createDungeonState(seed) },
  };
}

/** Pure Dungeon-only command runtime. It is the local authority for standalone play. */
export function executeSim(run: FullRunSnapshot, command: GameCommand): ExecuteResult {
  const state = run.domains.dungeons;
  const body = asObject(command.payload);
  if (!command.type.startsWith("dungeons/")) return unknown(run, command.type);
  if (!body) return fail(run, "command payload must be an object");

  switch (command.type.slice("dungeons/".length)) {
    case "move": {
      if (typeof body.room !== "string") return fail(run, "room required");
      const mapped = Math.max(
        state.mapped,
        typeof body.mapped === "number" ? body.mapped : state.mapped + 1,
      );
      return succeed(
        run,
        { ...state, room: body.room, mapped },
        { type: "dungeons/moved", payload: { room: body.room, mapped } },
      );
    }
    case "setSeed": {
      if (typeof body.seed !== "string" || !body.seed.trim()) return fail(run, "seed required");
      const seed = body.seed.trim();
      return succeed(
        run,
        {
          ...state,
          seed,
          room: "entrance",
          mapped: 1,
          exploredCells: 0,
          hasRelic: false,
          exitReached: false,
          resolve: 100,
          foundStoneIds: [],
          portalOpen: false,
          runMode: "playing",
          topologySignature: "",
        },
        { type: "dungeons/seed-set", payload: { seed } },
      );
    }
    case "setParams": {
      const validation = validateDungeonParams(body, {
        profile: "observed-build",
        fallback: state,
      });
      if (!validation.ok) return fail(run, validation.message);
      return succeed(
        run,
        { ...state, ...validation.params },
        { type: "dungeons/params", payload: validation.params },
      );
    }
    case "setEngineMode": {
      const mode = body.mode;
      if (mode !== "editor" && mode !== "debug" && mode !== "play")
        return fail(run, "mode must be editor|debug|play");
      return succeed(
        run,
        { ...state, engineMode: mode },
        { type: "dungeons/engine-mode", payload: { mode } },
      );
    }
    case "syncExplore": {
      const room = typeof body.room === "string" ? body.room : state.room;
      const exploredCells =
        typeof body.exploredCells === "number" && Number.isInteger(body.exploredCells)
          ? Math.max(0, body.exploredCells)
          : state.exploredCells;
      const mapped =
        typeof body.mapped === "number" && Number.isInteger(body.mapped)
          ? Math.max(1, body.mapped)
          : Math.max(state.mapped, exploredCells);
      const topologySignature =
        body.topologySignature === undefined
          ? state.topologySignature
          : typeof body.topologySignature === "string" && body.topologySignature.trim()
            ? body.topologySignature
            : null;
      const threat =
        body.threat === undefined ? state.threat : intField(body, "threat", state.threat, 0, 99);
      if (threat === null) return fail(run, "threat invalid");
      if (topologySignature === null) return fail(run, "topologySignature must be non-empty");
      return succeed(
        run,
        { ...state, room, exploredCells, mapped, topologySignature, threat },
        { type: "dungeons/explore-synced", payload: { room, exploredCells, mapped, threat } },
      );
    }
    case "syncSession": {
      const session = readDungeonSession(body);
      if (!session.ok) return fail(run, session.message);
      return succeed(
        run,
        { ...state, ...session.value, hasRelic: session.value.portalOpen },
        { type: "dungeons/session-synced", payload: session.value },
      );
    }
    case "descend": {
      const floor = state.floor + 1;
      const seed =
        typeof body.seed === "string" && body.seed.trim()
          ? body.seed.trim()
          : `${state.seed}-F${floor}`;
      return succeed(
        run,
        {
          ...state,
          floor,
          seed,
          room: "entrance",
          mapped: 1,
          exploredCells: 0,
          threat: state.threat + 1,
          hasRelic: false,
          exitReached: false,
          resolve: 100,
          foundStoneIds: [],
          portalOpen: false,
          runMode: "playing",
          topologySignature: "",
        },
        { type: "dungeons/descended", payload: { floor, seed } },
      );
    }
    case "raiseThreat": {
      const by = intField(body, "by", 1, 1, 5);
      if (by === null) return fail(run, "by invalid");
      const threat = state.threat + by;
      return succeed(run, { ...state, threat }, { type: "dungeons/threat", payload: { threat } });
    }
    case "hydrate": {
      if (typeof body.seed !== "string" || !body.seed.trim())
        return fail(run, "hydrate requires seed");
      const floor = body.floor === undefined ? 1 : intField(body, "floor", 1, 1, 99);
      const threat =
        body.threat === undefined ? state.threat : intField(body, "threat", state.threat, 0, 99);
      const exploredCells =
        typeof body.exploredCells === "number" && Number.isInteger(body.exploredCells)
          ? Math.max(0, body.exploredCells)
          : 0;
      const mapped =
        typeof body.mapped === "number" && Number.isInteger(body.mapped)
          ? Math.max(1, body.mapped)
          : 1;
      if (floor === null || threat === null) return fail(run, "hydrate fields invalid");
      const engineMode =
        body.engineMode === "editor" || body.engineMode === "debug" || body.engineMode === "play"
          ? body.engineMode
          : state.engineMode;
      const params = validateDungeonParams(body, { profile: "observed-build", fallback: state });
      if (!params.ok) return fail(run, params.message);
      const legacyFoundStoneIds = Array.isArray(body.foundStoneIds)
        ? body.foundStoneIds
        : body.hasRelic
          ? [...DUNGEON_STONE_IDS]
          : [];
      const session = readDungeonSession(
        {
          resolve: body.resolve ?? 100,
          foundStoneIds: legacyFoundStoneIds,
          portalOpen: body.portalOpen ?? Boolean(body.hasRelic),
          runMode: body.runMode ?? (body.exitReached ? "won" : "playing"),
          exitReached: Boolean(body.exitReached),
        },
        state,
      );
      if (!session.ok) return fail(run, session.message);
      const next: DungeonDomainState = {
        ...state,
        floor,
        room: typeof body.room === "string" ? body.room : "entrance",
        mapped,
        threat,
        seed: body.seed.trim(),
        exploredCells,
        hasRelic: session.value.portalOpen,
        ...session.value,
        engineMode,
        topologySignature: typeof body.topologySignature === "string" ? body.topologySignature : "",
        ...params.params,
      };
      return succeed(run, next, { type: "dungeons/hydrated", payload: { seed: next.seed, floor } });
    }
    default:
      return unknown(run, command.type);
  }
}

export function projectSurfaceFull(run: FullRunSnapshot): FullSurfaceProjection {
  const state = run.domains.dungeons;
  const domain: DungeonDomainProjection = {
    domainId: "dungeons",
    title: "Dungeon",
    summary: `Floor ${state.floor} · ${state.room} · seed ${state.seed} · ${state.profile}`,
    metrics: {
      floor: state.floor,
      room: state.room,
      mapped: state.mapped,
      threat: state.threat,
      seed: state.seed,
      roomTarget: state.roomTarget,
      loopRate: state.loopRate,
      decorDensity: state.decorDensity,
      mapWidth: state.mapWidth,
      mapHeight: state.mapHeight,
      minRoomSize: state.minRoomSize,
      maxRoomSize: state.maxRoomSize,
      corridorRadius: state.corridorRadius,
      roomPadding: state.roomPadding,
      enemyDensity: state.enemyDensity,
      lightLevel: state.lightLevel,
      profile: state.profile,
      exploredCells: state.exploredCells,
      hasRelic: state.hasRelic,
      exitReached: state.exitReached,
      resolve: state.resolve,
      foundStoneIds: state.foundStoneIds.join(","),
      portalOpen: state.portalOpen,
      runMode: state.runMode,
      engineMode: state.engineMode,
    },
    lines: [
      `Seed: ${state.seed} · profile ${state.profile}`,
      `Floor ${state.floor} · room ${state.room}`,
      `Map ${state.mapWidth}×${state.mapHeight} · rooms ${state.roomTarget} · loops ${state.loopRate}%`,
      `Room ${state.minRoomSize}–${state.maxRoomSize} · corridor r${state.corridorRadius} · pad ${state.roomPadding}`,
      `Decor ${state.decorDensity}% · enemies ${state.enemyDensity}% · light ${state.lightLevel}%`,
      `Explored ${state.exploredCells} · threat ${state.threat} · ${state.engineMode}`,
      `Health ${state.resolve} · stones ${state.foundStoneIds.length}/${DUNGEON_STONE_IDS.length} · ${state.runMode}`,
      state.hasRelic ? "Portal stones bound" : "Magic stones pending",
    ],
  };
  return {
    surfaceId: "dungeon",
    runId: run.id,
    seed: run.seed,
    worldTicks: run.worldTicks,
    schemaVersion: run.schemaVersion,
    contentVersion: run.contentVersion,
    notes: run.notes,
    pendingDecisions: run.pendingDecisions,
    headline: `${domain.title} | ${domain.summary}`,
    domainId: "dungeons",
    domain,
    allDomainSummaries: [{ id: "dungeons", title: domain.title, summary: domain.summary }],
  };
}
