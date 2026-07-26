import { describe, expect, jest, test } from "bun:test";
import type { AuthorityClient } from "../src/authority/client";
import { createDomainBridge, type DungeonDomainState } from "../src/domain/bridge";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function commandResult() {
  return {
    ok: true,
    events: [],
    pendingDecisions: [],
    projection: {},
    run: {
      id: "run-dungeon",
      seed: "REMOTE",
      worldTicks: 0,
      schemaVersion: 1,
      contentVersion: "test",
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function hydratedDungeonState(seed: string, engineMode: string): DungeonDomainState {
  return {
    ...createDomainBridge("REMOTE-TEMPLATE").getDungeon(),
    seed,
    floor: 4,
    room: "exit",
    mapped: 33,
    threat: 6,
    roomTarget: 18,
    loopRate: 27,
    decorDensity: 72,
    mapWidth: 75,
    mapHeight: 77,
    minRoomSize: 5,
    maxRoomSize: 11,
    corridorRadius: 2,
    roomPadding: 3,
    enemyDensity: 44,
    lightLevel: 55,
    profile: "remote-profile",
    exploredCells: 32,
    hasRelic: true,
    foundStoneIds: ["ember", "ash", "crypt", "verdant"],
    portalOpen: true,
    exitReached: false,
    engineMode,
    topologySignature: "remote-topology",
  };
}

describe("dungeon domain bridge integrity", () => {
  test("captures a build with one exact hydrate and strictly increasing remote metadata", async () => {
    const requests: Array<{
      command: { type: string; payload?: unknown };
      metadata: { clientId?: string; clientRevision?: number; signal?: AbortSignal } | undefined;
    }> = [];
    const hydrateResponse = deferred<ReturnType<typeof commandResult>>();
    const modeResponse = deferred<ReturnType<typeof commandResult>>();
    const responses = [hydrateResponse, modeResponse];
    const authority = {
      postCommand(
        command: { type: string; payload?: unknown },
        _surfaceId: string,
        metadata: { clientId?: string; clientRevision?: number; signal?: AbortSignal },
      ) {
        requests.push({ command, metadata });
        const response = responses.shift();
        if (!response) throw new Error("unexpected command");
        return response.promise;
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({
      initialSeed: "LOCAL",
      authority,
      clientId: "dungeon-test-client",
    });

    const result = bridge.captureBuild({
      seed: "REMOTE-BUILD",
      topologySignature: "topology-7",
      roomTarget: 14,
      loopRate: 20,
      decorDensity: 60,
    });
    const captured = { ...bridge.getDungeon() };

    expect(result.ok).toBe(true);
    expect(captured).toMatchObject({
      seed: "REMOTE-BUILD",
      topologySignature: "topology-7",
      roomTarget: 14,
      loopRate: 20,
      decorDensity: 60,
      room: "entrance",
      exploredCells: 1,
      mapped: 1,
      hasRelic: false,
      exitReached: false,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.command).toEqual({ type: "dungeons/hydrate", payload: captured });
    expect(requests[0]?.metadata).toMatchObject({
      clientId: "dungeon-test-client",
      clientRevision: 1,
    });
    expect(requests[0]?.metadata?.signal).toBeInstanceOf(AbortSignal);

    bridge.setEngineMode("play");
    expect(requests).toHaveLength(1);

    hydrateResponse.resolve(commandResult());
    await flushMicrotasks();
    expect(requests[1]?.command).toEqual({
      type: "dungeons/setEngineMode",
      payload: { mode: "play" },
    });
    expect(requests[1]?.metadata).toMatchObject({
      clientId: "dungeon-test-client",
      clientRevision: 2,
    });

    modeResponse.resolve(commandResult());
    await flushMicrotasks();
  });

  test("keeps the next command after an atomic capture push fails", async () => {
    const requests: Array<{ type: string; payload?: unknown }> = [];
    const captureResponse = deferred<ReturnType<typeof commandResult>>();
    const modeResponse = deferred<ReturnType<typeof commandResult>>();
    const responses = [captureResponse, modeResponse];
    const authority = {
      postCommand(command: { type: string; payload?: unknown }) {
        requests.push(command);
        const response = responses.shift();
        if (!response) throw new Error("unexpected command");
        return response.promise;
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "LOCAL", authority });

    bridge.captureBuild({
      seed: "RECOVERABLE",
      topologySignature: "topology-8",
      roomTarget: 15,
      loopRate: 21,
      decorDensity: 61,
    });
    bridge.setEngineMode("debug");
    captureResponse.reject(new Error("capture write failed"));
    await flushMicrotasks();

    expect(bridge.getStatus().lastError).toBe("capture write failed");
    expect(requests.map((request) => request.type)).toEqual([
      "dungeons/hydrate",
      "dungeons/setEngineMode",
    ]);

    modeResponse.resolve(commandResult());
    await flushMicrotasks();
    expect(bridge.getStatus().lastError).toBe("capture write failed");
  });

  test("keeps a push error visible until an explicit reconciliation succeeds", async () => {
    const requests: Array<{ type: string; payload?: unknown }> = [];
    const seedResponse = deferred<ReturnType<typeof commandResult>>();
    const paramsResponse = deferred<ReturnType<typeof commandResult>>();
    const reconcileResponse = deferred<ReturnType<typeof commandResult>>();
    const responses = [seedResponse, paramsResponse, reconcileResponse];
    let domainReads = 0;
    const authority = {
      isReachable: async () => true,
      postCommand(command: { type: string; payload?: unknown }) {
        requests.push(command);
        const response = responses.shift();
        if (!response) throw new Error("unexpected command");
        return response.promise;
      },
      getDomain: async () => {
        domainReads += 1;
        return { state: hydratedDungeonState("REMOTE-RECONCILED", "debug") };
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "LOCAL-START", authority });

    bridge.setSeed("LOCAL-FAILED");
    bridge.setParams({ roomTarget: 19 });
    seedResponse.reject(new Error("seed write failed"));
    await flushMicrotasks();
    paramsResponse.resolve(commandResult());
    await flushMicrotasks();

    expect(bridge.getStatus().lastError).toBe("seed write failed");
    expect(await bridge.hydrateFromAuthority()).toBeNull();
    expect(domainReads).toBe(0);

    expect(bridge.reconcileRemote()).toBe(true);
    expect(requests[2]).toMatchObject({
      type: "dungeons/hydrate",
      payload: { seed: "LOCAL-FAILED", roomTarget: 19 },
    });
    reconcileResponse.resolve(commandResult());
    await flushMicrotasks();

    expect(bridge.getStatus().lastError).toBeNull();
    expect(await bridge.hydrateFromAuthority()).toMatchObject({ seed: "REMOTE-RECONCILED" });
    expect(domainReads).toBe(1);
  });

  test("aborts a timed-out write and a later revision makes its late arrival harmless", async () => {
    jest.useFakeTimers();
    try {
      const requests: Array<{
        command: { type: string; payload?: unknown };
        metadata: {
          clientId?: string;
          clientRevision?: number;
          expectedRunId?: string;
          signal?: AbortSignal;
        };
      }> = [];
      const firstArrival = deferred<void>();
      let acceptedRevision = 0;
      let activeRunId = "run-a";
      let runMismatches = 0;
      let remoteState = hydratedDungeonState("REMOTE-START", "editor");
      const authority = {
        postCommand(
          command: { type: string; payload?: unknown },
          _surfaceId: string,
          metadata: {
            clientId?: string;
            clientRevision?: number;
            expectedRunId?: string;
            signal?: AbortSignal;
          },
        ) {
          requests.push({ command, metadata });
          const applyAtAuthority = () => {
            if (metadata.expectedRunId !== activeRunId) {
              runMismatches += 1;
              return {
                ...commandResult(),
                ok: false,
                error: { code: "run_mismatch", message: "wrong active run" },
              };
            }
            const revision = metadata.clientRevision ?? 0;
            if (revision <= acceptedRevision) {
              return {
                ...commandResult(),
                ok: false,
                error: { code: "stale_command_revision", message: "stale revision" },
              };
            }
            acceptedRevision = revision;
            if (command.type === "dungeons/setSeed") {
              const payload = command.payload as { seed?: unknown } | undefined;
              remoteState = { ...remoteState, seed: String(payload?.seed) };
            } else if (command.type === "dungeons/setParams") {
              remoteState = { ...remoteState, ...(command.payload as Partial<DungeonDomainState>) };
            } else if (command.type === "dungeons/hydrate") {
              remoteState = { ...(command.payload as DungeonDomainState) };
            }
            return commandResult();
          };
          return requests.length === 1
            ? firstArrival.promise.then(applyAtAuthority)
            : Promise.resolve(applyAtAuthority());
        },
      } as unknown as AuthorityClient;
      const bridge = createDomainBridge({
        initialSeed: "LOCAL-START",
        authority,
        authorityRunId: "run-a",
        clientId: "late-write-client",
        pushTimeoutMs: 25,
      });

      bridge.setSeed("LATE-OLD");
      bridge.setParams({ roomTarget: 20 });
      expect(requests.map(({ command }) => command.type)).toEqual(["dungeons/setSeed"]);

      jest.advanceTimersByTime(25);
      await flushMicrotasks();
      await flushMicrotasks();

      expect(bridge.getStatus().lastError).toBe("push timed out after 25ms");
      expect(requests.map(({ command }) => command.type)).toEqual([
        "dungeons/setSeed",
        "dungeons/setParams",
      ]);
      expect(requests[0]?.metadata.signal?.aborted).toBe(true);
      expect(remoteState).toMatchObject({ seed: "REMOTE-START", roomTarget: 20 });

      expect(bridge.reconcileRemote()).toBe(true);
      await flushMicrotasks();
      await flushMicrotasks();
      expect(requests.map(({ command }) => command.type)).toEqual([
        "dungeons/setSeed",
        "dungeons/setParams",
        "dungeons/hydrate",
      ]);
      expect(requests.map(({ metadata }) => metadata.clientRevision)).toEqual([1, 2, 3]);
      expect(remoteState).toEqual(bridge.getDungeon());
      expect(bridge.getStatus().lastError).toBeNull();

      expect(await bridge.drainRemoteWrites()).toBe(true);
      activeRunId = "run-b";
      expect(bridge.bindAuthorityRun("run-b")).toBe(true);
      remoteState = hydratedDungeonState("RUN-B-UNCHANGED", "play");
      const nextRunState = { ...remoteState };
      firstArrival.resolve();
      await flushMicrotasks();
      expect(remoteState).toEqual(nextRunState);
      expect(acceptedRevision).toBe(3);
      expect(runMismatches).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("coalesces explore without dropping a later ordered command", async () => {
    const requests: Array<{ type: string; payload?: unknown }> = [];
    const exploreResponse = deferred<ReturnType<typeof commandResult>>();
    const seedResponse = deferred<ReturnType<typeof commandResult>>();
    const responses = [exploreResponse, seedResponse];
    const authority = {
      postCommand(command: { type: string; payload?: unknown }) {
        requests.push(command);
        const response = responses.shift();
        if (!response) throw new Error("unexpected command");
        return response.promise;
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "LOCAL", authority });

    bridge.syncExplore({ room: "room-1", exploredCells: 1 });
    bridge.syncExplore({ room: "room-2", exploredCells: 2 });
    expect(requests).toEqual([]);

    bridge.setSeed("ORDERED");
    expect(requests).toEqual([
      {
        type: "dungeons/syncExplore",
        payload: { room: "room-2", exploredCells: 2 },
      },
    ]);

    exploreResponse.resolve(commandResult());
    await flushMicrotasks();
    expect(requests).toEqual([
      {
        type: "dungeons/syncExplore",
        payload: { room: "room-2", exploredCells: 2 },
      },
      { type: "dungeons/setSeed", payload: { seed: "ORDERED" } },
    ]);

    seedResponse.resolve(commandResult());
    await flushMicrotasks();
  });

  test("one coalesced explore acknowledgement covers every merged local revision", async () => {
    jest.useFakeTimers();
    try {
      const requests: Array<{
        command: { type: string; payload?: unknown };
        clientRevision?: number;
      }> = [];
      const remoteState = hydratedDungeonState("REMOTE-AFTER-EXPLORE", "play");
      let domainReads = 0;
      const authority = {
        isReachable: async () => true,
        postCommand(
          command: { type: string; payload?: unknown },
          _surfaceId: string,
          metadata: { clientRevision?: number },
        ) {
          requests.push({ command, clientRevision: metadata.clientRevision });
          return Promise.resolve(commandResult());
        },
        getDomain: async () => {
          domainReads += 1;
          return { state: remoteState };
        },
      } as unknown as AuthorityClient;
      const bridge = createDomainBridge({ initialSeed: "LOCAL", authority });

      bridge.syncExplore({ room: "room-1", exploredCells: 1 });
      bridge.syncExplore({ room: "room-2", exploredCells: 2 });
      expect(await bridge.hydrateFromAuthority()).toBeNull();

      jest.advanceTimersByTime(1200);
      await flushMicrotasks();
      await flushMicrotasks();

      expect(requests).toEqual([
        {
          command: {
            type: "dungeons/syncExplore",
            payload: { room: "room-2", exploredCells: 2 },
          },
          clientRevision: 2,
        },
      ]);
      expect(await bridge.hydrateFromAuthority()).toMatchObject({
        seed: "REMOTE-AFTER-EXPLORE",
      });
      expect(domainReads).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("drains retained explore before both create and activate run transitions", async () => {
    for (const flow of ["create", "activate"] as const) {
      const response = deferred<ReturnType<typeof commandResult>>();
      const requests: Array<{
        command: { type: string; payload?: unknown };
        expectedRunId?: string;
      }> = [];
      let activeRunId = "run-old";
      let oldRunExploreWrites = 0;
      const authority = {
        postCommand(
          command: { type: string; payload?: unknown },
          _surfaceId: string,
          metadata: { expectedRunId?: string },
        ) {
          requests.push({ command, expectedRunId: metadata.expectedRunId });
          return response.promise.then(() => {
            if (metadata.expectedRunId === activeRunId) oldRunExploreWrites += 1;
            return commandResult();
          });
        },
      } as unknown as AuthorityClient;
      const bridge = createDomainBridge({
        initialSeed: `LOCAL-${flow}`,
        authority,
        authorityRunId: "run-old",
      });

      bridge.syncExplore({ room: `${flow}-room`, exploredCells: 2 });
      const transition = (async () => {
        const drained = await bridge.drainRemoteWrites();
        expect(drained).toBe(true);
        activeRunId = flow === "create" ? "run-created" : "run-activated";
        expect(bridge.bindAuthorityRun(activeRunId)).toBe(true);
      })();
      await flushMicrotasks();

      expect(activeRunId).toBe("run-old");
      expect(requests).toEqual([
        {
          command: {
            type: "dungeons/syncExplore",
            payload: { room: `${flow}-room`, exploredCells: 2 },
          },
          expectedRunId: "run-old",
        },
      ]);

      response.resolve(commandResult());
      await transition;
      expect(oldRunExploreWrites).toBe(1);
      expect(activeRunId).toBe(flow === "create" ? "run-created" : "run-activated");
      expect(bridge.getRun().id).toBe(activeRunId);
    }
  });

  test("run transition lock rejects every domain mutation until completion", async () => {
    const drainResponse = deferred<ReturnType<typeof commandResult>>();
    const requests: Array<{
      command: { type: string; payload?: unknown };
      expectedRunId?: string;
    }> = [];
    let domainReads = 0;
    const authority = {
      postCommand(
        command: { type: string; payload?: unknown },
        _surfaceId: string,
        metadata: { expectedRunId?: string },
      ) {
        requests.push({ command, expectedRunId: metadata.expectedRunId });
        return requests.length === 1 ? drainResponse.promise : Promise.resolve(commandResult());
      },
      isReachable: async () => true,
      getDomain: async () => {
        domainReads += 1;
        return {
          state: hydratedDungeonState("SHOULD-NOT-HYDRATE", "debug"),
          run: { id: "run-old" },
        };
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({
      initialSeed: "LOCKED",
      authority,
      authorityRunId: "run-old",
    });

    bridge.syncExplore({ room: "queued-room", exploredCells: 3 });
    const transition = bridge.beginRunTransition();
    await flushMicrotasks();
    const lockedRun = bridge.getRun();

    const mode = bridge.setEngineMode("play");
    const params = bridge.setParams({ roomTarget: 19 });
    const explore = bridge.syncExplore({ room: "blocked-room", exploredCells: 99 });
    const descend = bridge.descend("BLOCKED-DESCEND");
    const capture = bridge.captureBuild({
      seed: "BLOCKED-BUILD",
      topologySignature: "blocked-topology",
      roomTarget: 18,
      loopRate: 20,
      decorDensity: 60,
    });
    expect(mode).toMatchObject({ ok: false, error: { code: "invalid_payload" } });
    expect(params).toMatchObject({ ok: false, error: { code: "invalid_payload" } });
    expect(explore).toMatchObject({ ok: false, error: { code: "invalid_payload" } });
    expect(descend).toMatchObject({ ok: false, error: { code: "invalid_payload" } });
    expect(capture).toMatchObject({ ok: false, error: { code: "invalid_payload" } });
    expect(bridge.reconcileRemote()).toBe(false);
    expect(await bridge.hydrateFromAuthority()).toBeNull();
    expect(domainReads).toBe(0);
    expect(bridge.getRun()).toBe(lockedRun);
    expect(requests).toHaveLength(1);

    drainResponse.resolve(commandResult());
    expect(await transition).toBe(true);
    expect(bridge.setSeed("STILL-LOCKED").ok).toBe(false);
    expect(bridge.completeRunTransition("run-new")).toBe(true);
    expect(bridge.getRun().id).toBe("run-new");

    const progressed = bridge.setEngineMode("play");
    expect(progressed.ok).toBe(true);
    await flushMicrotasks();
    expect(requests[1]).toMatchObject({
      command: { type: "dungeons/setEngineMode", payload: { mode: "play" } },
      expectedRunId: "run-new",
    });
  });

  test("cancelled run transition restores commands on the prior run", async () => {
    const requests: Array<{
      command: { type: string; payload?: unknown };
      expectedRunId?: string;
    }> = [];
    const authority = {
      postCommand(
        command: { type: string; payload?: unknown },
        _surfaceId: string,
        metadata: { expectedRunId?: string },
      ) {
        requests.push({ command, expectedRunId: metadata.expectedRunId });
        if (requests.length === 1) {
          return Promise.resolve({
            ...commandResult(),
            ok: false,
            error: { code: "write_failed", message: "authority rejected explore" },
          });
        }
        return Promise.resolve(commandResult());
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({
      initialSeed: "CANCEL-OLD",
      authority,
      authorityRunId: "run-old",
    });

    bridge.syncExplore({ room: "failed-room", exploredCells: 2 });
    expect(await bridge.beginRunTransition()).toBe(false);
    const beforeBlocked = bridge.getRun();
    expect(bridge.setSeed("BLOCKED-WHILE-FAILED").ok).toBe(false);
    expect(bridge.getRun()).toBe(beforeBlocked);

    expect(bridge.cancelRunTransition()).toBe(true);
    expect(bridge.setSeed("OLD-RUN-CONTINUES").ok).toBe(true);
    await flushMicrotasks();
    expect(requests[1]).toMatchObject({
      command: { type: "dungeons/setSeed", payload: { seed: "OLD-RUN-CONTINUES" } },
      expectedRunId: "run-old",
    });
  });

  test("authority epoch isolates a late callback and hydrates the replacement authority", async () => {
    const authorityAResponse = deferred<ReturnType<typeof commandResult>>();
    const authorityBResponse = deferred<ReturnType<typeof commandResult>>();
    let authorityASignal: AbortSignal | undefined;
    const authorityA = {
      postCommand(
        _command: { type: string; payload?: unknown },
        _surfaceId: string,
        metadata: { signal?: AbortSignal },
      ) {
        authorityASignal = metadata.signal;
        return authorityAResponse.promise;
      },
    } as unknown as AuthorityClient;
    const authorityBRequests: Array<{
      command: { type: string; payload?: unknown };
      expectedRunId?: string;
      clientRevision?: number;
    }> = [];
    const remoteState = hydratedDungeonState("AUTHORITY-B", "debug");
    const authorityB = {
      postCommand(
        command: { type: string; payload?: unknown },
        _surfaceId: string,
        metadata: { expectedRunId?: string; clientRevision?: number },
      ) {
        authorityBRequests.push({
          command,
          expectedRunId: metadata.expectedRunId,
          clientRevision: metadata.clientRevision,
        });
        return authorityBResponse.promise;
      },
      isReachable: async () => true,
      getDomain: async () => ({
        state: remoteState,
        run: { id: "run-b" },
      }),
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({
      initialSeed: "AUTHORITY-A",
      authority: authorityA,
      authorityRunId: "run-shared",
      clientId: "authority-epoch-client",
    });

    bridge.setSeed("LOCAL-LATEST");
    bridge.setAuthority(authorityB, "run-b");
    await flushMicrotasks();

    expect(authorityASignal?.aborted).toBe(true);
    expect(authorityBRequests).toHaveLength(1);
    expect(authorityBRequests[0]).toMatchObject({
      command: {
        type: "dungeons/hydrate",
        payload: { seed: "LOCAL-LATEST" },
      },
      expectedRunId: "run-b",
      clientRevision: 2,
    });
    expect(await bridge.hydrateFromAuthority()).toBeNull();

    authorityBResponse.resolve(commandResult());
    await flushMicrotasks();
    await flushMicrotasks();
    expect(await bridge.hydrateFromAuthority()).toMatchObject({ seed: "AUTHORITY-B" });
    expect(bridge.getRun().id).toBe("run-b");

    authorityAResponse.resolve(commandResult());
    await flushMicrotasks();
    expect(bridge.getDungeon().seed).toBe("AUTHORITY-B");
    expect(bridge.getStatus().lastError).toBeNull();
  });

  test("a stale hydrate rejection cannot overwrite replacement authority status", async () => {
    const authorityARead = deferred<{
      state: DungeonDomainState;
      run: { id: string };
    }>();
    const authorityA = {
      isReachable: async () => true,
      getDomain: () => authorityARead.promise,
    } as unknown as AuthorityClient;
    const stateB = hydratedDungeonState("AUTHORITY-B-CURRENT", "play");
    const authorityB = {
      postCommand: async () => commandResult(),
      isReachable: async () => true,
      getDomain: async () => ({ state: stateB, run: { id: "run-b" } }),
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({
      initialSeed: "AUTHORITY-A-LOCAL",
      authority: authorityA,
      authorityRunId: "run-a",
    });

    const hydrateA = bridge.hydrateFromAuthority();
    await flushMicrotasks();
    bridge.setAuthority(authorityB, "run-b");
    await flushMicrotasks();
    await flushMicrotasks();
    expect(await bridge.hydrateFromAuthority()).toMatchObject({ seed: "AUTHORITY-B-CURRENT" });
    const statusB = { ...bridge.getStatus() };
    const dungeonB = { ...bridge.getDungeon() };

    authorityARead.reject(new Error("late authority A failure"));
    expect(await hydrateA).toBeNull();
    expect(bridge.getStatus()).toEqual(statusB);
    expect(bridge.getDungeon()).toEqual(dungeonB);
  });

  test("hydrates only after every prior local write has a remote acknowledgement", async () => {
    const pushResponse = deferred<ReturnType<typeof commandResult>>();
    const remoteState = hydratedDungeonState("REMOTE-AFTER-ACK", "debug");
    let domainReads = 0;
    const authority = {
      isReachable: async () => true,
      postCommand: () => pushResponse.promise,
      getDomain: async () => {
        domainReads += 1;
        return { state: remoteState };
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "LOCAL-START", authority });

    bridge.setSeed("LOCAL-PENDING");

    expect(await bridge.hydrateFromAuthority()).toBeNull();
    expect(domainReads).toBe(0);
    expect(bridge.getDungeon().seed).toBe("LOCAL-PENDING");

    pushResponse.resolve(commandResult());
    await flushMicrotasks();

    expect(await bridge.hydrateFromAuthority()).toMatchObject({
      seed: "REMOTE-AFTER-ACK",
      state: remoteState,
    });
    expect(domainReads).toBe(1);
  });

  test("does not let an older hydrate replace later local seed and mode", async () => {
    const response = deferred<{ state: DungeonDomainState }>();
    const authority = {
      isReachable: async () => true,
      getDomain: () => response.promise,
      postCommand: async () => commandResult(),
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "LOCAL-START", authority });

    const hydrate = bridge.hydrateFromAuthority();
    await flushMicrotasks();
    bridge.setSeed("LOCAL-NEW");
    bridge.setEngineMode("play");
    response.resolve({ state: hydratedDungeonState("REMOTE-OLD", "editor") });

    expect(await hydrate).toBeNull();
    expect(bridge.getDungeon()).toMatchObject({ seed: "LOCAL-NEW", engineMode: "play" });
    expect((bridge.getRun().domains.dungeons as DungeonDomainState).seed).toBe("LOCAL-NEW");
    expect(bridge.project().domain?.metrics).toMatchObject({
      seed: "LOCAL-NEW",
      engineMode: "play",
    });
    expect(bridge.getStatus().lastHydrateAt).toBeNull();
  });

  test("binding a run invalidates a hydrate started in the prior run context", async () => {
    const response = deferred<{ state: DungeonDomainState; run: { id: string } }>();
    const authority = {
      isReachable: async () => true,
      getDomain: () => response.promise,
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "LOCAL-START", authority });

    const hydrate = bridge.hydrateFromAuthority();
    await flushMicrotasks();
    expect(bridge.bindAuthorityRun("run-new-context")).toBe(true);
    response.resolve({
      state: hydratedDungeonState("REMOTE-OLD-CONTEXT", "editor"),
      run: { id: "run-old-context" },
    });

    expect(await hydrate).toBeNull();
    expect(bridge.getRun().id).toBe("run-new-context");
    expect(bridge.getDungeon().seed).toBe("LOCAL-START");
  });

  test("only applies the newest of two concurrent hydrates resolved in reverse", async () => {
    const olderResponse = deferred<{ state: DungeonDomainState }>();
    const newerResponse = deferred<{ state: DungeonDomainState }>();
    const responses = [olderResponse, newerResponse];
    const authority = {
      isReachable: async () => true,
      getDomain: () => {
        const response = responses.shift();
        if (!response) throw new Error("unexpected hydrate");
        return response.promise;
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "LOCAL-START", authority });

    const olderHydrate = bridge.hydrateFromAuthority();
    await flushMicrotasks();
    const newerHydrate = bridge.hydrateFromAuthority();
    await flushMicrotasks();

    newerResponse.resolve({ state: hydratedDungeonState("REMOTE-NEW", "play") });
    expect(await newerHydrate).toMatchObject({ seed: "REMOTE-NEW" });

    olderResponse.resolve({ state: hydratedDungeonState("REMOTE-OLD", "editor") });
    expect(await olderHydrate).toBeNull();
    expect(bridge.getDungeon()).toMatchObject({ seed: "REMOTE-NEW", engineMode: "play" });
  });

  test("applies a complete hydrate when no local write follows it", async () => {
    const remoteState = hydratedDungeonState("REMOTE-CURRENT", "debug");
    const response = deferred<{ state: DungeonDomainState }>();
    const authority = {
      isReachable: async () => true,
      getDomain: () => response.promise,
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "LOCAL-START", authority });

    const hydrate = bridge.hydrateFromAuthority();
    await flushMicrotasks();
    response.resolve({ state: remoteState });

    expect(await hydrate).toMatchObject({ seed: "REMOTE-CURRENT", state: remoteState });
    expect(bridge.getDungeon()).toMatchObject(remoteState);
    expect(bridge.getRun().domains.dungeons as DungeonDomainState).toMatchObject(remoteState);
    expect(bridge.project().domain?.metrics).toMatchObject({
      seed: "REMOTE-CURRENT",
      engineMode: "debug",
      roomTarget: 18,
    });
    expect(bridge.getStatus().lastHydrateAt).not.toBeNull();
  });
});
