export interface EditorLightingProfile {
  /** Multiplier applied to lit Forge albedo so dark texture packs keep detail. */
  surfaceGain: number;
  /** Small static fill; it lifts shadow faces without adding per-cell lights. */
  ambientGain: number;
  /** Directional-key response for the Forge preview. */
  keyGain: number;
  /** Final Forge exposure used by the preview renderer. */
  exposure: number;
  /** Biome finish response for shared Forge materials. */
  floorRoughness: number;
  wallRoughness: number;
  trimRoughness: number;
  trimMetalness: number;
  /** 2D map texture treatment and structural edge strength. */
  mapBrightness: number;
  mapContrast: number;
  mapSaturation: number;
  mapAmbientOpacity: number;
  mapEdgeOpacity: number;
  mapGlowOpacity: number;
  /** Lower fog keeps distant rooms from collapsing into the background. */
  fogScale: number;
}

const PROFILE_DATA: Record<string, EditorLightingProfile> = {
  ancient: {
    surfaceGain: 2.15,
    ambientGain: 0.12,
    keyGain: 1.06,
    exposure: 1.18,
    floorRoughness: 0.91,
    wallRoughness: 0.93,
    trimRoughness: 0.78,
    trimMetalness: 0.52,
    mapBrightness: 1.26,
    mapContrast: 1.08,
    mapSaturation: 1.02,
    mapAmbientOpacity: 0.1,
    mapEdgeOpacity: 0.22,
    mapGlowOpacity: 0.42,
    fogScale: 0.9,
  },
  molten: {
    surfaceGain: 2.3,
    ambientGain: 0.14,
    keyGain: 1.1,
    exposure: 1.2,
    floorRoughness: 0.84,
    wallRoughness: 0.87,
    trimRoughness: 0.82,
    trimMetalness: 0.48,
    mapBrightness: 1.34,
    mapContrast: 1.1,
    mapSaturation: 1.08,
    mapAmbientOpacity: 0.11,
    mapEdgeOpacity: 0.23,
    mapGlowOpacity: 0.5,
    fogScale: 0.86,
  },
  frost: {
    surfaceGain: 1.38,
    ambientGain: 0.08,
    keyGain: 0.9,
    exposure: 1.1,
    floorRoughness: 0.72,
    wallRoughness: 0.79,
    trimRoughness: 0.84,
    trimMetalness: 0.34,
    mapBrightness: 1.06,
    mapContrast: 1.06,
    mapSaturation: 1.02,
    mapAmbientOpacity: 0.07,
    mapEdgeOpacity: 0.18,
    mapGlowOpacity: 0.34,
    fogScale: 0.94,
  },
  grim: {
    surfaceGain: 2.15,
    ambientGain: 0.12,
    keyGain: 1.04,
    exposure: 1.17,
    floorRoughness: 0.95,
    wallRoughness: 0.95,
    trimRoughness: 0.9,
    trimMetalness: 0.24,
    mapBrightness: 1.3,
    mapContrast: 1.08,
    mapSaturation: 1.03,
    mapAmbientOpacity: 0.1,
    mapEdgeOpacity: 0.22,
    mapGlowOpacity: 0.4,
    fogScale: 0.9,
  },
  verdant: {
    surfaceGain: 2.05,
    ambientGain: 0.13,
    keyGain: 1.04,
    exposure: 1.17,
    floorRoughness: 0.93,
    wallRoughness: 0.95,
    trimRoughness: 0.9,
    trimMetalness: 0.2,
    mapBrightness: 1.28,
    mapContrast: 1.08,
    mapSaturation: 1.06,
    mapAmbientOpacity: 0.1,
    mapEdgeOpacity: 0.21,
    mapGlowOpacity: 0.42,
    fogScale: 0.9,
  },
  ash: {
    surfaceGain: 2.1,
    ambientGain: 0.12,
    keyGain: 1.05,
    exposure: 1.17,
    floorRoughness: 0.91,
    wallRoughness: 0.93,
    trimRoughness: 0.8,
    trimMetalness: 0.5,
    mapBrightness: 1.28,
    mapContrast: 1.08,
    mapSaturation: 1.02,
    mapAmbientOpacity: 0.1,
    mapEdgeOpacity: 0.22,
    mapGlowOpacity: 0.42,
    fogScale: 0.9,
  },
  iron: {
    surfaceGain: 2.0,
    ambientGain: 0.13,
    keyGain: 1.05,
    exposure: 1.17,
    floorRoughness: 0.86,
    wallRoughness: 0.85,
    trimRoughness: 0.74,
    trimMetalness: 0.64,
    mapBrightness: 1.25,
    mapContrast: 1.1,
    mapSaturation: 1,
    mapAmbientOpacity: 0.1,
    mapEdgeOpacity: 0.24,
    mapGlowOpacity: 0.4,
    fogScale: 0.9,
  },
  obsidian: {
    surfaceGain: 3.55,
    ambientGain: 0.2,
    keyGain: 1.16,
    exposure: 1.27,
    floorRoughness: 0.7,
    wallRoughness: 0.74,
    trimRoughness: 0.62,
    trimMetalness: 0.68,
    mapBrightness: 1.72,
    mapContrast: 1.16,
    mapSaturation: 1.08,
    mapAmbientOpacity: 0.16,
    mapEdgeOpacity: 0.3,
    mapGlowOpacity: 0.56,
    fogScale: 0.8,
  },
  sunken: {
    surfaceGain: 2.85,
    ambientGain: 0.17,
    keyGain: 1.12,
    exposure: 1.24,
    floorRoughness: 0.88,
    wallRoughness: 0.9,
    trimRoughness: 0.84,
    trimMetalness: 0.34,
    mapBrightness: 1.55,
    mapContrast: 1.12,
    mapSaturation: 1.08,
    mapAmbientOpacity: 0.14,
    mapEdgeOpacity: 0.27,
    mapGlowOpacity: 0.5,
    fogScale: 0.82,
  },
  fungal: {
    surfaceGain: 2.55,
    ambientGain: 0.18,
    keyGain: 1.1,
    exposure: 1.23,
    floorRoughness: 0.95,
    wallRoughness: 0.94,
    trimRoughness: 0.88,
    trimMetalness: 0.22,
    mapBrightness: 1.48,
    mapContrast: 1.1,
    mapSaturation: 1.1,
    mapAmbientOpacity: 0.14,
    mapEdgeOpacity: 0.25,
    mapGlowOpacity: 0.5,
    fogScale: 0.84,
  },
  backrooms: {
    surfaceGain: 1.82,
    ambientGain: 0.15,
    keyGain: 1.04,
    exposure: 1.16,
    floorRoughness: 0.87,
    wallRoughness: 0.89,
    trimRoughness: 0.76,
    trimMetalness: 0.46,
    mapBrightness: 1.24,
    mapContrast: 1.08,
    mapSaturation: 0.96,
    mapAmbientOpacity: 0.1,
    mapEdgeOpacity: 0.2,
    mapGlowOpacity: 0.38,
    fogScale: 0.9,
  },
};

const FALLBACK_PROFILE = PROFILE_DATA.ash;

export function resolveEditorLightingProfile(themeKey: string): EditorLightingProfile {
  return PROFILE_DATA[themeKey] ?? FALLBACK_PROFILE;
}

export const EDITOR_LIGHTING_THEME_KEYS = Object.freeze(Object.keys(PROFILE_DATA));
