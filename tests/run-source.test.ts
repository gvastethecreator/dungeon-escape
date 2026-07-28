import { describe, expect, test } from "bun:test";

import {
  isLeaderboardEligible,
  isRunSource,
  runSourceForDungeon,
} from "../src/game/RunSource";
import { runSourceFromLocalSave, type LocalRunSave } from "../src/game/LocalRunSave";
import { parseLeaderboardSubmission } from "../src/leaderboard/contract";

const completeRun = {
  runId: "run_01JTESTLEADERBOARD",
  playerName: "Cristian",
  durationMs: 240_000,
  distanceM: 540,
  stonesFound: 4 as const,
  biome: "Molten",
  seed: "ASH-TEST-17",
  difficultyValue: 0.5,
  roomCount: 42,
};

describe("run source and leaderboard eligibility", () => {
  test("campaign ranks; custom never does", () => {
    expect(isLeaderboardEligible("campaign")).toBe(true);
    expect(isLeaderboardEligible("custom")).toBe(false);
    expect(isRunSource("campaign")).toBe(true);
    expect(isRunSource("practice")).toBe(false);
  });

  test("forge metadata forces custom", () => {
    expect(runSourceForDungeon("campaign", true)).toBe("custom");
    expect(runSourceForDungeon("campaign", false)).toBe("campaign");
    expect(runSourceForDungeon("custom", false)).toBe("custom");
  });

  test("older local saves without runSource stay campaign for continue", () => {
    const bare = { version: 2, savedAt: 1, state: {} } as unknown as LocalRunSave;
    expect(runSourceFromLocalSave(bare)).toBe("campaign");
    expect(runSourceFromLocalSave({ ...bare, runSource: "custom" })).toBe("custom");
    expect(runSourceFromLocalSave(null)).toBe("campaign");
  });

  test("API rejects custom run posts", () => {
    expect(parseLeaderboardSubmission({ ...completeRun, runSource: "custom" })).toEqual(
      expect.objectContaining({ ok: false, code: "CUSTOM_RUN" }),
    );
    const campaign = parseLeaderboardSubmission({ ...completeRun, runSource: "campaign" });
    expect(campaign.ok).toBe(true);
    // Legacy clients without runSource still rank (metrics-only body).
    expect(parseLeaderboardSubmission(completeRun).ok).toBe(true);
  });
});
