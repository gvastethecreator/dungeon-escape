/**
 * Bridge between the runtime and the local Dungeon command state.
 * Local apply is cheap; remote push is debounced and never does a health check per command.
 */
import {
  createFullRun,
  executeSim,
  projectSurfaceFull,
  type FullRunSnapshot,
  type FullSurfaceProjection,
} from "./runtime";
import type { AuthorityClient } from "../authority/client";
import type { EngineMode } from "../game/EngineMode";
import type { PersistedRunSession } from "../game/RunSession";
import { AuthorityWriteQueue } from "./AuthorityWriteQueue";

export type DungeonDomainState = {
  floor: number;
  room: string;
  mapped: number;
  threat: number;
  seed: string;
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
  exploredCells: number;
  hasRelic: boolean;
  exitReached: boolean;
  resolve: number;
  foundStoneIds: PersistedRunSession["foundStoneIds"];
  portalOpen: boolean;
  runMode: PersistedRunSession["runMode"];
  engineMode: string;
  topologySignature: string;
};

export type BridgeStatus = {
  online: boolean;
  lastError: string | null;
  lastPushAt: number | null;
  lastHydrateAt: number | null;
};

const REMOTE_IMMEDIATE = new Set([
  "dungeons/setSeed",
  "dungeons/setParams",
  "dungeons/setEngineMode",
  "dungeons/syncSession",
  "dungeons/descend",
  "dungeons/hydrate",
]);

export function shellModeToEngine(mode: string | null | undefined): EngineMode {
  if (mode === "play") return "play";
  if (mode === "debug") return "debug";
  return "editor";
}

export function engineModeToShell(mode: EngineMode): "editor" | "play" | "debug" {
  return mode;
}

export type DomainBridgeOptions = {
  initialSeed?: string;
  authority?: AuthorityClient | null;
  authorityRunId?: string;
  /** Stable identity used by the backend to reject late writes from this bridge. */
  clientId?: string;
  /** Bounds a stalled remote write so later FIFO work can continue. */
  pushTimeoutMs?: number;
};

export type ApplyOptions = {
  /** Default true for important cmds, false for explore. */
  remote?: boolean;
};

