import type { DungeonMoodId } from "../systems/DungeonMood";
import type { DungeonDoorStyle } from "./DoorFactory";
import type { HangingKind } from "./AtmospherePropsKit";

export interface BiomeDecorationProfile {
  doorStyle: DungeonDoorStyle;
  curvedArch: boolean;
  hardwareTint: number;
  doorRoughness: number;
  /** Primary hang kind (legacy + weighted default). */
  hangingKind: HangingKind;
  /** Pool of hang kinds mixed per room for ceiling variety. */
  hangingKinds: readonly HangingKind[];
  hangingLength: number;
  hangingDensity: number;
  boneDensity: number;
  boneVariant: number;
  rubbleDensity: number;
  rubbleVariant: number;
  webDensity: number;
  wallDecorDensity: number;
  wallDecorScale: number;
}

function hangingPool(
  primary: HangingKind,
  extras: readonly HangingKind[],
): { hangingKind: HangingKind; hangingKinds: readonly HangingKind[] } {
  return { hangingKind: primary, hangingKinds: [primary, ...extras] };
}

const PROFILES: Record<DungeonMoodId, BiomeDecorationProfile> = {
  ancient: {
    doorStyle: "dungeon",
    curvedArch: true,
    hardwareTint: 0x77746c,
    doorRoughness: 0.9,
    ...hangingPool("chain", ["iron-cage", "oil-lantern", "tattered-banner", "meat-hooks"]),
    hangingLength: 2.5,
    hangingDensity: 1.55,
    boneDensity: 0.72,
    boneVariant: 0,
    rubbleDensity: 0.95,
    rubbleVariant: 0,
    webDensity: 1.15,
    wallDecorDensity: 0.8,
    wallDecorScale: 1,
  },
  molten: {
    doorStyle: "dungeon",
    curvedArch: true,
    hardwareTint: 0x5b4038,
    doorRoughness: 0.74,
    ...hangingPool("chain", ["oil-lantern", "iron-cage", "meat-hooks"]),
    hangingLength: 2.35,
    hangingDensity: 1.25,
    boneDensity: 0.45,
    boneVariant: 2,
    rubbleDensity: 1.25,
    rubbleVariant: 2,
    webDensity: 0.42,
    wallDecorDensity: 0.68,
    wallDecorScale: 1.05,
  },
  frost: {
    doorStyle: "dungeon",
    curvedArch: true,
    hardwareTint: 0x91aab6,
    doorRoughness: 0.66,
    ...hangingPool("chain", ["oil-lantern", "tattered-banner", "iron-cage"]),
    hangingLength: 2.8,
    hangingDensity: 1.15,
    boneDensity: 0.58,
    boneVariant: 1,
    rubbleDensity: 0.78,
    rubbleVariant: 1,
    webDensity: 0.55,
    wallDecorDensity: 0.72,
    wallDecorScale: 1.08,
  },
  grim: {
    doorStyle: "dungeon",
    curvedArch: true,
    hardwareTint: 0x5b5a61,
    doorRoughness: 0.96,
    ...hangingPool("chain", ["bone-mobile", "meat-hooks", "iron-cage", "tattered-banner"]),
    hangingLength: 3,
    hangingDensity: 1.9,
    boneDensity: 1.35,
    boneVariant: 2,
    rubbleDensity: 1.08,
    rubbleVariant: 2,
    webDensity: 1.35,
    wallDecorDensity: 1.1,
    wallDecorScale: 0.94,
  },
  verdant: {
    doorStyle: "dungeon",
    curvedArch: true,
    hardwareTint: 0x50645a,
    doorRoughness: 0.94,
    ...hangingPool("vine", ["root-cluster", "tattered-banner", "oil-lantern"]),
    hangingLength: 3.1,
    hangingDensity: 2.1,
    boneDensity: 0.36,
    boneVariant: 0,
    rubbleDensity: 0.82,
    rubbleVariant: 0,
    webDensity: 1.05,
    wallDecorDensity: 0.86,
    wallDecorScale: 1.08,
  },
  ash: {
    doorStyle: "dungeon",
    curvedArch: true,
    hardwareTint: 0x6f6963,
    doorRoughness: 0.92,
    ...hangingPool("chain", ["oil-lantern", "tattered-banner", "bone-mobile", "iron-cage"]),
    hangingLength: 2.65,
    hangingDensity: 1.6,
    boneDensity: 1.05,
    boneVariant: 1,
    rubbleDensity: 1.12,
    rubbleVariant: 1,
    webDensity: 1.1,
    wallDecorDensity: 0.92,
    wallDecorScale: 1,
  },
  iron: {
    doorStyle: "dungeon",
    curvedArch: true,
    hardwareTint: 0x8a8178,
    doorRoughness: 0.64,
    ...hangingPool("chain", ["iron-cage", "meat-hooks", "oil-lantern", "tattered-banner"]),
    hangingLength: 3.25,
    hangingDensity: 2.25,
    boneDensity: 0.5,
    boneVariant: 0,
    rubbleDensity: 0.9,
    rubbleVariant: 2,
    webDensity: 0.72,
    wallDecorDensity: 0.82,
    wallDecorScale: 1.12,
  },
  obsidian: {
    doorStyle: "dungeon",
    curvedArch: true,
    hardwareTint: 0x76547d,
    doorRoughness: 0.48,
    ...hangingPool("chain", ["oil-lantern", "iron-cage", "bone-mobile"]),
    hangingLength: 2.7,
    hangingDensity: 1.35,
    boneDensity: 0.55,
    boneVariant: 2,
    rubbleDensity: 1.3,
    rubbleVariant: 2,
    webDensity: 0.62,
    wallDecorDensity: 0.9,
    wallDecorScale: 1.06,
  },
  sunken: {
    doorStyle: "dungeon",
    curvedArch: true,
    hardwareTint: 0x4e7775,
    doorRoughness: 0.82,
    ...hangingPool("chain", ["root-cluster", "tattered-banner", "oil-lantern", "iron-cage"]),
    hangingLength: 3.15,
    hangingDensity: 2.0,
    boneDensity: 0.7,
    boneVariant: 1,
    rubbleDensity: 1.18,
    rubbleVariant: 1,
    webDensity: 0.8,
    wallDecorDensity: 1,
    wallDecorScale: 1.04,
  },
  fungal: {
    doorStyle: "dungeon",
    curvedArch: true,
    hardwareTint: 0x795c82,
    doorRoughness: 0.9,
    ...hangingPool("vine", ["root-cluster", "bone-mobile", "tattered-banner"]),
    hangingLength: 3.35,
    hangingDensity: 2.3,
    boneDensity: 0.42,
    boneVariant: 0,
    rubbleDensity: 0.76,
    rubbleVariant: 0,
    webDensity: 1.28,
    wallDecorDensity: 1.08,
    wallDecorScale: 1.14,
  },
  backrooms: {
    doorStyle: "office",
    curvedArch: false,
    hardwareTint: 0x6f6a55,
    doorRoughness: 0.88,
    ...hangingPool("oil-lantern", ["chain", "tattered-banner"]),
    hangingLength: 2.2,
    hangingDensity: 0.95,
    boneDensity: 0.25,
    boneVariant: 1,
    rubbleDensity: 0.48,
    rubbleVariant: 0,
    webDensity: 0.7,
    wallDecorDensity: 1.6,
    wallDecorScale: 1.18,
  },
};

export function getBiomeDecorationProfile(mood: DungeonMoodId): BiomeDecorationProfile {
  return PROFILES[mood];
}
