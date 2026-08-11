export const PALETTE_POST_EFFECT_IDS = [
  "off",
  "game-boy-olive",
  "cga-0-high",
  "ega-16",
  "commodore-64",
  "pico-8",
  "zx-spectrum",
] as const;

export type PalettePostEffectId = (typeof PALETTE_POST_EFFECT_IDS)[number];

export interface PalettePostEffectProfile {
  readonly id: Exclude<PalettePostEffectId, "off">;
  readonly label: string;
  readonly colors: readonly string[];
  /** Player-facing master amount selected when this palette is first enabled. */
  readonly recommendedDitherStrength: number;
  /** Palette-specific quantization response for dark 3D scenes. */
  readonly quantization: PaletteQuantizationTuning;
}

export interface PaletteQuantizationTuning {
  /** Maximum Oklab lightness displacement before nearest-color matching. */
  readonly ditherAmplitude: number;
  /** Ordered-pattern pixel size. Values above one make the pattern coarser. */
  readonly patternScale: number;
  /** Dark flat pixels below this range receive little or no dithering. */
  readonly shadowStart: number;
  readonly shadowEnd: number;
  /** Suppress ordered noise on flat fields while retaining it around detail. */
  readonly flatSuppression: number;
  readonly detailBoost: number;
  /** Palette-specific exposure compensation in Oklab lightness. */
  readonly lightnessBias: number;
  /** Perceptual nearest-color weights. */
  readonly lightnessWeight: number;
  readonly chromaWeight: number;
}

export const DEFAULT_PALETTE_POST_EFFECT: PalettePostEffectId = "off";
export const DEFAULT_PALETTE_DITHER_STRENGTH = 0.72;
export const MAX_POST_PALETTE_COLORS = 16;

export const PALETTE_POST_EFFECT_PROFILES: readonly PalettePostEffectProfile[] = Object.freeze([
  {
    id: "game-boy-olive",
    label: "Game Boy Olive",
    colors: ["#0F380F", "#306230", "#8BAC0F", "#9BBC0F", "#C4D66A", "#E0F0A0"],
    recommendedDitherStrength: 0.58,
    quantization: {
      ditherAmplitude: 0.1,
      patternScale: 1,
      shadowStart: 0.12,
      shadowEnd: 0.34,
      flatSuppression: 0.82,
      detailBoost: 1.35,
      lightnessBias: 0.035,
      lightnessWeight: 5,
      chromaWeight: 0.55,
    },
  },
  {
    id: "cga-0-high",
    label: "CGA 0 High",
    colors: ["#000000", "#55FF55", "#FF5555", "#FFFF55"],
    recommendedDitherStrength: 0.62,
    quantization: {
      ditherAmplitude: 0.085,
      patternScale: 1,
      shadowStart: 0.18,
      shadowEnd: 0.42,
      flatSuppression: 0.92,
      detailBoost: 1.55,
      lightnessBias: 0.05,
      lightnessWeight: 5.5,
      chromaWeight: 0.42,
    },
  },
  {
    id: "ega-16",
    label: "EGA 16",
    colors: [
      "#000000",
      "#0000AA",
      "#00AA00",
      "#00AAAA",
      "#AA0000",
      "#AA00AA",
      "#AA5500",
      "#AAAAAA",
      "#555555",
      "#5555FF",
      "#55FF55",
      "#55FFFF",
      "#FF5555",
      "#FF55FF",
      "#FFFF55",
      "#FFFFFF",
    ],
    recommendedDitherStrength: 0.52,
    quantization: {
      ditherAmplitude: 0.065,
      patternScale: 1,
      shadowStart: 0.08,
      shadowEnd: 0.26,
      flatSuppression: 0.74,
      detailBoost: 1.25,
      lightnessBias: 0.015,
      lightnessWeight: 4,
      chromaWeight: 0.9,
    },
  },
  {
    id: "commodore-64",
    label: "Commodore 64",
    colors: [
      "#000000",
      "#FFFFFF",
      "#880000",
      "#AAFFEE",
      "#CC44CC",
      "#00CC55",
      "#0000AA",
      "#EEEE77",
      "#DD8855",
      "#664400",
      "#FF7777",
      "#333333",
      "#777777",
      "#AAFF66",
      "#0088FF",
      "#BBBBBB",
    ],
    recommendedDitherStrength: 0.56,
    quantization: {
      ditherAmplitude: 0.075,
      patternScale: 1,
      shadowStart: 0.1,
      shadowEnd: 0.3,
      flatSuppression: 0.8,
      detailBoost: 1.35,
      lightnessBias: 0.025,
      lightnessWeight: 4.6,
      chromaWeight: 0.72,
    },
  },
  {
    id: "pico-8",
    label: "PICO-8",
    colors: [
      "#000000",
      "#1D2B53",
      "#7E2553",
      "#008751",
      "#AB5236",
      "#5F574F",
      "#C2C3C7",
      "#FFF1E8",
      "#FF004D",
      "#FFA300",
      "#FFEC27",
      "#00E436",
      "#29ADFF",
      "#83769C",
      "#FF77A8",
      "#FFCCAA",
    ],
    recommendedDitherStrength: 0.5,
    quantization: {
      ditherAmplitude: 0.06,
      patternScale: 1,
      shadowStart: 0.08,
      shadowEnd: 0.25,
      flatSuppression: 0.78,
      detailBoost: 1.3,
      lightnessBias: 0.018,
      lightnessWeight: 4.2,
      chromaWeight: 0.88,
    },
  },
  {
    id: "zx-spectrum",
    label: "ZX Spectrum",
    colors: [
      "#000000",
      "#0000D7",
      "#D70000",
      "#D700D7",
      "#00D700",
      "#00D7D7",
      "#D7D700",
      "#D7D7D7",
      "#0000FF",
      "#FF0000",
      "#FF00FF",
      "#00FF00",
      "#00FFFF",
      "#FFFF00",
      "#FFFFFF",
    ],
    recommendedDitherStrength: 0.54,
    quantization: {
      ditherAmplitude: 0.07,
      patternScale: 1,
      shadowStart: 0.11,
      shadowEnd: 0.32,
      flatSuppression: 0.86,
      detailBoost: 1.45,
      lightnessBias: 0.028,
      lightnessWeight: 4.8,
      chromaWeight: 0.62,
    },
  },
]);

const PROFILE_BY_ID = new Map(
  PALETTE_POST_EFFECT_PROFILES.map((profile) => [profile.id, profile] as const),
);

export function normalizePalettePostEffectId(value: unknown): PalettePostEffectId {
  return typeof value === "string" && PALETTE_POST_EFFECT_IDS.includes(value as PalettePostEffectId)
    ? (value as PalettePostEffectId)
    : DEFAULT_PALETTE_POST_EFFECT;
}

export function palettePostEffectProfile(id: PalettePostEffectId): PalettePostEffectProfile | null {
  return id === "off" ? null : (PROFILE_BY_ID.get(id) ?? null);
}

export function normalizePaletteDitherStrength(
  value: unknown,
  fallback = DEFAULT_PALETTE_DITHER_STRENGTH,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}
