import {
  normalizePaletteDitherStrength,
  normalizePalettePostEffectId,
  type PalettePostEffectId,
} from "./PalettePostEffect";

export const DISPLAY_POST_FX_TUNING_KEY = "dungeon-escape:display-post-fx-lab-v1";

export type DisplayPaletteStage = "world" | "final";

export interface DisplayPostFxTuning {
  readonly paletteStage: DisplayPaletteStage;
  readonly paletteDitherScale: number;
  readonly paletteShadowGuard: number;
  readonly paletteFlatGuard: number;
  readonly paletteDetailBoost: number;
  readonly paletteLightnessBias: number;
  readonly halation: number;
  readonly persistence: number;
  readonly scanlines: number;
  readonly phosphorMask: number;
  readonly brightness: number;
  readonly curvatureScale: number;
  readonly grainScale: number;
}

export interface DisplayPostFxPreset {
  readonly id: string;
  readonly label: string;
  readonly paletteEffect: PalettePostEffectId;
  readonly paletteDitherStrength: number;
  readonly tuning: DisplayPostFxTuning;
}

export const DEFAULT_DISPLAY_POST_FX_TUNING: DisplayPostFxTuning = Object.freeze({
  paletteStage: "final",
  paletteDitherScale: 1,
  paletteShadowGuard: 1,
  paletteFlatGuard: 1,
  paletteDetailBoost: 1,
  paletteLightnessBias: 0,
  halation: 0.16,
  persistence: 0.16,
  scanlines: 0.38,
  phosphorMask: 0.26,
  brightness: 1.035,
  curvatureScale: 1,
  grainScale: 1,
});

export const DISPLAY_POST_FX_PRESETS: readonly DisplayPostFxPreset[] = Object.freeze([
  {
    id: "balanced",
    label: "Balanced CRT",
    paletteEffect: "off",
    paletteDitherStrength: 0.72,
    tuning: DEFAULT_DISPLAY_POST_FX_TUNING,
  },
  {
    id: "clean",
    label: "Clean CRT",
    paletteEffect: "off",
    paletteDitherStrength: 0.4,
    tuning: {
      paletteStage: "final",
      paletteDitherScale: 0.7,
      paletteShadowGuard: 1.15,
      paletteFlatGuard: 1.15,
      paletteDetailBoost: 0.9,
      paletteLightnessBias: 0,
      halation: 0.1,
      persistence: 0.08,
      scanlines: 0.18,
      phosphorMask: 0.12,
      brightness: 1.02,
      curvatureScale: 0.75,
      grainScale: 0.45,
    },
  },
  {
    id: "pico-arcade",
    label: "PICO Arcade",
    paletteEffect: "pico-8",
    paletteDitherStrength: 0.76,
    tuning: {
      paletteStage: "world",
      paletteDitherScale: 0.95,
      paletteShadowGuard: 1.05,
      paletteFlatGuard: 1.05,
      paletteDetailBoost: 1.15,
      paletteLightnessBias: 0.01,
      halation: 0.14,
      persistence: 0.1,
      scanlines: 0.5,
      phosphorMask: 0.35,
      brightness: 1.04,
      curvatureScale: 1,
      grainScale: 0.6,
    },
  },
  {
    id: "c64-tube",
    label: "C64 Tube",
    paletteEffect: "commodore-64",
    paletteDitherStrength: 0.82,
    tuning: {
      paletteStage: "world",
      paletteDitherScale: 1.05,
      paletteShadowGuard: 1.05,
      paletteFlatGuard: 1.05,
      paletteDetailBoost: 1.1,
      paletteLightnessBias: 0.005,
      halation: 0.2,
      persistence: 0.18,
      scanlines: 0.56,
      phosphorMask: 0.4,
      brightness: 1.055,
      curvatureScale: 1.05,
      grainScale: 1.1,
    },
  },
  {
    id: "game-boy-tube",
    label: "Game Boy Tube",
    paletteEffect: "game-boy-olive",
    paletteDitherStrength: 0.64,
    tuning: {
      paletteStage: "world",
      paletteDitherScale: 0.9,
      paletteShadowGuard: 1.1,
      paletteFlatGuard: 1.1,
      paletteDetailBoost: 1.1,
      paletteLightnessBias: 0.015,
      halation: 0.12,
      persistence: 0.2,
      scanlines: 0.45,
      phosphorMask: 0.18,
      brightness: 1.03,
      curvatureScale: 0.85,
      grainScale: 0.65,
    },
  },
  {
    id: "cga-hard",
    label: "Hard CGA",
    paletteEffect: "cga-0-high",
    paletteDitherStrength: 0.88,
    tuning: {
      paletteStage: "final",
      paletteDitherScale: 0.8,
      paletteShadowGuard: 1.2,
      paletteFlatGuard: 1.2,
      paletteDetailBoost: 1.25,
      paletteLightnessBias: 0.02,
      halation: 0.08,
      persistence: 0.05,
      scanlines: 0.28,
      phosphorMask: 0.1,
      brightness: 1.015,
      curvatureScale: 0.75,
      grainScale: 0.35,
    },
  },
  {
    id: "ega-monitor",
    label: "EGA Monitor",
    paletteEffect: "ega-16",
    paletteDitherStrength: 0.5,
    tuning: {
      paletteStage: "world",
      paletteDitherScale: 0.85,
      paletteShadowGuard: 1,
      paletteFlatGuard: 1.05,
      paletteDetailBoost: 1.15,
      paletteLightnessBias: 0.005,
      halation: 0.12,
      persistence: 0.1,
      scanlines: 0.36,
      phosphorMask: 0.22,
      brightness: 1.025,
      curvatureScale: 0.9,
      grainScale: 0.5,
    },
  },
  {
    id: "zx-crisp",
    label: "ZX Crisp",
    paletteEffect: "zx-spectrum",
    paletteDitherStrength: 0.52,
    tuning: {
      paletteStage: "final",
      paletteDitherScale: 0.82,
      paletteShadowGuard: 1.1,
      paletteFlatGuard: 1.15,
      paletteDetailBoost: 1.2,
      paletteLightnessBias: 0.01,
      halation: 0.08,
      persistence: 0.06,
      scanlines: 0.3,
      phosphorMask: 0.14,
      brightness: 1.02,
      curvatureScale: 0.8,
      grainScale: 0.38,
    },
  },
]);

