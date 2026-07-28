import type { PlayerBiomeStars } from "../leaderboard/contract";
import { listBiomeIds, type BiomeId } from "./BiomeIdentity";

export type BiomeScreenArtKind = "main" | "ending";

export interface BiomeScreenArtSpec {
  id: BiomeId;
  label: string;
  mainSrc: string;
  endingSrc: string;
  palette: string;
  landmark: string;
  signature: string;
}

/**
 * UI art is a separate surface from the first-person world. The visual notes
 * stay beside the paths so a new image cannot lose its biome identity when it
 * is moved between the main and ending screens.
 */
export const BIOME_SCREEN_ART: Readonly<Record<BiomeId, BiomeScreenArtSpec>> = {
  ancient: {
    id: "ancient",
    label: "Ancient",
    mainSrc: "/assets/ui/biome-screens/ancient-main.webp",
    endingSrc: "/assets/ui/biome-screens/ancient-ending.webp",
    palette: "blue-gray limestone, tarnished gold, ember orange",
    landmark: "carved catacomb arches and orbiting rune stones",
    signature: "dust, falling grit, iron cages, bone piles, and small gold rune motes",
  },
  molten: {
    id: "molten",
    label: "Molten",
    mainSrc: "/assets/ui/biome-screens/molten-main.webp",
    endingSrc: "/assets/ui/biome-screens/molten-ending.webp",
    palette: "black basalt, coal red, lava orange, and hot brass",
    landmark: "volcanic hall split by lava seams and a scorched stone arch",
    signature: "rising embers, slag drips, chains, hooks, and heat haze",
  },
  frost: {
    id: "frost",
    label: "Frost",
    mainSrc: "/assets/ui/biome-screens/frost-main.webp",
    endingSrc: "/assets/ui/biome-screens/frost-ending.webp",
    palette: "deep navy stone, pale ice, cyan glow, and cold silver",
    landmark: "frozen cathedral corridor with a fractured ice gate",
    signature: "snow dust, suspended ice shards, melt drips, and blue lantern light",
  },
  grim: {
    id: "grim",
    label: "Grim",
    mainSrc: "/assets/ui/biome-screens/grim-main.webp",
    endingSrc: "/assets/ui/biome-screens/grim-ending.webp",
    palette: "moss black, grave green, dried blood, and dull bone",
    landmark: "ossuary crypt with a high tomb arch and broken grave markers",
    signature: "grave wisps, blood drips, cobwebs, bone heaps, and hanging bone mobiles",
  },
  verdant: {
    id: "verdant",
    label: "Verdant",
    mainSrc: "/assets/ui/biome-screens/verdant-main.webp",
    endingSrc: "/assets/ui/biome-screens/verdant-ending.webp",
    palette: "wet moss, root brown, leaf green, and firefly lime",
    landmark: "collapsed ruin wrapped around a living root gate",
    signature: "vines, pollen, sap drips, moss, and warm green fireflies",
  },
  ash: {
    id: "ash",
    label: "Ash",
    mainSrc: "/assets/ui/biome-screens/ash-main.webp",
    endingSrc: "/assets/ui/biome-screens/ash-ending.webp",
    palette: "charcoal, smoke gray, burnt umber, and buried ember orange",
    landmark: "scorched dungeon nave buried under ash with a blackened escape arch",
    signature: "ashfall, buried embers, falling dirt, cracked masonry, and dead braziers",
  },
  iron: {
    id: "iron",
    label: "Iron",
    mainSrc: "/assets/ui/biome-screens/iron-main.webp",
    endingSrc: "/assets/ui/biome-screens/iron-ending.webp",
    palette: "black iron, rust brown, steel blue, and electric amber",
    landmark: "industrial foundry passage with a heavy iron escape door",
    signature: "cages, hooks, filings, rust water, blue sparks, and orange warning lamps",
  },
  obsidian: {
    id: "obsidian",
    label: "Obsidian",
    mainSrc: "/assets/ui/biome-screens/obsidian-main.webp",
    endingSrc: "/assets/ui/biome-screens/obsidian-ending.webp",
    palette: "near-black glass, violet, magenta, and ember rose",
    landmark: "glossy obsidian cavern with a floating mirror gate",
    signature: "anti-gravity glass splinters, black grit, violet glow, and sharp reflections",
  },
  sunken: {
    id: "sunken",
    label: "Sunken",
    mainSrc: "/assets/ui/biome-screens/sunken-main.webp",
    endingSrc: "/assets/ui/biome-screens/sunken-ending.webp",
    palette: "deep teal water, algae green, wet stone, and pale aqua",
    landmark: "waterlogged ruin corridor opening onto a submerged portal",
    signature: "drizzle, bubbles, ceiling seepage, reflective pools, and drowned roots",
  },
  fungal: {
    id: "fungal",
    label: "Fungal",
    mainSrc: "/assets/ui/biome-screens/fungal-main.webp",
    endingSrc: "/assets/ui/biome-screens/fungal-ending.webp",
    palette: "violet shadow, mushroom teal, spore mint, and wet brown",
    landmark: "cavern shrine beneath giant mushroom caps and a living spore gate",
    signature: "breathing spores, slime drips, roots, glowing caps, and teal-violet pulses",
  },
  backrooms: {
    id: "backrooms",
    label: "Backrooms",
    mainSrc: "/assets/ui/biome-screens/backrooms-main.webp",
    endingSrc: "/assets/ui/biome-screens/backrooms-ending.webp",
    palette: "stained yellow, sickly olive, beige carpet, and black shadow",
    landmark: "endless low-ceiling office maze with a distant fluorescent exit",
    signature: "stale dust, yellow seepage, flickering lights, wet carpet, and wrong angles",
  },
};

export function biomeScreenArt(id: BiomeId): BiomeScreenArtSpec {
  return BIOME_SCREEN_ART[id];
}

export function biomeScreenArtSrc(id: BiomeId, kind: BiomeScreenArtKind): string {
  const art = biomeScreenArt(id);
  return kind === "main" ? art.mainSrc : art.endingSrc;
}

function starCountForLabel(stars: Record<string, number> | undefined, label: string): number {
  if (!stars) return 0;
  const match = Object.entries(stars).find(
    ([key]) => key.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  return match ? Math.max(0, Number(match[1]) || 0) : 0;
}

/**
 * Main art shows the next campaign frontier. A fresh profile starts at
 * Ancient; each saved clear advances the image in canonical biome order.
 * Out-of-order clears still advance to the frontier after the highest clear.
 */
export function mainScreenBiomeForPlayer(
  playerName: string | null | undefined,
  playerBiomeStars: PlayerBiomeStars,
): BiomeId {
  const stars = playerName ? playerBiomeStars[playerName] : undefined;
  let highestCompletedIndex = -1;
  const ids = listBiomeIds();
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]!;
    if (starCountForLabel(stars, BIOME_SCREEN_ART[id].label) > 0) {
      highestCompletedIndex = index;
    }
  }
  return ids[Math.min(highestCompletedIndex + 1, ids.length - 1)]!;
}
