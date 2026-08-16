import { describe, expect, test } from "bun:test";

import { auditRuntimeAssets } from "../scripts/audit-runtime-assets";
import { listEnemyAtlasSources } from "../src/world/EnemySpriteAtlas";
import { hasLocalSourceAssets } from "./local-source-assets";

describe("runtime asset boundary", () => {
  test("audits the tracked runtime package without requiring local source manifests", async () => {
    const audit = await auditRuntimeAssets();
    expect(audit.optimizationManifest).toBe(
      hasLocalSourceAssets("runtime-optimization-manifest.json") ? "verified" : "unavailable",
    );
    expect(audit.missing).toEqual([]);
    expect(audit.sourceLeaks).toEqual([]);
    expect(audit.enemyAtlasOrphans).toEqual([]);
    expect(audit.unoptimizedRasters).toEqual([]);
    expect(audit.optimizationIssues).toEqual([]);
    expect(audit.ok).toBe(true);
  });

  test.skipIf(!hasLocalSourceAssets("runtime-optimization-manifest.json"))(
    "keeps source inputs and legacy atlases out of public",
    async () => {
      const audit = await auditRuntimeAssets();
      expect(audit.sourceLeaks).toEqual([]);
      expect(audit.enemyAtlasOrphans).toEqual([]);
      expect(audit.missing).toEqual([]);
      expect(audit.unoptimizedRasters).toEqual([]);
      expect(audit.optimizationIssues).toEqual([]);
      expect(audit.ok).toBe(true);
    },
  );

  test("ships the active enemy family as lossless WebP outputs", () => {
    const sources = listEnemyAtlasSources();
    expect(sources).toHaveLength(12);
    expect(sources.every((source) => source.endsWith(".webp"))).toBe(true);
  });
});
