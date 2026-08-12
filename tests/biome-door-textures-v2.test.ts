import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { listBiomeIds } from "../src/systems/BiomeIdentity";
import { hasLocalSourceAssets } from "./local-source-assets";

interface DoorTextureRecord {
  id: string;
  source: string;
  sourceSha256: string;
  sourceSize: [number, number];
  outputSize: [number, number];
  maps: Record<"albedo" | "normal" | "roughness" | "metalness", string>;
  outputSha256: Record<"albedo" | "normal" | "roughness" | "metalness", string>;
  meanLuma: number;
  roughnessRange: [number, number];
  metalnessRange: [number, number];
  metalCoverage: number;
  visualReview: {
    decision: "kept" | "regenerated";
    identityCues: string[];
    lightingCheck: string;
  };
  centerSplit: {
    detectedColumn: number;
    offsetPixels: number;
    withinTolerance: boolean;
  };
}

interface DoorTextureManifest {
  contract: { layout: string; wrap: string; lighting: string };
  doors: DoorTextureRecord[];
}

interface RuntimeOptimizationEntry {
  source: string;
  target: string;
  sourceDimensions: [number, number];
  targetDimensions: [number, number];
  sourceSha256: string;
  targetSha256: string;
}

const projectPath = (...parts: string[]) => resolve(import.meta.dir, "..", ...parts);
const digest = (path: string) =>
  createHash("sha256")
    .update(readFileSync(projectPath(path)))
    .digest("hex");

const hasDoorSources = hasLocalSourceAssets(
  "imagegen",
  "biome-door-textures-v2",
  "manifest.json",
);
const manifest = (
  hasDoorSources
    ? JSON.parse(
        readFileSync(
          projectPath("assets-source", "imagegen", "biome-door-textures-v2", "manifest.json"),
          "utf8",
        ),
      )
    : { contract: { layout: "", wrap: "", lighting: "" }, doors: [] }
) as DoorTextureManifest;
const runtimeImages = hasDoorSources
  ? (
      JSON.parse(
        readFileSync(projectPath("assets-source", "runtime-optimization-manifest.json"), "utf8"),
      ) as { images: RuntimeOptimizationEntry[] }
    ).images
  : [];

describe.skipIf(!hasDoorSources)("biome door texture v2 contract", () => {

  test("covers every biome with a centered full double-leaf plate", () => {
    expect(manifest.doors.map(({ id }) => id)).toEqual([...listBiomeIds()]);
    expect(manifest.contract.layout).toContain("U=0.5");
    expect(manifest.contract.wrap).toBe("clamp-to-edge");
    for (const door of manifest.doors) {
      expect(door.outputSize).toEqual([512, 512]);
      expect(door.centerSplit.withinTolerance).toBe(true);
      expect(Math.abs(door.centerSplit.offsetPixels)).toBeLessThanOrEqual(8);
      expect(door.sourceSize[0]).toBeGreaterThanOrEqual(1_024);
      expect(door.sourceSize[1]).toBeGreaterThanOrEqual(1_024);
      expect(door.meanLuma).toBeGreaterThanOrEqual(0.18);
      expect(door.meanLuma).toBeLessThanOrEqual(0.58);
      expect(door.roughnessRange[0]).toBeGreaterThanOrEqual(0.28);
      expect(door.roughnessRange[1]).toBeLessThanOrEqual(1);
      expect(door.metalnessRange[0]).toBeGreaterThanOrEqual(0);
      expect(door.metalnessRange[1]).toBeLessThanOrEqual(1);
      expect(door.metalnessRange[1]).toBeGreaterThan(door.metalnessRange[0]);
      expect(door.metalCoverage).toBeGreaterThanOrEqual(0);
      expect(door.metalCoverage).toBeLessThanOrEqual(1);
      expect(door.visualReview.identityCues.length).toBeGreaterThanOrEqual(2);
      expect(door.visualReview.lightingCheck).toContain("no directional gradient");
    }
  });

  test("records the five weak sources as regenerated with biome-specific cues", () => {
    const records = Object.fromEntries(manifest.doors.map((door) => [door.id, door]));
    const requiredCues = {
      fungal: ["mushroom", "mycelium"],
      ash: ["carbonized", "ash"],
      obsidian: ["volcanic glass", "purple"],
      sunken: ["waterlogged", "algae"],
      grim: ["dark oak", "gray iron"],
    } as const;

    for (const [id, cues] of Object.entries(requiredCues)) {
      const record = records[id]!;
      expect(record.visualReview.decision).toBe("regenerated");
      const summary = record.visualReview.identityCues.join(" ");
      for (const cue of cues) expect(summary).toContain(cue);
    }
    expect(new Set(manifest.doors.map(({ sourceSha256 }) => sourceSha256)).size).toBe(
      manifest.doors.length,
    );
  });

  test("tracks source maps and their verified half-size runtime outputs", () => {
    for (const door of manifest.doors) {
      expect(digest(door.source)).toBe(door.sourceSha256);
      for (const kind of ["albedo", "normal", "roughness", "metalness"] as const) {
        const optimized = runtimeImages.find((entry) => entry.source === door.maps[kind]);
        expect(optimized).toBeDefined();
        if (!optimized) throw new Error(`Missing optimized door map: ${door.maps[kind]}`);
        expect(optimized.sourceDimensions).toEqual([512, 512]);
        expect(optimized.targetDimensions).toEqual([256, 256]);
        expect(optimized.sourceSha256).toBe(door.outputSha256[kind]);
        expect(optimized.target.endsWith(".webp")).toBe(true);
        expect(digest(optimized.target)).toBe(optimized.targetSha256);
      }
      expect(new Set(Object.values(door.outputSha256)).size).toBe(4);
    }
  });
});
