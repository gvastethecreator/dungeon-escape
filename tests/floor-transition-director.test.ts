import { describe, expect, test } from "bun:test";

import {
  FloorTransitionDirector,
  type FloorTransitionPort,
  type FloorTransitionStage,
} from "../src/game/FloorTransitionDirector";

interface Prepared {
  id: string;
}

interface PortProbe {
  port: FloorTransitionPort<Prepared>;
  events: string[];
  setTargetActive(active: boolean): void;
}

function createPort(
  options: {
    reject?: "not-ready" | "invalid-target" | "missing-linked-stair";
    fail?: FloorTransitionStage;
    activateTargetBeforeFailure?: boolean;
    checkpointSaved?: boolean;
    warmup?: "ready" | "degraded";
  } = {},
): PortProbe {
  const events: string[] = [];
  let targetActive = false;
  const fail = (stage: FloorTransitionStage): void => {
    if (options.fail === stage) throw new Error(`${stage} failed`);
  };
  return {
    events,
    setTargetActive(active) {
      targetActive = active;
    },
    port: {
      prepare() {
        events.push("prepare");
        fail("prepare");
        return options.reject
          ? { ok: false, reason: options.reject }
          : { ok: true, value: { id: "target" } };
      },
      checkpoint() {
        events.push("checkpoint");
        fail("checkpoint");
        return options.checkpointSaved ?? true;
      },
      setInputBlocked(blocked) {
        events.push(`input:${blocked}`);
        if (!blocked) fail("input");
      },
      async fade(opaque) {
        events.push(`fade:${opaque}`);
        fail(opaque ? "cover" : "reveal");
      },
      async activate() {
        events.push("activate");
        if (options.activateTargetBeforeFailure) targetActive = true;
        fail("activate");
        targetActive = true;
      },
      isTargetActive() {
        return targetActive;
      },
      async warmup() {
        events.push("warmup");
        fail("warmup");
        return options.warmup ?? "ready";
      },
      present() {
        events.push("present");
        fail("present");
      },
      recoverTarget() {
        events.push("recover");
        fail("recovery");
      },
    },
  };
}

describe("FloorTransitionDirector", () => {
  test("runs checkpoint, cover, activation, warmup, presentation, and cleanup once", async () => {
    const probe = createPort({ checkpointSaved: false, warmup: "degraded" });
    const director = new FloorTransitionDirector(probe.port);

    expect(await director.start({ targetFloor: 1, direction: "down" })).toEqual({
      kind: "completed",
      checkpoint: "session-only",
      warmup: "degraded",
    });
    expect(probe.events).toEqual([
      "prepare",
      "checkpoint",
      "input:true",
      "fade:true",
      "activate",
      "warmup",
      "present",
      "fade:false",
      "input:false",
    ]);
  });

  test("rejects invalid preparation without touching checkpoint or UI", async () => {
    const probe = createPort({ reject: "missing-linked-stair" });
    const director = new FloorTransitionDirector(probe.port);

    expect(await director.start({ targetFloor: 2, direction: "up" })).toEqual({
      kind: "rejected",
      reason: "missing-linked-stair",
    });
    expect(probe.events).toEqual(["prepare"]);
  });

  test("rejects a concurrent request while the active operation owns the gate", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const probe = createPort();
    probe.port.activate = async () => {
      probe.events.push("activate");
      await gate;
      probe.setTargetActive(true);
    };
    const director = new FloorTransitionDirector(probe.port);
    const active = director.start({ targetFloor: 1, direction: "down" });

    expect(await director.start({ targetFloor: 2, direction: "down" })).toEqual({
      kind: "rejected",
      reason: "busy",
    });
    release();
    expect((await active).kind).toBe("completed");
  });

  test("reports prepare, checkpoint, and cover failures at their exact boundary", async () => {
    for (const stage of ["prepare", "checkpoint", "cover"] as const) {
      const probe = createPort({ fail: stage });
      const result = await new FloorTransitionDirector(probe.port).start({
        targetFloor: 1,
        direction: "down",
      });
      expect(result).toMatchObject({ kind: "recovered", stage, activeFloor: "source" });
      if (stage === "cover") {
        expect(probe.events.slice(-2)).toEqual(["fade:false", "input:false"]);
      } else {
        expect(probe.events).not.toContain("input:true");
      }
    }
  });

  test("distinguishes activation failure before and after target replacement", async () => {
    const sourceProbe = createPort({ fail: "activate" });
    const source = await new FloorTransitionDirector(sourceProbe.port).start({
      targetFloor: 1,
      direction: "down",
    });
    expect(source).toMatchObject({
      kind: "recovered",
      stage: "activate",
      activeFloor: "source",
    });
    expect(sourceProbe.events).not.toContain("recover");
    expect(sourceProbe.events.slice(-2)).toEqual(["fade:false", "input:false"]);

    const targetProbe = createPort({ fail: "activate", activateTargetBeforeFailure: true });
    const target = await new FloorTransitionDirector(targetProbe.port).start({
      targetFloor: 1,
      direction: "down",
    });
    expect(target).toMatchObject({
      kind: "recovered",
      stage: "activate",
      activeFloor: "target",
    });
    expect(targetProbe.events).toContain("recover");
  });

  test("recovers target failures and reports reveal failures without skipping input cleanup", async () => {
    for (const stage of ["warmup", "present"] as const) {
      const probe = createPort({ fail: stage });
      const result = await new FloorTransitionDirector(probe.port).start({
        targetFloor: 1,
        direction: "down",
      });
      expect(result).toMatchObject({ kind: "recovered", stage, activeFloor: "target" });
      expect(probe.events).toContain("recover");
      expect(probe.events.at(-1)).toBe("input:false");
    }

    const revealProbe = createPort({ fail: "reveal" });
    const reveal = await new FloorTransitionDirector(revealProbe.port).start({
      targetFloor: 1,
      direction: "down",
    });
    expect(reveal).toMatchObject({
      kind: "recovered",
      stage: "reveal",
      activeFloor: "target",
    });
    expect(revealProbe.events.at(-1)).toBe("input:false");
  });
});
