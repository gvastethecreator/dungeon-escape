import type { BiomeId } from "../systems/BiomeIdentity";

/** Every campaign biome has a Forge profile; the editor exposes a smaller chip set. */
export type ForgeThemeId = BiomeId;

export type ForgeThemePoolProfile = Readonly<{
  mode: number;
  colA: number;
  colB: number;
  glow: number;
  amount: number;
  pits?: number;
}>;

export type ForgeThemeProfile = Readonly<{
  label: string;
  accent: string;
  bg: number;
  fog: number;
  fogD: number;
  hemi: readonly [number, number, number];
  dir: readonly [number, number];
  floor: number;
  corridor: number;
  wall: number;
  cap: number;
  pillar: number;
  debris: readonly [number, number];
  flame: number;
  flameCore: number;
  torchLight: readonly [number, number, number];
  cloth: number;
  corridorArc: number;
  pools: ForgeThemePoolProfile | null;
  particles: Readonly<{ kind: number; color: number; n: number }>;
  nameA: readonly string[];
  nameB: readonly string[];
  fluorescent?: boolean;
  lakes?: boolean;
  icicles?: boolean;
  graveyards?: boolean;
  bones?: boolean;
  roots?: boolean;
  shafts?: boolean;
}>;

export declare const FORGE_THEME_PROFILES: Readonly<Record<ForgeThemeId, ForgeThemeProfile>>;
