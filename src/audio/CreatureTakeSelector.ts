import {
  CREATURE_TONES,
  creatureBaseTakes,
  creatureToneAsset,
  type AudioAssetId,
  type CreatureRole,
  type CreatureTone,
  type CreatureVoice,
} from "./AudioAssetCatalog";

function isBiomeCreatureTone(value: string): value is Exclude<CreatureTone, "base"> {
  return (CREATURE_TONES as readonly string[]).includes(value);
}

/** Ancient keeps the canonical v0–v2 pool. Every other biome has its own species skin. */
export function creatureToneForMood(moodId: string | null | undefined): CreatureTone {
  const id = (moodId ?? "").trim().toLowerCase();
  return isBiomeCreatureTone(id) ? id : "base";
}

/** Selects weighted creature takes without immediately repeating a prior pick. */
export class CreatureTakeSelector {
  private readonly lastTake = new Map<string, AudioAssetId>();

  select(
    voice: CreatureVoice,
    role: CreatureRole,
    tone: CreatureTone,
    randomUnit: number,
  ): AudioAssetId {
    const pool = [...creatureBaseTakes(voice, role)];
    if (tone !== "base") {
      const themed = creatureToneAsset(voice, role, tone);
      pool.push(themed, themed);
    }

    const key = `${voice}:${role}`;
    const last = this.lastTake.get(key);
    const choices = last ? pool.filter((id) => id !== last) : pool;
    const available = choices.length > 0 ? choices : pool;
    const index = Math.min(
      available.length - 1,
      Math.floor(Math.max(0, randomUnit) * available.length),
    );
    const selected = available[index] ?? pool[0]!;
    this.lastTake.set(key, selected);
    return selected;
  }
}
