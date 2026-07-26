import { describe, expect, test } from "bun:test";
import {
  applyWorldUpdate,
  createRunSession,
  resetRunSession,
  restoreRunSession,
  snapshotRunSession,
} from "../src/game/RunSession";
import { QuestState } from "../src/game/QuestState";
import type { StoneId } from "../src/ui/copy";
import { COPY, STONE_ORDER } from "../src/ui/copy";

function emptyUpdate(over: Partial<Parameters<typeof applyWorldUpdate>[2]> = {}) {
  return {
    collectedStoneId: null,
    stonesFound: 0,
    stonesTotal: 4,
    portalOpen: false,
    resolveGain: 0,
    damage: 0,
    reachedLockedExit: false,
    reachedOpenExit: false,
    ...over,
  };
}

describe("RunSession applyWorldUpdate", () => {
  test("collects stones and opens portal on the fourth via quest", () => {
    const session = createRunSession();
    const quest = new QuestState();
    quest.start(0);
    for (let i = 0; i < 3; i += 1) {
      const id = STONE_ORDER[i] as StoneId;
      const fx = applyWorldUpdate(session, quest, emptyUpdate({ collectedStoneId: id }), i * 1000);
      expect(fx.questStonesFound).toBe(i + 1);
      expect(fx.questPortalOpen).toBe(false);
      expect(fx.playPickup).toBe(true);
    }
    const last = STONE_ORDER[3] as StoneId;
    const fx = applyWorldUpdate(session, quest, emptyUpdate({ collectedStoneId: last }), 4000);
    expect(fx.questPortalOpen).toBe(true);
    expect(fx.questStonesFound).toBe(4);
    expect(quest.portalOpen).toBe(true);
    expect(fx.sessionChanged).toBe(true);
  });

  test("ignores a duplicate stone without emitting effects", () => {
    const session = createRunSession();
    const quest = new QuestState();
    quest.start(0);

    applyWorldUpdate(session, quest, emptyUpdate({ collectedStoneId: "ember" }), 1_000);
    const duplicate = applyWorldUpdate(
      session,
      quest,
      emptyUpdate({ collectedStoneId: "ember" }),
      2_000,
    );

    expect(quest.stonesFound).toBe(1);
    expect(duplicate).toEqual({});
  });

  test("damage to zero ends the run as dead", () => {
    const session = createRunSession(15);
    const quest = new QuestState();
    quest.start(0);
    const fx = applyWorldUpdate(session, quest, emptyUpdate({ damage: 20 }));
    expect(session.resolve).toBe(0);
    expect(session.runMode).toBe("dead");
    expect(fx.endOverlay).toBe("dead");
    expect(quest.isRunning).toBe(false);
  });

  test("fatal damage wins over an open exit in the same update", () => {
    const session = createRunSession(15);
    const quest = new QuestState();
    quest.start(0);
    for (const id of STONE_ORDER) quest.collectStone(id, 1_000);

    const fx = applyWorldUpdate(
      session,
      quest,
      emptyUpdate({ damage: 20, reachedOpenExit: true }),
      2_000,
    );

    expect(session.runMode).toBe("dead");
    expect(session.exitReached).toBe(false);
    expect(quest.escaped).toBe(false);
    expect(fx.endOverlay).toBe("dead");
  });

  test("resolve gain clamps at 100", () => {
    const session = createRunSession(90);
    const quest = new QuestState();
    quest.start(0);
    applyWorldUpdate(session, quest, emptyUpdate({ resolveGain: 28 }));
    expect(session.resolve).toBe(100);
  });

  test("keeps a quest-sealed exit active", () => {
    const session = createRunSession();
    const quest = new QuestState();
    quest.start(0);

    const fx = applyWorldUpdate(session, quest, emptyUpdate({ reachedOpenExit: true }), 5_000);

    expect(session.runMode).toBe("playing");
    expect(session.exitReached).toBe(false);
    expect(fx.endOverlay).toBeUndefined();
    expect(fx.status).toBe(COPY.status.portalSealed);
    expect(quest.escaped).toBe(false);
  });

  test("open exit wins once after quest opens portal", () => {
    const session = createRunSession();
    const quest = new QuestState();
    quest.start(0);
    for (const id of STONE_ORDER) {
      applyWorldUpdate(session, quest, emptyUpdate({ collectedStoneId: id }));
    }
    const fx = applyWorldUpdate(session, quest, emptyUpdate({ reachedOpenExit: true }), 5000);
    expect(session.runMode).toBe("won");
    expect(session.exitReached).toBe(true);
    expect(fx.endOverlay).toBe("won");
    expect(quest.escaped).toBe(true);

    const again = applyWorldUpdate(session, quest, emptyUpdate({ reachedOpenExit: true }), 6000);
    expect(again.endOverlay).toBeUndefined();
    expect(again).toEqual({});
    expect(quest.runSeconds(6_000)).toBe(5);
  });

  test("locked exit does not win", () => {
    const session = createRunSession();
    const quest = new QuestState();
    quest.start(0);
    const fx = applyWorldUpdate(session, quest, emptyUpdate({ reachedLockedExit: true }));
    expect(session.runMode).toBe("playing");
    expect(fx.endOverlay).toBeUndefined();
    expect(fx.status).toBeTruthy();
  });

  test("reset restores playing vitals", () => {
    const session = createRunSession(10);
    session.runMode = "dead";
    session.exitReached = true;
    resetRunSession(session, 100);
    expect(session).toEqual({ resolve: 100, runMode: "playing", exitReached: false });
  });

  test("restores resolve, stones, portal and result from one persisted snapshot", () => {
    const session = createRunSession(12);
    const quest = new QuestState();
    quest.start(0);
    for (const id of STONE_ORDER) quest.collectStone(id, 1_000);
    applyWorldUpdate(session, quest, emptyUpdate({ reachedOpenExit: true }), 2_000);
    const persisted = snapshotRunSession(session, quest);

    const restoredSession = createRunSession();
    const restoredQuest = new QuestState();
    restoreRunSession(restoredSession, restoredQuest, persisted, 10_000);

    expect(restoredSession).toEqual(session);
    expect(restoredQuest.snapshot(10_000)).toMatchObject({
      foundIds: [...STONE_ORDER],
      portalOpen: true,
      escaped: true,
    });
  });
});
