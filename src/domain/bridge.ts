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

export function readModeFromUrl(search = window.location.search): EngineMode {
  const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("mode");
  return shellModeToEngine(raw);
}

export function writeModeToUrl(mode: EngineMode): void {
  const url = new URL(window.location.href);
  url.searchParams.set("mode", engineModeToShell(mode));
  window.history.replaceState({}, "", url);
}

export function readSeedFromUrl(search = window.location.search): string | null {
  const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("seed");
  return raw && raw.trim() ? raw.trim() : null;
}

/**
 * Optional lighting biome override: `?mood=frost` or `?theme=molten`.
 * Wins over profile/seed so proof captures and playtests can force a look.
 */
export function readMoodFromUrl(search = window.location.search): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get("mood") ?? params.get("theme");
  return raw && raw.trim() ? raw.trim().toLowerCase() : null;
}

export function writeSeedToUrl(seed: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("seed", seed);
  window.history.replaceState({}, "", url);
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

type RemoteJob = {
  type: string;
  payload?: unknown;
  revisions: number[];
  clientRevision: number;
  expectedRunId?: string;
  reconcilesThrough?: number;
};

type ActivePush = {
  epoch: number;
  controller: AbortController;
  job: RemoteJob;
};

type DrainWaiter = {
  epoch: number;
  resolve: (ok: boolean) => void;
};

export function createDomainBridge(options: DomainBridgeOptions | string = "CAMPANA-17") {
  const opts: DomainBridgeOptions =
    typeof options === "string" ? { initialSeed: options } : options;
  const initialSeed = opts.initialSeed ?? "CAMPANA-17";
  const configuredPushTimeout = opts.pushTimeoutMs ?? 10_000;
  const pushTimeoutMs =
    Number.isFinite(configuredPushTimeout) && configuredPushTimeout > 0
      ? configuredPushTimeout
      : 10_000;
  const clientId =
    opts.clientId?.trim() ||
    globalThis.crypto?.randomUUID?.() ||
    `dungeon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let authorityRunId = opts.authorityRunId?.trim() || null;
  let authority = opts.authority ?? null;
  let authorityEpoch = 0;
  let status: BridgeStatus = {
    online: false,
    lastError: null,
    lastPushAt: null,
    lastHydrateAt: null,
  };
  let lastProbeAt = 0;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingExplore: RemoteJob | null = null;
  const remoteQueue: RemoteJob[] = [];
  let activePush: ActivePush | null = null;
  let localRevision = 0;
  let remoteCommandRevision = 0;
  let acknowledgedRevision = 0;
  let hydrateSequence = 0;
  let unreconciledPushError: string | null = null;
  let reconciliationPending = false;
  let runTransitionActive = false;
  const acknowledgedOutOfOrder = new Set<number>();
  const drainWaiters = new Set<DrainWaiter>();

  let run: FullRunSnapshot = createFullRun(initialSeed, authorityRunId ?? "run-dungeon");
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

  const acknowledgeRemote = (job: RemoteJob) => {
    if (job.reconcilesThrough !== undefined) {
      acknowledgedRevision = Math.max(acknowledgedRevision, job.reconcilesThrough);
      for (const revision of acknowledgedOutOfOrder) {
        if (revision <= acknowledgedRevision) acknowledgedOutOfOrder.delete(revision);
      }
      return;
    }
    for (const revision of job.revisions) acknowledgedOutOfOrder.add(revision);
    while (acknowledgedOutOfOrder.delete(acknowledgedRevision + 1)) {
      acknowledgedRevision += 1;
    }
  };

  const canHydrate = () =>
    acknowledgedRevision === localRevision &&
    unreconciledPushError === null &&
    !pendingExplore &&
    remoteQueue.length === 0 &&
    !activePush;

  const remoteIsIdle = () => !pendingExplore && remoteQueue.length === 0 && !activePush;

  const remoteIsClean = () =>
    remoteIsIdle() && acknowledgedRevision === localRevision && unreconciledPushError === null;

  const settleDrainWaiters = () => {
    if (!remoteIsIdle()) return;
    for (const waiter of drainWaiters) {
      drainWaiters.delete(waiter);
      waiter.resolve(waiter.epoch === authorityEpoch && remoteIsClean());
    }
  };

  const queuePendingExplore = () => {
    if (!pendingExplore) return;
    remoteQueue.push(pendingExplore);
    pendingExplore = null;
  };

  const postRemote = async (
    targetAuthority: AuthorityClient,
    job: RemoteJob,
    controller: AbortController,
  ) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        targetAuthority.postCommand({ type: job.type, payload: job.payload }, "dungeon", {
          clientId,
          clientRevision: job.clientRevision,
          expectedRunId: job.expectedRunId,
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("push aborted")), {
            once: true,
          });
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error(`push timed out after ${pushTimeoutMs}ms`));
          }, pushTimeoutMs);
        }),
      ]);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`push timed out after ${pushTimeoutMs}ms`);
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  const flushRemote = () => {
    if (!authority || !remoteQueue.length || activePush) {
      settleDrainWaiters();
      return;
    }
    const job = remoteQueue.shift();
    if (!job) return;
    const targetAuthority = authority;
    const push: ActivePush = {
      epoch: authorityEpoch,
      controller: new AbortController(),
      job,
    };
    activePush = push;
    void (async () => {
      try {
        const res = await postRemote(targetAuthority, job, push.controller);
        if (activePush !== push || authorityEpoch !== push.epoch) return;
        if (res.ok) {
          acknowledgeRemote(job);
          if (job.reconcilesThrough !== undefined) unreconciledPushError = null;
        } else {
          unreconciledPushError = res.error?.message ?? "push failed";
        }
        status = {
          ...status,
          online: true,
          lastPushAt: Date.now(),
          lastError: unreconciledPushError,
        };
      } catch (err) {
        if (activePush !== push || authorityEpoch !== push.epoch) return;
        unreconciledPushError = err instanceof Error ? err.message : String(err);
        status = {
          ...status,
          online: false,
          lastError: unreconciledPushError,
        };
      } finally {
        if (activePush === push && authorityEpoch === push.epoch) {
          if (job.reconcilesThrough !== undefined) reconciliationPending = false;
          activePush = null;
          flushRemote();
          settleDrainWaiters();
        }
      }
    })();
  };

  const scheduleRemote = (type: string, payload: unknown, ordered: boolean, revision: number) => {
    if (!authority) return;
    const job: RemoteJob = {
      type,
      payload,
      revisions: [revision],
      clientRevision: ++remoteCommandRevision,
      ...(authorityRunId ? { expectedRunId: authorityRunId } : {}),
    };
    if (type === "dungeons/syncExplore" && !ordered) {
      pendingExplore = pendingExplore
        ? { ...job, revisions: [...pendingExplore.revisions, revision] }
        : job;
      if (pushTimer) return;
      pushTimer = setTimeout(() => {
        pushTimer = null;
        queuePendingExplore();
        flushRemote();
      }, 1200);
      return;
    }
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
    queuePendingExplore();
    remoteQueue.push(job);
    flushRemote();
  };

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
      localRevision += 1;
      const remote =
        applyOpts.remote ?? (REMOTE_IMMEDIATE.has(type) || type === "dungeons/raiseThreat");
      if (remote) {
        scheduleRemote(
          type,
          payload,
          orderedRemote || REMOTE_IMMEDIATE.has(type) || type === "dungeons/syncExplore",
          localRevision,
        );
      } else if (type === "dungeons/syncExplore") {
        // coalesce explore to at most one push / 1.2s
        scheduleRemote(type, payload, false, localRevision);
      }
    }
    return result;
  };

  return {
    getRun: () => run,
    getDungeon: dungeonState,
    getStatus: () => ({ ...status }),
    getAuthorityRunId: () => authorityRunId,
    bindAuthorityRun(runId: string) {
      const normalized = runId.trim();
      if (!normalized || runTransitionActive || !remoteIsClean()) return false;
      hydrateSequence += 1;
      authorityRunId = normalized;
      run = { ...run, id: normalized };
      return true;
    },
    setAuthority(next: AuthorityClient | null, runId?: string) {
      const normalizedRunId = runId?.trim();
      if (authority === next && (!normalizedRunId || normalizedRunId === authorityRunId)) return;
      authorityEpoch += 1;
      hydrateSequence += 1;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = null;
      pendingExplore = null;
      remoteQueue.length = 0;
      const previousPush = activePush;
      activePush = null;
      previousPush?.controller.abort();
      for (const waiter of drainWaiters) waiter.resolve(false);
      drainWaiters.clear();
      acknowledgedRevision = 0;
      acknowledgedOutOfOrder.clear();
      unreconciledPushError = null;
      reconciliationPending = false;
      authority = next;
      if (normalizedRunId) {
        authorityRunId = normalizedRunId;
        run = { ...run, id: normalizedRunId };
      }
      status = { ...status, online: false, lastError: null };
      if (authority) {
        remoteQueue.push({
          type: "dungeons/hydrate",
          payload: { ...dungeonState() },
          revisions: [],
          clientRevision: ++remoteCommandRevision,
          ...(authorityRunId ? { expectedRunId: authorityRunId } : {}),
          reconcilesThrough: localRevision,
        });
        reconciliationPending = true;
      }
      flushRemote();
    },
    /** Flushes coalesced explore and waits for every earlier remote mutation. */
    async drainRemoteWrites(): Promise<boolean> {
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = null;
      queuePendingExplore();
      flushRemote();
      if (remoteIsIdle()) return remoteIsClean();
      const epoch = authorityEpoch;
      return new Promise<boolean>((resolve) => {
        drainWaiters.add({ epoch, resolve });
      });
    },
    async beginRunTransition(): Promise<boolean> {
      if (runTransitionActive) return false;
      runTransitionActive = true;
      hydrateSequence += 1;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = null;
      queuePendingExplore();
      flushRemote();
      if (remoteIsIdle()) return remoteIsClean();
      const epoch = authorityEpoch;
      return new Promise<boolean>((resolve) => {
        drainWaiters.add({ epoch, resolve });
      });
    },
    completeRunTransition(runId: string): boolean {
      const normalized = runId.trim();
      if (!runTransitionActive || !normalized || !remoteIsClean()) return false;
      hydrateSequence += 1;
      authorityRunId = normalized;
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
      const needsReconciliation =
        unreconciledPushError !== null || acknowledgedRevision !== localRevision;
      if (!authority || !needsReconciliation || reconciliationPending) return false;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = null;
      queuePendingExplore();
      remoteQueue.push({
        type: "dungeons/hydrate",
        payload: { ...dungeonState() },
        revisions: [],
        clientRevision: ++remoteCommandRevision,
        ...(authorityRunId ? { expectedRunId: authorityRunId } : {}),
        reconcilesThrough: localRevision,
      });
      reconciliationPending = true;
      flushRemote();
      return true;
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
      localRevision += 1;
      scheduleRemote(
        "dungeons/hydrate",
        { ...(candidate.domains.dungeons as DungeonDomainState) },
        true,
        localRevision,
      );
      return result;
    },

    async hydrateFromAuthority(): Promise<{ seed: string; state: DungeonDomainState } | null> {
      if (runTransitionActive || !authority || !canHydrate()) return null;
      const targetAuthority = authority;
      const targetAuthorityEpoch = authorityEpoch;
      const expectedRunId = authorityRunId;
      const hydrateRevision = localRevision;
      const hydrateRequest = ++hydrateSequence;
      const hydrateContextIsCurrent = () =>
        !runTransitionActive &&
        targetAuthorityEpoch === authorityEpoch &&
        targetAuthority === authority &&
        hydrateRequest === hydrateSequence &&
        hydrateRevision === localRevision &&
        canHydrate();
      try {
        const reachable = await targetAuthority.isReachable();
        if (!hydrateContextIsCurrent()) return null;
        status = {
          ...status,
          online: reachable,
          lastError: unreconciledPushError ?? (reachable ? null : "backend unreachable"),
        };
        if (!reachable) return null;
        const remote = await targetAuthority.getDomain("dungeons");
        if (!hydrateContextIsCurrent()) return null;
        const state = remote.state as DungeonDomainState;
        if (!state || typeof state.seed !== "string" || !state.seed.trim()) {
          status = {
            ...status,
            lastError: unreconciledPushError ?? "remote dungeon state missing seed",
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
            lastError: unreconciledPushError ?? result.error.message,
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
          lastError: unreconciledPushError ?? (err instanceof Error ? err.message : String(err)),
        };
        return null;
      }
    },

    async probeAuthority(): Promise<boolean> {
      if (!authority) {
        status = { ...status, online: false };
        return false;
      }
      const now = Date.now();
      if (now - lastProbeAt < 4000 && status.online) return true;
      lastProbeAt = now;
      try {
        const ok = await authority.isReachable();
        status = {
          ...status,
          online: ok,
          lastError: unreconciledPushError ?? (ok ? null : "backend unreachable"),
        };
        return ok;
      } catch (err) {
        status = {
          ...status,
          online: false,
          lastError: unreconciledPushError ?? (err instanceof Error ? err.message : String(err)),
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
