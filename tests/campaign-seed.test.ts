import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { mintCampaignSeed, nextCampaignSeed } from "../src/game/CampaignSeed";
import { parseLaunchConfiguration } from "../src/launch/LaunchConfiguration";

describe("campaign New Game seeds", () => {
  test("mints distinct ASH seeds from random bytes", () => {
    expect(mintCampaignSeed(() => Uint32Array.of(10))).toBe("ASH-A");
    expect(mintCampaignSeed(() => Uint32Array.of(11))).toBe("ASH-B");
  });

  test("ignores URL and visualQa seeds unless visual QA is actually enabled", () => {
    const mint = (): string => "ASH-FRESH";
    const urlSeed = parseLaunchConfiguration("?seed=LONG-RUN").visualQa;
    const auditSeed = parseLaunchConfiguration("?perfAudit=1&seed=PINNED").visualQa;
    const qaSeed = parseLaunchConfiguration("?perfAudit=1&qaState=portal&seed=QA-MAP").visualQa;

    expect(urlSeed.seed).toBeNull();
    expect(nextCampaignSeed(urlSeed, mint)).toBe("ASH-FRESH");
    expect(auditSeed.enabled).toBe(false);
    expect(auditSeed.seed).toBe("PINNED");
    expect(nextCampaignSeed(auditSeed, mint)).toBe("ASH-FRESH");
    expect(nextCampaignSeed(qaSeed, mint)).toBe("QA-MAP");
  });

  test("New Game mints a campaign seed instead of the HTML default or URL seed", () => {
    const source = readFileSync("src/main.ts", "utf8");
    expect(source).toContain("nextCampaignSeed(launchConfig.visualQa, makeSeed)");
    expect(source).not.toContain("launchConfig.visualQa.seed ?? makeSeed()");
    expect(source).not.toContain("startPlayWithSeed(launchConfig.seed");
    expect(source).not.toContain("startPlayWithSeed(urlSeed");
    expect(source).not.toContain("startPlayWithSeed(elements.seed.value");
    expect(source).toContain("const normalizedSeed = seed.trim() || makeSeed()");
    expect(source).not.toContain("const normalizedSeed = seed.trim() || COPY.hud.seedDefault");
  });
});
