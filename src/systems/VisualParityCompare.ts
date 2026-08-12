/**
 * Pixel comparison helpers for the WebGPU visual parity harness (WGP-02).
 * Pure and DOM-free so Bun tests can exercise the contract without a browser.
 */

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA bytes, length = width * height * 4. */
  readonly data: Uint8ClampedArray | Uint8Array;
}

export interface RegionDiff {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly mismatchedPixels: number;
  readonly maxChannelDelta: number;
  readonly meanChannelDelta: number;
}

export interface VisualParityReport {
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly mismatchedPixels: number;
  readonly mismatchRatio: number;
  readonly maxChannelDelta: number;
  readonly meanChannelDelta: number;
  readonly regions: readonly RegionDiff[];
  readonly withinThreshold: boolean;
}

export interface VisualParityOptions {
  /** Per-channel absolute delta tolerated before a pixel counts as mismatched. */
  readonly channelTolerance?: number;
  /** Global mismatch ratio threshold (0..1). */
  readonly mismatchRatioThreshold?: number;
  /** Optional grid size for regional reporting (default 4 → 4x4). */
  readonly regionGrid?: number;
}

function channelDelta(a: number, b: number): number {
  return Math.abs(a - b);
}

export function compareRgbaImages(
  expected: RgbaImage,
  actual: RgbaImage,
  options: VisualParityOptions = {},
): VisualParityReport {
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(
      `Image size mismatch: expected ${expected.width}x${expected.height}, got ${actual.width}x${actual.height}`,
    );
  }
  const channelTolerance = options.channelTolerance ?? 2;
  const mismatchRatioThreshold = options.mismatchRatioThreshold ?? 0.002;
  const regionGrid = Math.max(1, options.regionGrid ?? 4);
  const width = expected.width;
  const height = expected.height;
  const comparedPixels = width * height;

  const regionW = Math.ceil(width / regionGrid);
  const regionH = Math.ceil(height / regionGrid);
  const regions: RegionDiff[] = [];
  for (let gy = 0; gy < regionGrid; gy += 1) {
    for (let gx = 0; gx < regionGrid; gx += 1) {
      const x = gx * regionW;
      const y = gy * regionH;
      regions.push({
        id: `r${gy}-${gx}`,
        x,
        y,
        width: Math.min(regionW, width - x),
        height: Math.min(regionH, height - y),
        mismatchedPixels: 0,
        maxChannelDelta: 0,
        meanChannelDelta: 0,
      });
    }
  }

  let mismatchedPixels = 0;
  let maxChannelDelta = 0;
  let sumChannelDelta = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const dr = channelDelta(expected.data[i]!, actual.data[i]!);
      const dg = channelDelta(expected.data[i + 1]!, actual.data[i + 1]!);
      const db = channelDelta(expected.data[i + 2]!, actual.data[i + 2]!);
      const da = channelDelta(expected.data[i + 3]!, actual.data[i + 3]!);
      const pixelMax = Math.max(dr, dg, db, da);
      maxChannelDelta = Math.max(maxChannelDelta, pixelMax);
      sumChannelDelta += (dr + dg + db + da) / 4;

      const gx = Math.min(regionGrid - 1, Math.floor(x / regionW));
      const gy = Math.min(regionGrid - 1, Math.floor(y / regionH));
      const region = regions[gy * regionGrid + gx]!;
      region.maxChannelDelta = Math.max(region.maxChannelDelta, pixelMax);

      if (pixelMax > channelTolerance) {
        mismatchedPixels += 1;
        region.mismatchedPixels += 1;
      }
    }
  }

  for (const region of regions) {
    const count = Math.max(1, region.width * region.height);
    region.meanChannelDelta = region.mismatchedPixels / count;
  }

  const mismatchRatio = comparedPixels === 0 ? 0 : mismatchedPixels / comparedPixels;
  return {
    width,
    height,
    comparedPixels,
    mismatchedPixels,
    mismatchRatio,
    maxChannelDelta,
    meanChannelDelta: comparedPixels === 0 ? 0 : sumChannelDelta / comparedPixels,
    regions,
    withinThreshold: mismatchRatio <= mismatchRatioThreshold,
  };
}

export interface VisualParitySceneConfig {
  readonly id: string;
  readonly seed: string;
  readonly mood: string;
  readonly floorIndex: number;
  readonly channelTolerance: number;
  readonly mismatchRatioThreshold: number;
}

/** Baseline scene matrix for WGP-02. Capture scripts should honor these ids. */
export const VISUAL_PARITY_SCENES: readonly VisualParitySceneConfig[] = [
  {
    id: "empty-corridor",
    seed: "WGP02-CORRIDOR",
    mood: "ash",
    floorIndex: 0,
    channelTolerance: 2,
    mismatchRatioThreshold: 0.002,
  },
  {
    id: "torch-hall",
    seed: "WGP02-TORCH",
    mood: "molten",
    floorIndex: 1,
    channelTolerance: 3,
    mismatchRatioThreshold: 0.004,
  },
  {
    id: "enemy-near",
    seed: "WGP02-ENEMY",
    mood: "verdant",
    floorIndex: 2,
    channelTolerance: 3,
    mismatchRatioThreshold: 0.004,
  },
  {
    id: "portal-ready",
    seed: "WGP02-PORTAL",
    mood: "obsidian",
    floorIndex: 3,
    channelTolerance: 3,
    mismatchRatioThreshold: 0.005,
  },
  {
    id: "hazard-floor",
    seed: "WGP02-HAZARD",
    mood: "frost",
    floorIndex: 0,
    channelTolerance: 3,
    mismatchRatioThreshold: 0.004,
  },
];
