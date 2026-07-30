import { isBiomeId, listBiomeIdentities, listBiomeIds, type BiomeId } from "./BiomeIdentity";

/** UI accent for biome picker hover/focus and leaderboard stars. */
export const BIOME_HOVER_COLOR: Record<BiomeId, string> = {
  ancient: "#8a96b0",
  molten: "#e07030",
  frost: "#7ec8e8",
  grim: "#8a7088",
  verdant: "#4a9a58",
  ash: "#9a9088",
  iron: "#8a94a0",
  obsidian: "#7a4aaa",
  sunken: "#2f9aaa",
  fungal: "#9a6aba",
  backrooms: "#c4b44a",
};

const LABEL_TO_ID = new Map(
  listBiomeIdentities().map((biome) => [biome.label.toLowerCase(), biome.id] as const),
);

export function biomeIconSrc(id: BiomeId): string {
  return `/assets/ui/biome-icons/${id}.webp`;
}

export function biomeHoverColor(id: BiomeId): string {
  return BIOME_HOVER_COLOR[id];
}

/** Resolve a leaderboard biome label (or id) to a known BiomeId. */
export function biomeIdFromLabel(label: string): BiomeId | null {
  const key = label.trim().toLowerCase();
  if (isBiomeId(key)) return key;
  return LABEL_TO_ID.get(key) ?? null;
}

export function biomeColorFromLabel(label: string): string {
  const id = biomeIdFromLabel(label);
  return id ? BIOME_HOVER_COLOR[id] : "#e3c47d";
}

/**
 * Expand saved biome star counts into ordered glyphs for a single row.
 * Order follows the canonical biome roster; each clear is one star.
 */
export function expandBiomeStars(
  playerStars: Record<string, number>,
): readonly { label: string; color: string; id: BiomeId | null }[] {
  const remaining = { ...playerStars };
  const stars: { label: string; color: string; id: BiomeId | null }[] = [];

  for (const biome of listBiomeIdentities()) {
    const count = Math.max(0, Math.floor(remaining[biome.label] ?? 0));
    delete remaining[biome.label];
    for (let i = 0; i < count; i += 1) {
      stars.push({ label: biome.label, color: BIOME_HOVER_COLOR[biome.id], id: biome.id });
    }
  }

  // Any non-canonical labels still get a gold fallback star each.
  for (const [label, rawCount] of Object.entries(remaining)) {
    const count = Math.max(0, Math.floor(rawCount));
    const color = biomeColorFromLabel(label);
    const id = biomeIdFromLabel(label);
    for (let i = 0; i < count; i += 1) {
      stars.push({ label, color, id });
    }
  }

  return stars;
}

/** CSS custom properties for every biome hover accent. */
export function biomeHoverCssVariables(): string {
  return listBiomeIds()
    .map((id) => `--biome-hover-${id}: ${BIOME_HOVER_COLOR[id]};`)
    .join("\n  ");
}
