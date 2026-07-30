import { describe, expect, test } from "bun:test";

import {
  ForgeFrameClient,
  type ForgeFrameClock,
  type ForgeFrameMessageEvent,
  type ForgeFramePort,
} from "../src/forge/ForgeFrameClient";
import type { ForgeHostMessage } from "../src/forge/ForgeFrameProtocol";

class FakeClock implements ForgeFrameClock {
  readonly pending = new Map<number, { callback: () => void; delayMs: number }>();
  #nextId = 1;

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.#nextId;
    this.#nextId += 1;
    this.pending.set(id, { callback, delayMs });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  runNext(): void {
    const next = this.pending.entries().next().value as
      | [number, { callback: () => void; delayMs: number }]
      | undefined;
    if (!next) return;
    this.pending.delete(next[0]);
    next[1].callback();
  }

  runAll(): void {
    while (this.pending.size > 0) this.runNext();
  }
}

class FakeForgeFramePort implements ForgeFramePort {
  readonly baseSource = "/forge.html";
  readonly hostOrigin = "https://dungeon.test";
  readonly mounts: string[] = [];
  readonly messages: ForgeHostMessage[] = [];
  readonly loadListeners = new Set<() => void>();
  readonly messageListeners = new Set<(event: ForgeFrameMessageEvent) => void>();
  source: object | null = { frame: 1 };
  postResult = true;
  onMount: (() => void) | null = null;
  onPost: ((message: ForgeHostMessage) => void) | null = null;

  mount(source: string): void {
    this.mounts.push(source);
    this.onMount?.();
  }

  currentSource(): unknown {
    return this.source;
  }

  post(message: ForgeHostMessage): boolean {
    this.messages.push(message);
    this.onPost?.(message);
    return this.postResult;
  }

  onLoad(listener: () => void): () => void {
    this.loadListeners.add(listener);
    return () => this.loadListeners.delete(listener);
  }

