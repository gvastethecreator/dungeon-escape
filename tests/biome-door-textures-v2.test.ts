import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { listBiomeIds } from "../src/systems/BiomeIdentity";

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

const projectPath = (...parts: string[]) => resolve(import.meta.dir, "..", ...parts);
const digest = (path: string) =>
  createHash("sha256")
    .update(readFileSync(projectPath(path)))
    .digest("hex");

function pngSize(path: string): [number, number] {
  const header = readFileSync(projectPath(path)).subarray(0, 24);
  expect(header.subarray(1, 4).toString()).toBe("PNG");
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

describe("biome door texture v2 contract", () => {
  const manifest = JSON.parse(
    readFileSync(
      projectPath("assets-source", "imagegen", "biome-door-textures-v2", "manifest.json"),
      "utf8",
    ),
  ) as DoorTextureManifest;

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

  test("tracks source and generated map hashes at the runtime paths", () => {
    for (const door of manifest.doors) {
      expect(digest(door.source)).toBe(door.sourceSha256);
      for (const kind of ["albedo", "normal", "roughness", "metalness"] as const) {
        expect(pngSize(door.maps[kind])).toEqual([512, 512]);
        expect(digest(door.maps[kind])).toBe(door.outputSha256[kind]);
      }
      expect(new Set(Object.values(door.outputSha256)).size).toBe(4);
    }
  });
});
