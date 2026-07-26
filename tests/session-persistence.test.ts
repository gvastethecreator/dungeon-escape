import { describe, expect, test } from "bun:test";
import type { AuthorityClient } from "../src/authority/client";
import { createDomainBridge, type DungeonDomainState } from "../src/domain/bridge";

describe("dungeon session persistence", () => {
  test("pushes one atomic session command and hydrates it into a fresh bridge", async () => {
    const commands: Array<{ type: string; payload?: unknown }> = [];
    const session = {
      resolve: 43,
      foundStoneIds: ["ember", "ash"] as const,
      portalOpen: false,
      runMode: "playing" as const,
      exitReached: false,
    };
    const writerAuthority = {
      postCommand: async (command: { type: string; payload?: unknown }) => {
        commands.push(command);
        return {
          ok: true,
          events: [],
          pendingDecisions: [],
          projection: {},
          run: { id: "run-dungeon", seed: "SESSION" },
        };
      },
    } as unknown as AuthorityClient;
    const writer = createDomainBridge({ initialSeed: "SESSION", authority: writerAuthority });

    const synced = writer.syncSession({ ...session, foundStoneIds: [...session.foundStoneIds] });
    expect(synced.ok).toBe(true);
    expect(writer.getDungeon()).toMatchObject(session);
    expect(await writer.drainRemoteWrites()).toBe(true);
    expect(commands).toEqual([{ type: "dungeons/syncSession", payload: session }]);

    const persisted = writer.getDungeon();
    const readerAuthority = {
      isReachable: async () => true,
      getDomain: async () => ({ run: { id: "run-session" }, state: persisted }),
    } as unknown as AuthorityClient;
    const reader = createDomainBridge({
      initialSeed: "FRESH",
      authority: readerAuthority,
      authorityRunId: "run-session",
    });
    const hydrated = await reader.hydrateFromAuthority();

    expect(hydrated?.state).toMatchObject(session);
    expect(reader.getDungeon()).toEqual(persisted as DungeonDomainState);
  });

  test("rejects an impossible session without mutation or remote push", async () => {
    let pushes = 0;
    const authority = {
      postCommand: async () => {
        pushes += 1;
        return {
          ok: true,
          events: [],
          pendingDecisions: [],
          projection: {},
          run: { id: "run-dungeon", seed: "INVALID" },
        };
      },
    } as unknown as AuthorityClient;
    const bridge = createDomainBridge({ initialSeed: "INVALID", authority });
    const before = bridge.getRun();

    const result = bridge.syncSession({
      resolve: 20,
      foundStoneIds: ["ember", "ash", "crypt", "verdant"],
      portalOpen: true,
      runMode: "dead",
      exitReached: true,
    });

    expect(result.ok).toBe(false);
    expect(bridge.getRun()).toBe(before);
    expect(await bridge.drainRemoteWrites()).toBe(true);
    expect(pushes).toBe(0);
  });
});