const PRESET_BY_ID = new Map(DISPLAY_POST_FX_PRESETS.map((preset) => [preset.id, preset] as const));

function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

export function normalizeDisplayPostFxTuning(value: unknown): DisplayPostFxTuning {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    paletteStage: candidate.paletteStage === "world" ? "world" : "final",
    paletteDitherScale: bounded(
      candidate.paletteDitherScale,
      DEFAULT_DISPLAY_POST_FX_TUNING.paletteDitherScale,
      0.25,
      2,
    ),
    paletteShadowGuard: bounded(
      candidate.paletteShadowGuard,
      DEFAULT_DISPLAY_POST_FX_TUNING.paletteShadowGuard,
      0,
      1.5,
    ),
    paletteFlatGuard: bounded(
      candidate.paletteFlatGuard,
      DEFAULT_DISPLAY_POST_FX_TUNING.paletteFlatGuard,
      0,
      1.5,
    ),
    paletteDetailBoost: bounded(
      candidate.paletteDetailBoost,
      DEFAULT_DISPLAY_POST_FX_TUNING.paletteDetailBoost,
      0.5,
      2,
    ),
    paletteLightnessBias: bounded(
      candidate.paletteLightnessBias,
      DEFAULT_DISPLAY_POST_FX_TUNING.paletteLightnessBias,
      -0.1,
      0.1,
    ),
    halation: bounded(candidate.halation, DEFAULT_DISPLAY_POST_FX_TUNING.halation, 0, 0.35),
    persistence: bounded(
      candidate.persistence,
      DEFAULT_DISPLAY_POST_FX_TUNING.persistence,
      0,
      0.35,
    ),
    scanlines: bounded(candidate.scanlines, DEFAULT_DISPLAY_POST_FX_TUNING.scanlines, 0, 1),
    phosphorMask: bounded(
      candidate.phosphorMask,
      DEFAULT_DISPLAY_POST_FX_TUNING.phosphorMask,
      0,
      1,
    ),
    brightness: bounded(candidate.brightness, DEFAULT_DISPLAY_POST_FX_TUNING.brightness, 0.9, 1.15),
    curvatureScale: bounded(
      candidate.curvatureScale,
      DEFAULT_DISPLAY_POST_FX_TUNING.curvatureScale,
      0,
      2,
    ),
    grainScale: bounded(candidate.grainScale, DEFAULT_DISPLAY_POST_FX_TUNING.grainScale, 0, 2),
  };
}

export function displayPostFxPreset(id: string): DisplayPostFxPreset | null {
  return PRESET_BY_ID.get(id) ?? null;
}

type DisplayTuningStorage = Pick<Storage, "getItem" | "setItem">;

export function readDisplayPostFxTuning(
  storage: DisplayTuningStorage = localStorage,
): DisplayPostFxTuning {
  try {
    const raw = storage.getItem(DISPLAY_POST_FX_TUNING_KEY);
    return raw
      ? normalizeDisplayPostFxTuning(JSON.parse(raw))
      : { ...DEFAULT_DISPLAY_POST_FX_TUNING };
  } catch {
    return { ...DEFAULT_DISPLAY_POST_FX_TUNING };
  }
}

export function writeDisplayPostFxTuning(
  tuning: DisplayPostFxTuning,
  storage: DisplayTuningStorage = localStorage,
): boolean {
  try {
    storage.setItem(
      DISPLAY_POST_FX_TUNING_KEY,
      JSON.stringify(normalizeDisplayPostFxTuning(tuning)),
    );
    return true;
  } catch {
    return false;
  }
}

export function normalizeDisplayPostFxPresetSnapshot(value: unknown): {
  paletteEffect: PalettePostEffectId;
  paletteDitherStrength: number;
  tuning: DisplayPostFxTuning;
} {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    paletteEffect: normalizePalettePostEffectId(candidate.paletteEffect),
    paletteDitherStrength: normalizePaletteDitherStrength(candidate.paletteDitherStrength),
    tuning: normalizeDisplayPostFxTuning(candidate.tuning),
  };
}
