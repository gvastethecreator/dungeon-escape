import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";

import {
  createLuminousWardGoldMaterial,
  createLuminousWardRuntimeTexture,
} from "../src/world/LuminousWardMaterial";
import { MODEL_PBR_SOURCE_REPEAT_SCALE } from "../src/world/MaterialLibrary";
import { hasLocalSourceAssets } from "./local-source-assets";

interface MaterialRecord {
  id: string;
  source: string;
  sourceSha256: string;
  sourceCropMargin: number;
  sourceSampleWidth: number;
  sourceSampleHeight: number;
  wrapMode: string;
  maps: Record<"albedo" | "height" | "normal" | "roughness" | "ao", string>;
  outputSha256: Record<"albedo" | "height" | "normal" | "roughness" | "ao", string>;
  meanLuma: number;
  meanRgb: [number, number, number];
  centerDetailRatio: { horizontal: number; vertical: number };
  roughnessRange: [number, number];
}

interface MaterialManifest {
  mapSize: number;
  materials: MaterialRecord[];
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
const sha256 = (path: string) =>
  createHash("sha256")
    .update(readFileSync(projectPath(path)))
    .digest("hex");

const hasMaterialSources = hasLocalSourceAssets(
  "runtime-metadata",
  "textures",
  "model-materials-v2",
  "manifest.json",
);
const manifest = (
  hasMaterialSources
    ? JSON.parse(
        readFileSync(
          projectPath(
            "assets-source",
            "runtime-metadata",
            "textures",
            "model-materials-v2",
            "manifest.json",
          ),
          "utf8",
        ),
      )
    : { mapSize: 0, materials: [] }
) as MaterialManifest;
const runtimeImages = hasMaterialSources
  ? (
      JSON.parse(
        readFileSync(projectPath("assets-source", "runtime-optimization-manifest.json"), "utf8"),
      ) as { images: RuntimeOptimizationEntry[] }
    ).images
  : [];

describe.skipIf(!hasMaterialSources)("model material texture v2 contract", () => {
  test("covers every shared role with an intact authored interior and explicit wrap policy", () => {
    expect(manifest.materials.map(({ id }) => id)).toEqual([
      "aged-oak",
      "black-iron",
      "dull-brass",
      "dungeon-stone",
      "ash-ceramic",
      "aged-bone",
      "woven-cloth",
      "cured-meat",
      "dungeon-ice",
      "arcane-crystal",
      "luminous-ward-gold",
      "root-bark",
      "ochre-painted-steel",
    ]);
    for (const material of manifest.materials) {
      expect(material.wrapMode).toBe(
        material.id === "cured-meat" ? "clamp-to-edge" : "mirrored-repeat",
      );
      expect(material.sourceCropMargin).toBeGreaterThan(0);
      expect(material.sourceSampleHeight).toBeGreaterThan(0);
      expect(material.sourceSampleHeight).toBeLessThanOrEqual(1);
      expect(material.sourceSampleWidth).toBeGreaterThan(0);
      expect(material.sourceSampleWidth).toBeLessThanOrEqual(1);
      expect(material.centerDetailRatio.horizontal).toBeGreaterThan(0.7);
      expect(material.centerDetailRatio.vertical).toBeGreaterThan(0.7);
      expect(material.meanLuma).toBeGreaterThanOrEqual(material.id === "root-bark" ? 0.28 : 0.3);
      expect(material.meanLuma).toBeLessThanOrEqual(0.71);
    }
    expect(manifest.materials.find(({ id }) => id === "root-bark")?.sourceSampleHeight).toBe(0.46);
    expect(manifest.materials.find(({ id }) => id === "root-bark")?.sourceSampleWidth).toBe(0.48);
    const wardGold = manifest.materials.find(({ id }) => id === "luminous-ward-gold")!;
    expect(wardGold.meanRgb[0]).toBeGreaterThan(wardGold.meanRgb[2]);
    expect(wardGold.meanRgb[1]).toBeGreaterThan(wardGold.meanRgb[2]);
    expect(wardGold.meanRgb[0] - wardGold.meanRgb[1]).toBeLessThan(0.12);
    const curedMeat = manifest.materials.find(({ id }) => id === "cured-meat")!;
    expect(curedMeat.wrapMode).toBe("clamp-to-edge");
    expect(curedMeat.meanRgb[0]).toBeGreaterThan(curedMeat.meanRgb[1]);
    expect(curedMeat.meanRgb[1]).toBeGreaterThan(curedMeat.meanRgb[2]);
    expect(curedMeat.roughnessRange[0]).toBeGreaterThanOrEqual(0.72);
    expect(curedMeat.roughnessRange[1]).toBeLessThanOrEqual(0.82);
  });

  test("tracks authored 512 px maps and their verified 256 px WebP runtime outputs", () => {
    expect(manifest.mapSize).toBe(512);
    for (const material of manifest.materials) {
      expect(sha256(material.source)).toBe(material.sourceSha256);
      for (const kind of ["albedo", "height", "normal", "roughness", "ao"] as const) {
        const optimized = runtimeImages.find((entry) => entry.source === material.maps[kind]);
        expect(optimized).toBeDefined();
        if (!optimized) throw new Error(`Missing optimized material map: ${material.maps[kind]}`);
        expect(optimized.sourceDimensions).toEqual([manifest.mapSize, manifest.mapSize]);
        expect(optimized.targetDimensions).toEqual([256, 256]);
        expect(optimized.sourceSha256).toBe(material.outputSha256[kind]);
        expect(optimized.target.endsWith(".webp")).toBe(true);
        expect(sha256(optimized.target)).toBe(optimized.targetSha256);
      }
    }
  });

  test("configures the ward-only runtime channels without touching shared crystal", () => {
    const albedo = createLuminousWardRuntimeTexture("albedo");
    const normal = createLuminousWardRuntimeTexture("normal");
    const roughness = createLuminousWardRuntimeTexture("roughness");
    const ao = createLuminousWardRuntimeTexture("ao");

    expect(albedo.name).toContain("luminous-ward-gold_albedo.webp");
    expect(albedo.colorSpace).toBe(THREE.SRGBColorSpace);
    for (const dataMap of [normal, roughness, ao]) {
      expect(dataMap.colorSpace).toBe(THREE.NoColorSpace);
      expect(dataMap.wrapS).toBe(THREE.MirroredRepeatWrapping);
      expect(dataMap.wrapT).toBe(THREE.MirroredRepeatWrapping);
      expect(dataMap.repeat.toArray()).toEqual([2, 2]);
      expect(dataMap.userData.seamTreatment).toBe("source-image");
    }
    expect(ao.channel).toBe(0);

    const material = createLuminousWardGoldMaterial({ compact: true });
    expect(material.userData.materialRole).toBe("luminous-ward-gold");
    expect(material.map?.name).toContain("luminous-ward-gold_albedo.webp");
    expect(material.normalMap).toBeNull();
    expect(material.roughnessMap).toBeNull();
    expect(material.aoMap).toBeNull();
    expect(material.roughness).toBe(0.46);
    expect(material.metalness).toBe(0);

    for (const texture of [albedo, normal, roughness, ao, material.map]) texture?.dispose();
    material.dispose();
  });

  test("keeps model PBR sources at 512 px while preserving the old 2x2 texel density", () => {
    expect(MODEL_PBR_SOURCE_REPEAT_SCALE).toBe(2);
    const materialLibrarySource = readFileSync(
      projectPath("src", "world", "MaterialLibrary.ts"),
      "utf8",
    );
    expect(
      materialLibrarySource.match(/registerTextureSource\([^\n]+\{ seam: "none" \}\)/g),
    ).toHaveLength(4);
    expect(materialLibrarySource).not.toContain(
      "registerTextureSource(albedo, `${base}_albedo.webp`, true)",
    );
  });

  test("records the retained ImageGen cured-meat original, approved edit and prompt contract", () => {
    const provenance = JSON.parse(
      readFileSync(
        projectPath(
          "assets-source",
          "imagegen",
          "material-textures-v2",
          "imagegen-provenance.json",
        ),
        "utf8",
      ),
    ) as {
      sources: Record<string, string>;
      edits: Record<string, { source: string; reason: string }>;
      materialPrompts: Record<string, string>;
      originalDirectory: string;
      retention: string;
    };
    expect(provenance.sources["cured-meat"]).toBe("exec-0ca6e774-bd07-4451-85c6-72196392737f.png");
    expect(provenance.edits["cured-meat"]?.source).toBe(
      "exec-d8546bd6-9f0c-48c4-8f53-270642198ca0.png",
    );
    expect(provenance.edits["cured-meat"]?.reason).toContain("directional muscle fibers");
    expect(provenance.materialPrompts["cured-meat"]).toContain("cured dark red meat albedo");
    expect(provenance.originalDirectory).toContain(".codex/generated_images");
    expect(provenance.retention).toContain("remain in place");
  });
});
