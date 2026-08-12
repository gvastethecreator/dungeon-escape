import { describe, expect, test } from "bun:test";

import {
  compareRgbaImages,
  VISUAL_PARITY_SCENES,
} from "../src/systems/VisualParityCompare";

function solid(width: number, height: number, rgba: readonly [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { width, height, data };
}

describe("visual parity compare", () => {
  test("identical images are within threshold", () => {
    const image = solid(8, 8, [20, 40, 60, 255]);
    const report = compareRgbaImages(image, image);
    expect(report.mismatchedPixels).toBe(0);
    expect(report.withinThreshold).toBe(true);
    expect(report.regions).toHaveLength(16);
  });

  test("detects a localized color change and names the region", () => {
    const expected = solid(8, 8, [10, 10, 10, 255]);
    const actual = solid(8, 8, [10, 10, 10, 255]);
    // Flip one pixel in the bottom-right region of a 4x4 grid on an 8x8 image.
    actual.data[actual.data.length - 4] = 200;
    const report = compareRgbaImages(expected, actual, {
      channelTolerance: 0,
      mismatchRatioThreshold: 0,
      regionGrid: 4,
    });
    expect(report.mismatchedPixels).toBe(1);
    expect(report.withinThreshold).toBe(false);
    const hot = report.regions.filter((region) => region.mismatchedPixels > 0);
    expect(hot).toHaveLength(1);
    expect(hot[0]?.id).toBe("r3-3");
  });

  test("publishes the five baseline scenes", () => {
    expect(VISUAL_PARITY_SCENES.map((scene) => scene.id)).toEqual([
      "empty-corridor",
      "torch-hall",
      "enemy-near",
      "portal-ready",
      "hazard-floor",
    ]);
  });
});