export function createDomainBridge(options: DomainBridgeOptions | string = "CAMPANA-17") {
  const opts: DomainBridgeOptions =
    typeof options === "string" ? { initialSeed: options } : options;
  const initialSeed = opts.initialSeed ?? "CAMPANA-17";
  const initialAuthorityRunId = opts.authorityRunId?.trim() || null;
  let status: BridgeStatus = {
    online: false,
    lastError: null,
    lastPushAt: null,
    lastHydrateAt: null,
  };
  let lastProbeAt = 0;
  let hydrateSequence = 0;
  let runTransitionActive = false;
  const authorityWrites = new AuthorityWriteQueue({
    authority: opts.authority ?? null,
    expectedRunId: initialAuthorityRunId,
    clientId: opts.clientId,
    pushTimeoutMs: opts.pushTimeoutMs,
    onStatus(patch) {
      status = { ...status, ...patch };
    },
  });

  let run: FullRunSnapshot = createFullRun(initialSeed, initialAuthorityRunId ?? "run-dungeon");
  const seeded = executeSim(run, { type: "dungeons/setSeed", payload: { seed: initialSeed } });
  if (seeded.ok) run = seeded.run as FullRunSnapshot;

  const dungeonState = (): DungeonDomainState => run.domains.dungeons as DungeonDomainState;

  const transitionBlockedResult = () => ({
    ok: false as const,
    error: {
      code: "invalid_payload" as const,
      message: "dungeon command blocked during authority run transition",
    },
    run,
    events: [],
    pendingDecisions: run.pendingDecisions,
  });

  const apply = (
    type: string,
    payload?: unknown,
    applyOpts: ApplyOptions = {},
    orderedRemote = false,
  ) => {
    if (runTransitionActive) return transitionBlockedResult();
    const result = executeSim(run, { type, payload });
    if (result.ok) {
      run = result.run as FullRunSnapshot;
      const remote =
        applyOpts.remote ?? (REMOTE_IMMEDIATE.has(type) || type === "dungeons/raiseThreat");
      authorityWrites.recordMutation(
        remote || type === "dungeons/syncExplore"
          ? {
              type,
              payload,
              ordered:
                remote &&
                (orderedRemote || REMOTE_IMMEDIATE.has(type) || type === "dungeons/syncExplore"),
            }
          : undefined,
      );
    }
    return result;
  };

  return {
    getRun: () => run,
    getDungeon: dungeonState,
    getStatus: () => ({ ...status }),
    getAuthorityRunId: () => authorityWrites.context().expectedRunId,
    bindAuthorityRun(runId: string) {
      const normalized = runId.trim();
      if (!normalized || runTransitionActive || !authorityWrites.isClean()) return false;
      hydrateSequence += 1;
      authorityWrites.setExpectedRunId(normalized);
      run = { ...run, id: normalized };
      return true;
    },
    setAuthority(next: AuthorityClient | null, runId?: string) {
      const normalizedRunId = runId?.trim();
      const replaced = authorityWrites.replaceAuthority(next, normalizedRunId || undefined, {
        ...dungeonState(),
      });
      if (!replaced) return;
      hydrateSequence += 1;
      if (normalizedRunId) {
        run = { ...run, id: normalizedRunId };
      }
    },
    /** Flushes coalesced explore and waits for every earlier remote mutation. */
    async drainRemoteWrites(): Promise<boolean> {
      return authorityWrites.drain();
    },
    async beginRunTransition(): Promise<boolean> {
      if (runTransitionActive) return false;
      runTransitionActive = true;
      hydrateSequence += 1;
      return authorityWrites.drain();
    },
    completeRunTransition(runId: string): boolean {
      const normalized = runId.trim();
      if (!runTransitionActive || !normalized || !authorityWrites.isClean()) return false;
      hydrateSequence += 1;
      authorityWrites.setExpectedRunId(normalized);
      run = { ...run, id: normalized };
      runTransitionActive = false;
      return true;
    },
    cancelRunTransition(): boolean {
      if (!runTransitionActive) return false;
      hydrateSequence += 1;
      runTransitionActive = false;
      return true;
    },
    /** Pushes the complete local snapshot to repair any unacknowledged revision. */
    reconcileRemote() {
      if (runTransitionActive) return false;
      return authorityWrites.reconcile({ ...dungeonState() });
    },
    project: (): FullSurfaceProjection => projectSurfaceFull(run),

    setSeed(seed: string) {
      return apply("dungeons/setSeed", { seed });
    },

    setParams(params: Record<string, unknown>) {
      return apply("dungeons/setParams", params);
    },

    setEngineMode(mode: EngineMode) {
      return apply("dungeons/setEngineMode", { mode });
    },

    syncExplore(
      patch: {
        room?: string;
        exploredCells?: number;
        mapped?: number;
        topologySignature?: string;
        threat?: number;
      },
      applyOpts: ApplyOptions = {},
    ) {
      return apply("dungeons/syncExplore", patch, {
        remote: applyOpts.remote ?? false,
      });
    },

    syncSession(session: PersistedRunSession) {
      return apply("dungeons/syncSession", session, { remote: true });
    },

    descend(seed?: string) {
      return apply("dungeons/descend", seed ? { seed } : {});
    },

    captureBuild(input: {
      seed: string;
      topologySignature: string;
      roomTarget: number;
      loopRate: number;
      decorDensity: number;
      mapWidth?: number;
      mapHeight?: number;
      minRoomSize?: number;
      maxRoomSize?: number;
      corridorRadius?: number;
      roomPadding?: number;
      enemyDensity?: number;
      lightLevel?: number;
      profile?: string;
    }) {
      if (runTransitionActive) return transitionBlockedResult();
      let candidate = run;
      const seedResult = executeSim(candidate, {
        type: "dungeons/setSeed",
        payload: { seed: input.seed },
      });
      if (!seedResult.ok) return seedResult;
      candidate = seedResult.run as FullRunSnapshot;

      const paramsResult = executeSim(candidate, {
        type: "dungeons/setParams",
        payload: { ...input },
      });
      if (!paramsResult.ok) return paramsResult;
      candidate = paramsResult.run as FullRunSnapshot;

      const result = executeSim(candidate, {
        type: "dungeons/syncExplore",
        payload: {
          room: "entrance",
          exploredCells: 1,
          mapped: 1,
          topologySignature: input.topologySignature,
        },
      });
      if (!result.ok) return result;
      candidate = result.run as FullRunSnapshot;

      run = candidate;
      authorityWrites.recordMutation({
        type: "dungeons/hydrate",
        payload: { ...(candidate.domains.dungeons as DungeonDomainState) },
        ordered: true,
      });
      return result;
    },

    async hydrateFromAuthority(): Promise<{ seed: string; state: DungeonDomainState } | null> {
      const authorityContext = authorityWrites.context();
      if (
        runTransitionActive ||
        !authorityContext.authority ||
        !authorityWrites.canHydrate(authorityContext)
      ) {
        return null;
      }
      const targetAuthority = authorityContext.authority;
      const expectedRunId = authorityContext.expectedRunId;
      const hydrateRequest = ++hydrateSequence;
      const hydrateContextIsCurrent = () =>
        !runTransitionActive &&
        hydrateRequest === hydrateSequence &&
        authorityWrites.canHydrate(authorityContext);
      try {
        const reachable = await targetAuthority.isReachable();
        if (!hydrateContextIsCurrent()) return null;
        status = {
          ...status,
          online: reachable,
          lastError:
            authorityWrites.getUnreconciledError() ?? (reachable ? null : "backend unreachable"),
        };
        if (!reachable) return null;
        const remote = await targetAuthority.getDomain("dungeons");
        if (!hydrateContextIsCurrent()) return null;
        const state = remote.state as DungeonDomainState;
        if (!state || typeof state.seed !== "string" || !state.seed.trim()) {
          status = {
            ...status,
            lastError:
              authorityWrites.getUnreconciledError() ?? "remote dungeon state missing seed",
          };
          return null;
        }
        if (expectedRunId && remote.run?.id !== expectedRunId) {
          status = {
            ...status,
            lastError: `remote run mismatch: expected ${expectedRunId}, got ${remote.run?.id ?? "unknown"}`,
          };
          return null;
        }
        const result = executeSim(run, { type: "dungeons/hydrate", payload: state });
        if (!hydrateContextIsCurrent()) return null;
        if (!result.ok) {
          status = {
            ...status,
            lastError: authorityWrites.getUnreconciledError() ?? result.error.message,
          };
          return null;
        }
        run = result.run as FullRunSnapshot;
        status = { ...status, online: true, lastHydrateAt: Date.now(), lastError: null };
        return { seed: dungeonState().seed, state: dungeonState() };
      } catch (err) {
        if (!hydrateContextIsCurrent()) return null;
        status = {
          ...status,
          online: false,
          lastError:
            authorityWrites.getUnreconciledError() ??
            (err instanceof Error ? err.message : String(err)),
        };
        return null;
      }
    },

    async probeAuthority(): Promise<boolean> {
      const authorityContext = authorityWrites.context();
      if (!authorityContext.authority) {
        status = { ...status, online: false };
        return false;
      }
      const now = Date.now();
      if (now - lastProbeAt < 4000 && status.online) return true;
      lastProbeAt = now;
      try {
        const ok = await authorityContext.authority.isReachable();
        if (!authorityWrites.isAuthorityContextCurrent(authorityContext)) return false;
        status = {
          ...status,
          online: ok,
          lastError: authorityWrites.getUnreconciledError() ?? (ok ? null : "backend unreachable"),
        };
        return ok;
      } catch (err) {
        if (!authorityWrites.isAuthorityContextCurrent(authorityContext)) return false;
        status = {
          ...status,
          online: false,
          lastError:
            authorityWrites.getUnreconciledError() ??
            (err instanceof Error ? err.message : String(err)),
        };
        return false;
      }
    },
  };
}

export type DomainBridge = ReturnType<typeof createDomainBridge>;

export function roomLabelForCell(
  rooms: Array<{ id: number; x: number; y: number; width: number; height: number; role: string }>,
  cell: { x: number; y: number },
): string {
  const room = rooms.find(
    (r) => cell.x >= r.x && cell.y >= r.y && cell.x < r.x + r.width && cell.y < r.y + r.height,
  );
  if (!room) return "corridor";
  if (room.role === "entrance") return "entrance";
  if (room.role === "exit") return "exit";
  return `room-${room.id}`;
}
