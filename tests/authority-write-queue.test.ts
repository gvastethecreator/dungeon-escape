import { describe, expect, test } from "bun:test";

import type { AuthorityClient } from "../src/authority/client";
import { AuthorityWriteQueue } from "../src/domain/AuthorityWriteQueue";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("AuthorityWriteQueue", () => {
  test("coalesces exploration revisions before later ordered work", async () => {
    const requests: Array<{ type: string; payload?: unknown }> = [];
    const explore = deferred<ReturnType<typeof commandResult>>();
    const seed = deferred<ReturnType<typeof commandResult>>();
    const responses = [explore, seed];
    const authority = {
      postCommand(command: { type: string; payload?: unknown }) {
        requests.push(command);
        const response = responses.shift();
        if (!response) throw new Error("unexpected command");
        return response.promise;
      },
    } as unknown as AuthorityClient;
    const queue = new AuthorityWriteQueue({
      authority,
      clientId: "queue-test",
      exploreDebounceMs: 10_000,
    });

    queue.recordMutation({
      type: "dungeons/syncExplore",
      payload: { room: "room-1" },
      ordered: false,
    });
    queue.recordMutation({
      type: "dungeons/syncExplore",
      payload: { room: "room-2" },
      ordered: false,
    });
    expect(requests).toEqual([]);

    queue.recordMutation({
      type: "dungeons/setSeed",
      payload: { seed: "ORDERED" },
      ordered: true,
    });
    expect(requests).toEqual([{ type: "dungeons/syncExplore", payload: { room: "room-2" } }]);

    explore.resolve(commandResult());
    await flushMicrotasks();
    expect(requests[1]).toEqual({ type: "dungeons/setSeed", payload: { seed: "ORDERED" } });

    seed.resolve(commandResult());
    expect(await queue.drain()).toBe(true);
    expect(queue.isClean()).toBe(true);
  });

  test("isolates a replaced authority from late callbacks", async () => {
    const authorityAResponse = deferred<ReturnType<typeof commandResult>>();
    const authorityBResponse = deferred<ReturnType<typeof commandResult>>();
    let authorityASignal: AbortSignal | undefined;
    const authorityA = {
      postCommand(
        _command: { type: string; payload?: unknown },
        _surface: string,
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
    const authorityB = {
      postCommand(
        command: { type: string; payload?: unknown },
        _surface: string,
        metadata: { expectedRunId?: string; clientRevision?: number },
      ) {
        authorityBRequests.push({
          command,
          expectedRunId: metadata.expectedRunId,
          clientRevision: metadata.clientRevision,
        });
        return authorityBResponse.promise;
      },
    } as unknown as AuthorityClient;
    const statuses: unknown[] = [];
    const queue = new AuthorityWriteQueue({
      authority: authorityA,
      expectedRunId: "run-a",
      clientId: "replacement-test",
      onStatus: (status) => statuses.push(status),
    });

    queue.recordMutation({
      type: "dungeons/setSeed",
      payload: { seed: "LOCAL" },
      ordered: true,
    });
    expect(queue.replaceAuthority(authorityB, "run-b", { seed: "LOCAL" })).toBe(true);
    expect(authorityASignal?.aborted).toBe(true);
    expect(authorityBRequests).toEqual([
      {
        command: { type: "dungeons/hydrate", payload: { seed: "LOCAL" } },
        expectedRunId: "run-b",
        clientRevision: 2,
      },
    ]);

    authorityBResponse.resolve(commandResult());
    expect(await queue.drain()).toBe(true);
    const statusAfterB = [...statuses];

    authorityAResponse.resolve(commandResult());
    await flushMicrotasks();
    expect(statuses).toEqual(statusAfterB);
    expect(queue.isClean()).toBe(true);
  });

  test("keeps a failed revision dirty until reconciliation succeeds", async () => {
    let requestCount = 0;
    const authority = {
      async postCommand() {
        requestCount += 1;
        if (requestCount === 1) {
          return {
            ...commandResult(),
            ok: false,
            error: { code: "write_failed", message: "write failed" },
          };
        }
        return commandResult();
      },
    } as unknown as AuthorityClient;
    const queue = new AuthorityWriteQueue({ authority, clientId: "reconcile-test" });

    queue.recordMutation({
      type: "dungeons/setSeed",
      payload: { seed: "FAILED" },
      ordered: true,
    });
    await flushMicrotasks();
    expect(queue.isClean()).toBe(false);
    expect(queue.getUnreconciledError()).toBe("write failed");

    expect(queue.reconcile({ seed: "FAILED" })).toBe(true);
    expect(await queue.drain()).toBe(true);
    expect(queue.getUnreconciledError()).toBeNull();
  });
});
