export const DISPLAY_POST_FX_TUNING_KEY = "dungeon-escape:crt-lab-v1";

export interface DisplayPostFxTuning {
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
  readonly tuning: DisplayPostFxTuning;
}

export const DEFAULT_DISPLAY_POST_FX_TUNING: DisplayPostFxTuning = Object.freeze({
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
    tuning: DEFAULT_DISPLAY_POST_FX_TUNING,
  },
  {
    id: "clean",
    label: "Clean CRT",
    tuning: {
      halation: 0.1,
      persistence: 0.08,
      scanlines: 0.18,
      phosphorMask: 0.12,
      brightness: 1.02,
      curvatureScale: 0.75,
      grainScale: 0.45,
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