  onMessage(listener: (event: ForgeFrameMessageEvent) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  emitLoad(): void {
    for (const listener of this.loadListeners) listener();
  }

  emitMessage(data: unknown, options: { origin?: string; source?: unknown } = {}): void {
    const event = {
      data,
      origin: options.origin ?? this.hostOrigin,
      source: options.source ?? this.source,
    };
    for (const listener of this.messageListeners) listener(event);
  }
}

async function makeLoadedClient(): Promise<{
  client: ForgeFrameClient;
  clock: FakeClock;
  port: FakeForgeFramePort;
}> {
  const clock = new FakeClock();
  const port = new FakeForgeFramePort();
  const client = new ForgeFrameClient(port, clock);
  const loaded = client.ensureLoaded();
  port.emitLoad();
  expect(await loaded).toBe("loaded");
  port.messages.length = 0;
  return { client, clock, port };
}

describe("Forge frame client", () => {
  test("cold-loads presentation once and flushes current visibility then latest seed", async () => {
    const clock = new FakeClock();
    const port = new FakeForgeFramePort();
    const client = new ForgeFrameClient(port, clock);
    let loadNotifications = 0;
    client.onLoaded(() => {
      loadNotifications += 1;
    });

    client.setVisible(true);
    client.setProceduralSeed(17);
    client.setProceduralSeed(29);
    const loaded = client.ensureLoaded({ presentation: true, timeoutMs: 500 });
    const concurrent = client.ensureLoaded({ presentation: false, timeoutMs: 900 });

    expect(port.mounts).toEqual(["/forge.html?presentation=1"]);
    expect(clock.pending.size).toBe(2);
    port.emitLoad();

    expect(await loaded).toBe("loaded");
    expect(await concurrent).toBe("loaded");
    expect(clock.pending.size).toBe(0);
    expect(loadNotifications).toBe(1);
    expect(port.messages).toEqual([
      { type: "black-flag:forge-visibility", visible: true },
      { type: "black-flag:forge-new-seed", seed: 29 },
    ]);

    client.setVisible(false);
    client.setProceduralSeed(31);
    expect(port.messages.slice(-2)).toEqual([
      { type: "black-flag:forge-visibility", visible: false },
      { type: "black-flag:forge-new-seed", seed: 31 },
    ]);
  });

  test("registers a load waiter before a synchronous mount load", async () => {
    const clock = new FakeClock();
    const port = new FakeForgeFramePort();
    const client = new ForgeFrameClient(port, clock);
    port.onMount = () => port.emitLoad();

    expect(await client.ensureLoaded({ timeoutMs: 50 })).toBe("loaded");
    expect(clock.pending.size).toBe(0);
  });

  test("load timeout remounts on retry and disposal settles every waiter", async () => {
    const clock = new FakeClock();
    const port = new FakeForgeFramePort();
    const client = new ForgeFrameClient(port, clock);

    const timedOut = client.ensureLoaded({ timeoutMs: 40 });
    clock.runNext();
    expect(await timedOut).toBe("timeout");
    expect(clock.pending.size).toBe(0);

    const retried = client.ensureLoaded({ timeoutMs: 80 });
    expect(port.mounts).toHaveLength(2);
    port.emitLoad();
    expect(await retried).toBe("loaded");

    const pendingPort = new FakeForgeFramePort();
    const pendingClient = new ForgeFrameClient(pendingPort, clock);
    const first = pendingClient.ensureLoaded({ timeoutMs: 100 });
    const second = pendingClient.ensureLoaded({ timeoutMs: 200 });
    pendingClient.dispose();
    pendingClient.dispose();

    expect(await first).toBe("disposed");
    expect(await second).toBe("disposed");
    expect(clock.pending.size).toBe(0);
    expect(pendingPort.loadListeners.size).toBe(0);
    expect(pendingPort.messageListeners.size).toBe(0);
    pendingClient.setVisible(true);
    pendingClient.setProceduralSeed(99);
    expect(pendingPort.messages).toEqual([]);
  });

  test("aborts load and active presentation waits without a late protocol post", async () => {
    const clock = new FakeClock();
    const port = new FakeForgeFramePort();
    const client = new ForgeFrameClient(port, clock);
    const loadAbort = new AbortController();
    const pendingStart = client.startPresentation({
      presentation: { animate: true },
      completionTimeoutMs: 500,
      signal: loadAbort.signal,
    });
    loadAbort.abort();
    expect(await pendingStart).toEqual({ ok: false, reason: "aborted" });
    expect(clock.pending.size).toBe(0);
    port.emitLoad();
    expect(port.messages).toEqual([{ type: "black-flag:forge-visibility", visible: false }]);

    port.messages.length = 0;
    const presentationAbort = new AbortController();
    const started = await client.startPresentation({
      presentation: { animate: true, seed: 19 },
      completionTimeoutMs: 500,
      signal: presentationAbort.signal,
    });
    if (!started.ok) throw new Error("presentation did not start");
    presentationAbort.abort();
    expect(await started.session.completion).toBe("cancelled");
    expect(clock.pending.size).toBe(0);
    expect(port.messages.slice(-2)).toEqual([
      {
        type: "black-flag:forge-presentation",
        version: 1,
        presentationId: 1,
        enabled: false,
        animate: false,
        seed: undefined,
        themeKey: undefined,
        dungeon: undefined,
      },
      { type: "black-flag:forge-visibility", visible: false },
    ]);
  });

  test("rejects hostile origin and stale source before intake or animation completion", async () => {
    const { client, clock, port } = await makeLoadedClient();
    const trusted: unknown[] = [];
    client.onTrustedMessage((data) => trusted.push(data));
    const started = await client.startPresentation({
      presentation: { animate: true, seed: 7, themeKey: "grim" },
      completionTimeoutMs: 1_000,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("presentation did not start");

    const hostileDungeon = { type: "black-flag:forge-dungeon", version: 1, dungeon: {} };
    port.emitMessage(hostileDungeon, { origin: "https://hostile.test" });
    port.emitMessage(hostileDungeon, { source: { stale: true } });
    port.emitMessage(
      { type: "black-flag:forge-anim-complete", version: 1, presentationId: 1 },
      { origin: "https://hostile.test" },
    );
    port.emitMessage(
      { type: "black-flag:forge-anim-complete", version: 1, presentationId: 1 },
      { source: { stale: true } },
    );
    expect(trusted).toEqual([]);
    expect(clock.pending.size).toBe(1);

    port.emitMessage(hostileDungeon);
    expect(trusted).toEqual([hostileDungeon]);
    port.emitMessage({ type: "black-flag:forge-anim-complete", version: 1, presentationId: 1 });
    expect(await started.session.completion).toBe("completed");
    expect(clock.pending.size).toBe(0);
  });

  test("owns exact presentation start and stop ordering", async () => {
    const { client, port } = await makeLoadedClient();
    const started = await client.startPresentation({
      presentation: { animate: true, seed: 42, themeKey: "ancient" },
      completionTimeoutMs: 1_000,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("presentation did not start");

    expect(port.messages).toEqual([
      { type: "black-flag:forge-visibility", visible: true },
      {
        type: "black-flag:forge-presentation",
        version: 1,
        presentationId: 1,
        enabled: true,
        animate: true,
        seed: 42,
        themeKey: "ancient",
        dungeon: undefined,
      },
    ]);

    port.emitMessage({ type: "black-flag:forge-anim-complete", version: 1, presentationId: 1 });
    expect(await started.session.completion).toBe("completed");
    started.session.stop();
    started.session.stop();
    expect(port.messages.slice(-2)).toEqual([
      {
        type: "black-flag:forge-presentation",
        version: 1,
        presentationId: 1,
        enabled: false,
        animate: false,
        seed: undefined,
        themeKey: undefined,
        dungeon: undefined,
      },
      { type: "black-flag:forge-visibility", visible: false },
    ]);
  });

  test("cannot lose a synchronous completion posted during presentation start", async () => {
    const { client, port } = await makeLoadedClient();
    port.onPost = (message) => {
      if (message.type === "black-flag:forge-presentation" && message.enabled) {
        port.emitMessage({
          type: "black-flag:forge-anim-complete",
          version: 1,
          presentationId: message.presentationId,
        });
      }
    };
    const started = await client.startPresentation({
      presentation: { animate: false },
      completionTimeoutMs: 800,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("presentation did not start");
    expect(await started.session.completion).toBe("completed");
  });

  test("accepts one uncorrelated completion from a legacy v1 frame", async () => {
    const { client, clock, port } = await makeLoadedClient();
    const started = await client.startPresentation({
      presentation: { animate: true },
      completionTimeoutMs: 800,
    });
    if (!started.ok) throw new Error("presentation did not start");

    port.emitMessage({ type: "black-flag:forge-anim-complete", version: 1 });
    expect(await started.session.completion).toBe("completed");

    const next = await client.startPresentation({
      presentation: { animate: true },
      completionTimeoutMs: 900,
    });
    if (!next.ok) throw new Error("presentation did not start");
    port.emitMessage({ type: "black-flag:forge-anim-complete", version: 1 });
    expect(clock.pending.size).toBe(1);
    port.emitMessage({ type: "black-flag:forge-anim-complete", version: 1, presentationId: 2 });
    expect(await next.session.completion).toBe("completed");
  });

  test("settles supersede, timeout, cancel, and dispose without leaked timers", async () => {
    const { client, clock, port } = await makeLoadedClient();
    const first = await client.startPresentation({
      presentation: { animate: true, seed: 1 },
      completionTimeoutMs: 100,
    });
    const second = await client.startPresentation({
      presentation: { animate: true, seed: 2 },
      completionTimeoutMs: 200,
    });
    if (!first.ok || !second.ok) throw new Error("presentation did not start");
    expect(await first.session.completion).toBe("superseded");
    expect(clock.pending.size).toBe(1);
    clock.runNext();
    expect(await second.session.completion).toBe("timeout");
    expect(clock.pending.size).toBe(0);
    second.session.stop();

    const cancelled = await client.startPresentation({
      presentation: { animate: true, seed: 3 },
      completionTimeoutMs: 300,
    });
    if (!cancelled.ok) throw new Error("presentation did not start");
    client.cancelPresentation();
    expect(await cancelled.session.completion).toBe("cancelled");
    expect(clock.pending.size).toBe(0);

    const disposed = await client.startPresentation({
      presentation: { animate: true, seed: 4 },
      completionTimeoutMs: 400,
    });
    if (!disposed.ok) throw new Error("presentation did not start");
    const messageCount = port.messages.length;
    client.dispose();
    expect(await disposed.session.completion).toBe("disposed");
    expect(clock.pending.size).toBe(0);
    disposed.session.stop();
    expect(port.messages).toHaveLength(messageCount);
  });

  test("ignores a late completion from a superseded presentation", async () => {
    const { client, clock, port } = await makeLoadedClient();
    const first = await client.startPresentation({
      presentation: { animate: false, seed: 1 },
      completionTimeoutMs: 100,
    });
    const second = await client.startPresentation({
      presentation: { animate: true, seed: 2 },
      completionTimeoutMs: 200,
    });
    if (!first.ok || !second.ok) throw new Error("presentation did not start");

    expect(await first.session.completion).toBe("superseded");
    port.emitMessage({ type: "black-flag:forge-anim-complete", version: 1 });
    expect(clock.pending.size).toBe(1);
    port.emitMessage({ type: "black-flag:forge-anim-complete", version: 1, presentationId: 1 });
    expect(clock.pending.size).toBe(1);
    port.emitMessage({ type: "black-flag:forge-anim-complete", version: 1, presentationId: 2 });
    expect(await second.session.completion).toBe("completed");
    expect(clock.pending.size).toBe(0);
  });

  test("fails closed when the current frame cannot receive presentation", async () => {
    const { client, clock, port } = await makeLoadedClient();
    port.postResult = false;
    const started = await client.startPresentation({
      presentation: { animate: true },
      completionTimeoutMs: 500,
    });
    expect(started).toEqual({ ok: false, reason: "post-failed" });
    expect(clock.pending.size).toBe(0);
  });
});
