const BIOME_IDENTITY_SOURCE = [
  { id: "ancient", label: "Ancient", forgeSupported: true },
  { id: "molten", label: "Molten", forgeSupported: true },
  { id: "frost", label: "Frost", forgeSupported: true },
  { id: "grim", label: "Grim", forgeSupported: true },
  { id: "verdant", label: "Verdant", forgeSupported: true },
  { id: "ash", label: "Ash", forgeSupported: false },
  { id: "iron", label: "Iron", forgeSupported: false },
  { id: "obsidian", label: "Obsidian", forgeSupported: true },
  { id: "sunken", label: "Sunken", forgeSupported: true },
  { id: "fungal", label: "Fungal", forgeSupported: true },
  { id: "backrooms", label: "Backrooms", forgeSupported: true },
] as const;

export type BiomeIdentity = (typeof BIOME_IDENTITY_SOURCE)[number];
export type BiomeId = BiomeIdentity["id"];

const BIOME_IDENTITIES = Object.freeze(
  BIOME_IDENTITY_SOURCE.map((identity) => Object.freeze(identity)),
) as readonly BiomeIdentity[];
const BIOME_IDS = Object.freeze(BIOME_IDENTITIES.map((identity) => identity.id));
const FORGE_BIOME_IDENTITIES = Object.freeze(
  BIOME_IDENTITIES.filter((identity) => identity.forgeSupported),
);
const FORGE_BIOME_IDS = Object.freeze(FORGE_BIOME_IDENTITIES.map((identity) => identity.id));
const BIOME_BY_ID = new Map<BiomeId, BiomeIdentity>(
  BIOME_IDENTITIES.map((identity) => [identity.id, identity]),
);

export function listBiomeIdentities(): readonly BiomeIdentity[] {
  return BIOME_IDENTITIES;
}

export function listBiomeIds(): readonly BiomeId[] {
  return BIOME_IDS;
}

export function listForgeBiomeIdentities(): readonly BiomeIdentity[] {
  return FORGE_BIOME_IDENTITIES;
}

export function listForgeBiomeIds(): readonly BiomeId[] {
  return FORGE_BIOME_IDS;
}

export function getBiomeIdentity(id: BiomeId): BiomeIdentity {
  return BIOME_BY_ID.get(id)!;
}

export function isBiomeId(raw: string | null | undefined): raw is BiomeId {
  if (!raw) return false;
  return BIOME_BY_ID.has(raw.trim().toLowerCase() as BiomeId);
}

export function parseBiomeId(raw: string | null | undefined): BiomeId | null {
  if (!raw) return null;
  const id = raw.trim().toLowerCase();
  return isBiomeId(id) ? id : null;
}
