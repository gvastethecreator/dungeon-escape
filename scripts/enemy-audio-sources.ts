/**
 * Personal-library sources for enemy presence/attack takes.
 * F = F:\# AUDIO\# SAMPLES\#SFX
 * G = G:\#SAMPLES\# SFX
 *
 * Ancient uses v0–v2 (canonical species). Every other biome gets its own
 * visual-subspecies skin so a frost mantis never growls like a goblin.
 */
export interface EnemyAudioSource {
  readonly name: string;
  readonly root: "F" | "G";
  readonly source: string;
  readonly duration: number;
  readonly targetLufs: number;
  readonly bitrate: string;
  readonly start: number;
  readonly channels: 1;
}

export const LIBRARY_ROOTS = {
  F: "F:\\# AUDIO\\# SAMPLES\\#SFX",
  G: "G:\\#SAMPLES\\# SFX",
} as const;

export function resolveEnemyAudioPath(asset: EnemyAudioSource): string {
  return `${LIBRARY_ROOTS[asset.root]}\\${asset.source}`;
}

export function enemyAudioEncodeKey(asset: EnemyAudioSource): string {
  return `${asset.root}|${asset.source}|${asset.start}|${asset.duration}|${asset.targetLufs}|${asset.bitrate}`;
}

const ES = "Horror\\EpicStockMediaHumanoidCreatures4\\OneShot\\Designed";
const HC3 = "Epic Stock Media Humanoid Creatures 3";
const TF = "Triune Films Monster SFX";
const AN = "Animals\\EvilbananaMegaAnimalPack";
const FR = "Horror\\FriendlyCreaturesSoundFxPack";
const BH = "Horror\\BodyHorrorSoundFxPack";
const MC = "Horror\\MonstersAndCreatures\\Monsters&Creatures";
const CD = "Horror\\CreaturesDesigned";

function clip(
  name: string,
  root: "F" | "G",
  source: string,
  duration: number,
  targetLufs: number,
  bitrate = "48k",
): EnemyAudioSource {
  return {
    name,
    root,
    source,
    duration,
    targetLufs,
    bitrate,
    start: 0,
    channels: 1,
  };
}

function f(name: string, source: string, duration: number, targetLufs: number, bitrate = "48k") {
  return clip(name, "F", source, duration, targetLufs, bitrate);
}

function g(name: string, source: string, duration: number, targetLufs: number, bitrate = "48k") {
  return clip(name, "G", source, duration, targetLufs, bitrate);
}

function es(folder: string, file: string) {
  return `${ES}\\${folder}\\${file}`;
}

function hc3(folder: string, file: string) {
  return `${HC3}\\${folder}\\${file}`;
}

function tf(folder: string, file: string) {
  return `${TF}\\${folder}\\${file}`;
}

function skin(
  kind: string,
  biome: string,
  voice: EnemyAudioSource,
  attack: EnemyAudioSource,
): EnemyAudioSource[] {
  return [
    { ...voice, name: `enemy-${kind}-${biome}` },
    { ...attack, name: `enemy-${kind}-attack-${biome}` },
  ];
}

export const ENEMY_AUDIO_SOURCES: readonly EnemyAudioSource[] = [
  f(
    "enemy-growl",
    es("Zombie", "ESM_HC4_Cinematic_FX_zombie_undead_alert_noticed_energy_groan_01.wav"),
    1.65,
    -20,
  ),
  f(
    "enemy-attack",
    es("Specter", "ESM_HC4_Cinematic_FX_specter_ghost_attack_quick_hit_01.wav"),
    1.7,
    -18,
  ),

  // ===== carrion: scavenger hyena, never the stalker's wolf =====
  f("enemy-carrion-v0", `${AN}\\Hyena\\SFX_CRE_HYENA_AGGRO_001.ogg`, 1.35, -22, "40k"),
  f("enemy-carrion-v1", `${AN}\\Hyena\\SFX_CRE_HYENA_AGGRO_002.ogg`, 1.35, -22, "40k"),
  f("enemy-carrion-v2", `${AN}\\Hyena\\SFX_CRE_HYENA_AGGRO_LAUGH_001.ogg`, 1.4, -22, "40k"),
  f("enemy-carrion-attack-v0", `${AN}\\Hyena\\SFX_CRE_HYENA_ATTACK_001.ogg`, 1.15, -18, "40k"),
  f("enemy-carrion-attack-v1", `${AN}\\Hyena\\SFX_CRE_HYENA_ATTACK_002.ogg`, 1.15, -18, "40k"),
  f("enemy-carrion-attack-v2", `${AN}\\Hyena\\SFX_CRE_HYENA_ATTACK_003.ogg`, 1.15, -18, "40k"),
  ...skin(
    "carrion",
    "frost",
    g(
      "",
      hc3("Crabman", "ESM_HC3_cinematic_fx_voice_crabman_alert_mournful_scream_screech.wav"),
      1.7,
      -21,
    ),
    g("", hc3("Crabman", "ESM_HC3_cinematic_fx_voice_crabman_attack_claw.wav"), 1.15, -18),
  ),
  ...skin(
    "carrion",
    "molten",
    g("", hc3("Hellboar", "ESM_HC3_cinematic_fx_voice_hellboar_alert_throaty_growl.wav"), 1.7, -20),
    g("", hc3("Hellboar", "ESM_HC3_cinematic_fx_voice_hellboar_attack_aggressive.wav"), 1.35, -17),
  ),
  ...skin(
    "carrion",
    "grim",
    f(
      "",
      es("Ghoul", "ESM_HC4_Cinematic_FX_ghoul_undead_alert_aggressive_notice_01.wav"),
      1.7,
      -20,
    ),
    f("", es("Ghoul", "ESM_HC4_Cinematic_FX_ghoul_undead_attack_hit_01.wav"), 1.15, -18),
  ),
  ...skin(
    "carrion",
    "verdant",
    f("", `${FR}\\EarthFriend\\Earth Friend Martial Angry A.wav`, 1.45, -21),
    f("", `${FR}\\EarthFriend\\Earth Friend Martial Effort A.wav`, 1.1, -18),
  ),
  ...skin(
    "carrion",
    "ash",
    g(
      "",
      hc3("Hellboar", "ESM_HC3_cinematic_fx_voice_hellboar_alert_moaning_growl_threat.wav"),
      1.7,
      -20,
    ),
    g("", hc3("Hellboar", "ESM_HC3_cinematic_fx_voice_hellboar_attack_swing.wav"), 1.3, -17),
  ),
  ...skin(
    "carrion",
    "iron",
    f("", `${BH}\\Mechanicals\\Mechanical Abomination A.wav`, 1.6, -20),
    f("", `${BH}\\Mechanicals\\Mechanical Abomination B.wav`, 1.35, -18),
  ),
  ...skin(
    "carrion",
    "obsidian",
    f("", es("Draconid", "ESM_HC4_Cinematic_FX_draconid_creature_alert_01.wav"), 1.7, -20),
    f("", es("Draconid", "ESM_HC4_Cinematic_FX_draconid_creature_attack_01.wav"), 1.35, -17),
  ),
  ...skin(
    "carrion",
    "sunken",
    f(
      "",
      es("SeaBeast", "ESM_HC4_Cinematic_FX_sea_beast_creature_alert_yell_aggro_charge_01.wav"),
      1.75,
      -20,
    ),
    f(
      "",
      es("SeaBeast", "ESM_HC4_Cinematic_FX_sea_beast_creature_attack_bite_slash_quick_01.wav"),
      1.15,
      -17,
    ),
  ),
  ...skin(
    "carrion",
    "fungal",
    g(
      "",
      hc3("Mutant_Growth", "ESM_HC3_cinematic_fx_voice_mutant_growth_alert_creepy_howl.wav"),
      1.8,
      -21,
    ),
    g(
      "",
      hc3("Mutant_Growth", "ESM_HC3_cinematic_fx_voice_mutant_growth_attack_slimey_wet_gross.wav"),
      1.4,
      -18,
    ),
  ),
  ...skin(
    "carrion",
    "backrooms",
    g(
      "",
      hc3("Psycho", "ESM_HC3_cinematic_fx_voice_psycho_alert_crazy_laugh_insane.wav"),
      1.7,
      -21,
    ),
    g("", hc3("Psycho", "ESM_HC3_cinematic_fx_voice_psycho_attack_attack.wav"), 1.2, -18),
  ),

  // ===== goblin: throaty humanoid; frost becomes insect =====
  f(
    "enemy-goblin-v0",
    es("Goblin", "ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_01.wav"),
    1.95,
    -21,
  ),
  f(
    "enemy-goblin-v1",
    es("Goblin", "ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_02.wav"),
    1.95,
    -21,
  ),
  f(
    "enemy-goblin-v2",
    es("Goblin", "ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_03.wav"),
    1.95,
    -21,
  ),
  f(
    "enemy-goblin-attack-v0",
    es("Goblin", "ESM_HC4_Cinematic_FX_goblin_creature_attack_swing_effort_powerful_01.wav"),
    1.0,
    -18,
  ),
  f(
    "enemy-goblin-attack-v1",
    es("Goblin", "ESM_HC4_Cinematic_FX_goblin_creature_attack_swing_effort_powerful_02.wav"),
    0.95,
    -18,
  ),
  f(
    "enemy-goblin-attack-v2",
    es("Goblin", "ESM_HC4_Cinematic_FX_goblin_creature_attack_swing_effort_powerful_03.wav"),
    0.9,
    -18,
  ),
  ...skin(
    "goblin",
    "frost",
    g("", tf("TF22V 304- Insect", "Monsters_Insect_1.wav"), 1.5, -22),
    g("", tf("TF22V 304- Insect", "Monsters_Insect_2.wav"), 1.15, -19),
  ),
  ...skin(
    "goblin",
    "molten",
    f("", `${FR}\\FireFriend\\Fire Friend Martial Angry A.wav`, 1.5, -21),
    f("", `${FR}\\FireFriend\\Fire Friend Martial Effort A.wav`, 1.1, -18),
  ),
  ...skin(
    "goblin",
    "grim",
    f(
      "",
      es("Goblin", "ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_04.wav"),
      1.9,
      -21,
    ),
    f(
      "",
      es("Goblin", "ESM_HC4_Cinematic_FX_goblin_creature_attack_steady_growl_01.wav"),
      1.2,
      -18,
    ),
  ),
  ...skin(
    "goblin",
    "verdant",
    f("", `${FR}\\NatureFriend\\Nature Friend Martial Angry A.wav`, 1.5, -21),
    f("", `${FR}\\NatureFriend\\Nature Friend Martial Effort A.wav`, 1.1, -18),
  ),
  ...skin(
    "goblin",
    "ash",
    f(
      "",
      es("Goblin", "ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_05.wav"),
      1.9,
      -21,
    ),
    f(
      "",
      es("Goblin", "ESM_HC4_Cinematic_FX_goblin_creature_attack_swing_effort_powerful_04.wav"),
      0.95,
      -18,
    ),
  ),
  ...skin(
    "goblin",
    "iron",
    f("", `${BH}\\Mechanicals\\Mechanical Abomination C.wav`, 1.55, -20),
    f("", `${BH}\\Mechanicals\\Intrusive Probe A.wav`, 1.2, -18),
  ),
  ...skin(
    "goblin",
    "obsidian",
    f("", `${FR}\\DarkFriend\\Dark Friend Martial Angry A.wav`, 1.5, -21),
    f("", `${FR}\\DarkFriend\\Dark Friend Martial Effort A.wav`, 1.1, -18),
  ),
  ...skin(
    "goblin",
    "sunken",
    f("", es("Naga", "ESM_HC4_Cinematic_FX_naga_creature_alert_idle_warning_01.wav"), 1.7, -21),
    f("", es("Naga", "ESM_HC4_Cinematic_FX_naga_creature_attack_attack_01.wav"), 1.2, -18),
  ),
  ...skin(
    "goblin",
    "fungal",
    f("", `${FR}\\NatureFriend\\Nature Friend Mage Angry A.wav`, 1.55, -21),
    f("", `${FR}\\NatureFriend\\Nature Friend Mage Effort A.wav`, 1.15, -18),
  ),
  ...skin(
    "goblin",
    "backrooms",
    g(
      "",
      hc3("Psycho", "ESM_HC3_cinematic_fx_voice_psycho_alert_deranged_laugh_breathy.wav"),
      1.7,
      -21,
    ),
    g("", hc3("Psycho", "ESM_HC3_cinematic_fx_voice_psycho_attack_swing.wav"), 1.15, -18),
  ),

  // ===== ghost: specter; frost colony / molten lava / backrooms psycho =====
  f(
    "enemy-ghost-v0",
    es("Specter", "ESM_HC4_Cinematic_FX_specter_ghost_alert_scream_summon_01.wav"),
    2.05,
    -22,
  ),
  f(
    "enemy-ghost-v1",
    es("Specter", "ESM_HC4_Cinematic_FX_specter_ghost_alert_scream_summon_02.wav"),
    2.05,
    -22,
  ),
  f(
    "enemy-ghost-v2",
    es("Specter", "ESM_HC4_Cinematic_FX_specter_ghost_alert_scream_summon_03.wav"),
    2.05,
    -22,
  ),
  f(
    "enemy-ghost-attack-v0",
    es("Specter", "ESM_HC4_Cinematic_FX_specter_ghost_attack_aggressive_screech_01.wav"),
    1.65,
    -18,
  ),
  f(
    "enemy-ghost-attack-v1",
    es("Specter", "ESM_HC4_Cinematic_FX_specter_ghost_attack_aggressive_screech_02.wav"),
    1.65,
    -18,
  ),
  f(
    "enemy-ghost-attack-v2",
    es("Specter", "ESM_HC4_Cinematic_FX_specter_ghost_attack_aggressive_screech_03.wav"),
    1.65,
    -18,
  ),
  ...skin(
    "ghost",
    "frost",
    g("", tf("TF22V 310- Swarm", "Monsters_Swarm_Hover_ 1.wav"), 1.8, -23),
    g("", tf("TF22V 310- Swarm", "Monsters_Swarm_Passby_Fast_ 1.wav"), 1.2, -19),
  ),
  ...skin(
    "ghost",
    "molten",
    g(
      "",
      hc3("Lava_Monster", "ESM_HC3_cinematic_fx_voice_lava_monster_alert_gurgling_roar.wav"),
      1.85,
      -21,
    ),
    g(
      "",
      hc3("Lava_Monster", "ESM_HC3_cinematic_fx_voice_lava_monster_attack_gurgling.wav"),
      1.4,
      -18,
    ),
  ),
  ...skin(
    "ghost",
    "grim",
    g("", tf("TF22V 301- Banshee", "Monsters_Banshee_Breath_1.wav"), 1.8, -23),
    g("", tf("TF22V 301- Banshee", "Monsters_Banshee_Shriek_1.wav"), 1.35, -18),
  ),
  ...skin(
    "ghost",
    "verdant",
    f("", `${FR}\\NatureFriend\\Nature Friend Mage Surprise A.wav`, 1.6, -22),
    f("", `${FR}\\NatureFriend\\Nature Friend Mage Effort B.wav`, 1.15, -18),
  ),
  ...skin(
    "ghost",
    "ash",
    f("", es("Specter", "ESM_HC4_Cinematic_FX_specter_ghost_alert_scream_summon_04.wav"), 2.0, -22),
    f(
      "",
      es("Specter", "ESM_HC4_Cinematic_FX_specter_ghost_attack_aggressive_screech_04.wav"),
      1.65,
      -18,
    ),
  ),
  ...skin(
    "ghost",
    "iron",
    f("", `${BH}\\Mechanicals\\Long Nasty Shock.wav`, 1.7, -21),
    f("", `${BH}\\Mechanicals\\Electro Shock Therapy.wav`, 1.3, -18),
  ),
  ...skin(
    "ghost",
    "obsidian",
    g("", hc3("Void_Beast", "ESM_HC3_cinematic_fx_voice_void_beast_alert_low_growl.wav"), 1.8, -21),
    g(
      "",
      hc3("Void_Beast", "ESM_HC3_cinematic_fx_voice_void_beast_attack_big_roar.wav"),
      1.45,
      -18,
    ),
  ),
  ...skin(
    "ghost",
    "sunken",
    g("", tf("TF22V 305- Leviathan", "Monsters_Leviathan_Hiss_1.wav"), 1.7, -22),
    g("", tf("TF22V 305- Leviathan", "Monsters_Leviathan_Roar_1.wav"), 1.45, -18),
  ),
  ...skin(
    "ghost",
    "fungal",
    g("", tf("TF22V 310- Swarm", "Monsters_Swarm_Hover_ 2.wav"), 1.8, -23),
    g("", tf("TF22V 310- Swarm", "Monsters_Swarm_Passby_Fast_ 2.wav"), 1.2, -19),
  ),
  ...skin(
    "ghost",
    "backrooms",
    g("", tf("TF22V 307- Phantom", "Monsters_Phantom_Curse_ 1.wav"), 1.8, -22),
    g("", tf("TF22V 307- Phantom", "Monsters_Phantom_Curse_ 2.wav"), 1.35, -18),
  ),

  // ===== ratling: rats; biomes become bat/frog/bee/crab =====
  f("enemy-ratling-v0", `${AN}\\Rats\\amb_animals_rat_squeak_03.ogg`, 1.2, -24, "40k"),
  f("enemy-ratling-v1", `${AN}\\Rats\\amb_animals_rat_squeak_06.ogg`, 1.2, -24, "40k"),
  f("enemy-ratling-v2", `${AN}\\Rats\\amb_animals_rat_squeak_08.ogg`, 1.2, -24, "40k"),
  f("enemy-ratling-attack-v0", `${AN}\\Rats\\amb_animals_rat_squeak_01.ogg`, 1.1, -20, "40k"),
  f("enemy-ratling-attack-v1", `${AN}\\Rats\\amb_animals_rat_squeak_02.ogg`, 1.1, -20, "40k"),
  f("enemy-ratling-attack-v2", `${AN}\\Rats\\amb_animals_rat_squeak_04.ogg`, 1.1, -20, "40k"),
  ...skin(
    "ratling",
    "frost",
    f("", `${AN}\\Bats\\File00014.ogg`, 1.15, -24, "40k"),
    f("", `${AN}\\Bats\\File00015.ogg`, 1.05, -20, "40k"),
  ),
  ...skin(
    "ratling",
    "molten",
    f("", `${FR}\\FireFriend\\Fire Friend Mage Angry A.wav`, 1.35, -22),
    f("", `${FR}\\FireFriend\\Fire Friend Mage Effort A.wav`, 1.05, -19),
  ),
  ...skin(
    "ratling",
    "grim",
    f("", `${AN}\\Bats\\File00016.ogg`, 1.15, -24, "40k"),
    f("", `${AN}\\Bats\\File00017.ogg`, 1.05, -20, "40k"),
  ),
  ...skin(
    "ratling",
    "verdant",
    f("", `${AN}\\Frog\\File0001.ogg`, 1.2, -24, "40k"),
    f("", `${AN}\\Frog\\File0002.ogg`, 1.05, -20, "40k"),
  ),
  ...skin(
    "ratling",
    "ash",
    f("", `${AN}\\Crows\\File0003.ogg`, 1.25, -23, "40k"),
    f("", `${AN}\\Crows\\File0010.ogg`, 1.1, -20, "40k"),
  ),
  ...skin(
    "ratling",
    "iron",
    f("", `${BH}\\Mechanicals\\Exagurated Probe A.wav`, 1.25, -22),
    f("", `${BH}\\Mechanicals\\Intrusive Probe B.wav`, 1.1, -19),
  ),
  ...skin(
    "ratling",
    "obsidian",
    f("", `${FR}\\DarkFriend\\Dark Friend Mage Angry A.wav`, 1.4, -22),
    f("", `${FR}\\DarkFriend\\Dark Friend Mage Effort A.wav`, 1.05, -19),
  ),
  ...skin(
    "ratling",
    "sunken",
    f("", `${AN}\\Frog\\File0003.ogg`, 1.2, -24, "40k"),
    f("", `${AN}\\Frog\\File0004.ogg`, 1.05, -20, "40k"),
  ),
  ...skin(
    "ratling",
    "fungal",
    f("", `${AN}\\Bees\\File00014.ogg`, 1.3, -24, "40k"),
    f("", `${AN}\\Bees\\File00015.ogg`, 1.1, -20, "40k"),
  ),
  ...skin(
    "ratling",
    "backrooms",
    g("", hc3("Crabman", "ESM_HC3_cinematic_fx_voice_crabman_alert_pitchy_screech.wav"), 1.55, -22),
    g("", hc3("Crabman", "ESM_HC3_cinematic_fx_voice_crabman_attack_screech_claw.wav"), 1.15, -19),
  ),

  // ===== husk: zombie; frost bird, sunken bloated, iron stone =====
  f(
    "enemy-husk-v0",
    es("Zombie", "ESM_HC4_Cinematic_FX_zombie_undead_attack_gutteral_01.wav"),
    1.55,
    -20,
  ),
  f(
    "enemy-husk-v1",
    es("Zombie", "ESM_HC4_Cinematic_FX_zombie_undead_alert_noticed_energy_groan_02.wav"),
    1.65,
    -20,
  ),
  f(
    "enemy-husk-v2",
    es("Zombie", "ESM_HC4_Cinematic_FX_zombie_undead_alert_noticed_energy_groan_03.wav"),
    1.65,
    -20,
  ),
  f(
    "enemy-husk-attack-v0",
    es("Zombie", "ESM_HC4_Cinematic_FX_zombie_undead_attack_swing_bite_01.wav"),
    1.55,
    -18,
  ),
  f(
    "enemy-husk-attack-v1",
    es("Zombie", "ESM_HC4_Cinematic_FX_zombie_undead_attack_swing_bite_02.wav"),
    1.55,
    -18,
  ),
  f(
    "enemy-husk-attack-v2",
    es("Zombie", "ESM_HC4_Cinematic_FX_zombie_undead_attack_swing_bite_03.wav"),
    1.55,
    -18,
  ),
  ...skin(
    "husk",
    "frost",
    g("", tf("TF22V 309- Roc", "Monsters_Roc_Call_ 1.wav"), 1.7, -21),
    g("", tf("TF22V 309- Roc", "Monsters_Roc_Bellow_ 1.wav"), 1.4, -18),
  ),
  ...skin(
    "husk",
    "molten",
    g(
      "",
      hc3("Lava_Monster", "ESM_HC3_cinematic_fx_voice_lava_monster_alert_bellowing_low.wav"),
      1.8,
      -20,
    ),
    g(
      "",
      hc3("Lava_Monster", "ESM_HC3_cinematic_fx_voice_lava_monster_attack_big_heavy_swing.wav"),
      1.45,
      -17,
    ),
  ),
  ...skin(
    "husk",
    "grim",
    g(
      "",
      hc3("Revenant", "ESM_HC3_cinematic_fx_voice_revenant_alert_creepy_moaning.wav"),
      1.75,
      -20,
    ),
    g("", hc3("Revenant", "ESM_HC3_cinematic_fx_voice_revenant_attack_swing_yell.wav"), 1.35, -18),
  ),
  ...skin(
    "husk",
    "verdant",
    f("", `${FR}\\EarthFriend\\Earth Friend Mage Angry A.wav`, 1.55, -21),
    f("", `${FR}\\EarthFriend\\Earth Friend Mage Effort A.wav`, 1.15, -18),
  ),
  ...skin(
    "husk",
    "ash",
    f(
      "",
      es("Zombie", "ESM_HC4_Cinematic_FX_zombie_undead_alert_noticed_energy_groan_04.wav"),
      1.65,
      -20,
    ),
    f("", es("Zombie", "ESM_HC4_Cinematic_FX_zombie_undead_attack_swing_bite_04.wav"), 1.55, -18),
  ),
  ...skin(
    "husk",
    "iron",
    g(
      "",
      hc3("Temple_Guardian", "ESM_HC3_cinematic_fx_voice_temple_guardian_alert_quiet_growl.wav"),
      1.75,
      -20,
    ),
    g(
      "",
      hc3("Temple_Guardian", "ESM_HC3_cinematic_fx_voice_temple_guardian_attack_big_swing.wav"),
      1.4,
      -17,
    ),
  ),
  ...skin(
    "husk",
    "obsidian",
    g(
      "",
      hc3("Void_Beast", "ESM_HC3_cinematic_fx_voice_void_beast_alert_building_growl.wav"),
      1.8,
      -20,
    ),
    g(
      "",
      hc3("Void_Beast", "ESM_HC3_cinematic_fx_voice_void_beast_attack_big_heavy_swing.wav"),
      1.45,
      -17,
    ),
  ),
  ...skin(
    "husk",
    "sunken",
    f(
      "",
      es(
        "BloatedZombie",
        "ESM_HC4_Cinematic_FX_zombie_undead_alert_lethargic_notice_aware_gutteral_01.wav",
      ),
      1.8,
      -20,
    ),
    f(
      "",
      es("BloatedZombie", "ESM_HC4_Cinematic_FX_zombie_undead_attack_growl_aggressive_yell_01.wav"),
      1.55,
      -18,
    ),
  ),
  ...skin(
    "husk",
    "fungal",
    g(
      "",
      hc3("Mutant_Growth", "ESM_HC3_cinematic_fx_voice_mutant_growth_alert_tortured_moan.wav"),
      1.8,
      -20,
    ),
    g(
      "",
      hc3("Mutant_Growth", "ESM_HC3_cinematic_fx_voice_mutant_growth_attack_creepy_moan.wav"),
      1.4,
      -18,
    ),
  ),
  ...skin(
    "husk",
    "backrooms",
    g("", hc3("Revenant", "ESM_HC3_cinematic_fx_voice_revenant_alert_warning_hiss.wav"), 1.7, -20),
    g(
      "",
      hc3("Revenant", "ESM_HC3_cinematic_fx_voice_revenant_attack_frenzy_combo_hit.wav"),
      1.35,
      -18,
    ),
  ),

  // ===== imp: pixie, not gargoyle; iron/grim can be gargoyle =====
  g("enemy-imp-v0", tf("TF22V 308- Pixie", "Monsters_Pixie_Screech_1.wav"), 1.35, -22),
  g("enemy-imp-v1", tf("TF22V 308- Pixie", "Monsters_Pixie_Screech_2.wav"), 1.35, -22),
  g("enemy-imp-v2", tf("TF22V 308- Pixie", "Monsters_Pixie_Grunt_1.wav"), 1.25, -22),
  g("enemy-imp-attack-v0", tf("TF22V 308- Pixie", "Monsters_Pixie_Screech_3.wav"), 1.05, -18),
  g("enemy-imp-attack-v1", tf("TF22V 308- Pixie", "Monsters_Pixie_Screech_4.wav"), 1.05, -18),
  g("enemy-imp-attack-v2", tf("TF22V 308- Pixie", "Monsters_Pixie_Grunt_2.wav"), 1.0, -18),
  ...skin(
    "imp",
    "frost",
    f("", `${FR}\\IceFriend\\Ice Friend Martial Angry A.wav`, 1.4, -22),
    f("", `${FR}\\IceFriend\\Ice Friend Martial Effort A.wav`, 1.05, -18),
  ),
  ...skin(
    "imp",
    "molten",
    f("", `${FR}\\FireFriend\\Fire Friend Martial Angry B.wav`, 1.4, -21),
    f("", `${FR}\\FireFriend\\Fire Friend Martial Effort B.wav`, 1.05, -18),
  ),
  ...skin(
    "imp",
    "grim",
    f(
      "",
      es("Gargoyle", "ESM_HC4_Cinematic_FX_gargoyle_creature_alert_warning_gutteral_growl_01.wav"),
      1.7,
      -22,
    ),
    f("", es("Gargoyle", "ESM_HC4_Cinematic_FX_gargoyle_creature_attack_hit_01a.wav"), 0.9, -18),
  ),
  ...skin(
    "imp",
    "verdant",
    f("", `${FR}\\NatureFriend\\Nature Friend Mage Angry B.wav`, 1.4, -22),
    f("", `${FR}\\NatureFriend\\Nature Friend Mage Effort A.wav`, 1.05, -18),
  ),
  ...skin(
    "imp",
    "ash",
    f(
      "",
      es("Gargoyle", "ESM_HC4_Cinematic_FX_gargoyle_creature_alert_warning_gutteral_growl_02.wav"),
      1.7,
      -22,
    ),
    f("", es("Gargoyle", "ESM_HC4_Cinematic_FX_gargoyle_creature_attack_hit_02.wav"), 1.1, -18),
  ),
  ...skin(
    "imp",
    "iron",
    f(
      "",
      es("Gargoyle", "ESM_HC4_Cinematic_FX_gargoyle_creature_alert_warning_gutteral_growl_03.wav"),
      1.7,
      -21,
    ),
    f("", es("Gargoyle", "ESM_HC4_Cinematic_FX_gargoyle_creature_attack_hit_03.wav"), 1.1, -18),
  ),
  ...skin(
    "imp",
    "obsidian",
    f("", `${FR}\\DarkFriend\\Dark Friend Martial Angry B.wav`, 1.4, -22),
    f("", `${FR}\\DarkFriend\\Dark Friend Martial Effort B.wav`, 1.05, -18),
  ),
  ...skin(
    "imp",
    "sunken",
    f("", `${FR}\\WaterFriend\\Water Friend Martial Angry A.wav`, 1.4, -22),
    f("", `${FR}\\WaterFriend\\Water Friend Martial Effort A.wav`, 1.05, -18),
  ),
  ...skin(
    "imp",
    "fungal",
    g("", tf("TF22V 304- Insect", "Monsters_Insect_3.wav"), 1.4, -22),
    g("", tf("TF22V 304- Insect", "Monsters_Insect_4.wav"), 1.1, -19),
  ),
  ...skin(
    "imp",
    "backrooms",
    g(
      "",
      hc3("Alien_Parasite", "ESM_HC3_cinematic_fx_voice_alien_alert_growling_wet_angry.wav"),
      1.6,
      -22,
    ),
    g("", hc3("Alien_Parasite", "ESM_HC3_cinematic_fx_voice_alien_attack_wet_gross.wav"), 1.2, -18),
  ),

  // ===== zombie-orc: orc; verdant ape, sunken sewer, molten lava =====
  f(
    "enemy-zombie-orc-v0",
    es("Orc", "ESM_HC4_Cinematic_FX_orc_creature_alert_aggro_grunt_noticed_01.wav"),
    1.75,
    -20,
  ),
  f(
    "enemy-zombie-orc-v1",
    es("Orc", "ESM_HC4_Cinematic_FX_orc_creature_alert_aggro_grunt_noticed_02.wav"),
    1.75,
    -20,
  ),
  f(
    "enemy-zombie-orc-v2",
    es("Orc", "ESM_HC4_Cinematic_FX_orc_creature_alert_aggro_grunt_noticed_03.wav"),
    1.75,
    -20,
  ),
  f(
    "enemy-zombie-orc-attack-v0",
    es("Orc", "ESM_HC4_Cinematic_FX_orc_creature_attack_power_swing_01.wav"),
    1.5,
    -17,
  ),
  f(
    "enemy-zombie-orc-attack-v1",
    es("Orc", "ESM_HC4_Cinematic_FX_orc_creature_attack_power_swing_02.wav"),
    1.5,
    -17,
  ),
  f(
    "enemy-zombie-orc-attack-v2",
    es("Orc", "ESM_HC4_Cinematic_FX_orc_creature_attack_power_swing_03.wav"),
    1.5,
    -17,
  ),
  ...skin(
    "zombie-orc",
    "frost",
    f("", es("Orc", "ESM_HC4_Cinematic_FX_orc_creature_alert_growl_yell_01.wav"), 1.75, -20),
    f("", es("Orc", "ESM_HC4_Cinematic_FX_orc_creature_attack_hit_swing_01.wav"), 1.4, -17),
  ),
  ...skin(
    "zombie-orc",
    "molten",
    g(
      "",
      hc3("Lava_Monster", "ESM_HC3_cinematic_fx_voice_lava_monster_alert_angry_roar.wav"),
      1.8,
      -19,
    ),
    g(
      "",
      hc3("Lava_Monster", "ESM_HC3_cinematic_fx_voice_lava_monster_attack_big_roar_heavy.wav"),
      1.5,
      -17,
    ),
  ),
  ...skin(
    "zombie-orc",
    "grim",
    f(
      "",
      es("Ghoul", "ESM_HC4_Cinematic_FX_ghoul_undead_alert_aggressive_notice_02.wav"),
      1.7,
      -20,
    ),
    f("", es("Ghoul", "ESM_HC4_Cinematic_FX_ghoul_undead_attack_yell_01.wav"), 1.4, -17),
  ),
  ...skin(
    "zombie-orc",
    "verdant",
    g(
      "",
      hc3("Great_Ape", "ESM_HC3_cinematic_fx_voice_great_ape_alert_enemy_sighted_whoop.wav"),
      1.7,
      -20,
    ),
    g(
      "",
      hc3("Great_Ape", "ESM_HC3_cinematic_fx_voice_great_ape_attack_war_whoop_taunt_charge.wav"),
      1.45,
      -17,
    ),
  ),
  ...skin(
    "zombie-orc",
    "ash",
    f("", es("Orc", "ESM_HC4_Cinematic_FX_orc_creature_alert_growl_yell_charge_01.wav"), 1.75, -20),
    f("", es("Orc", "ESM_HC4_Cinematic_FX_orc_creature_attack_hit_charged_up_01.wav"), 1.5, -17),
  ),
  ...skin(
    "zombie-orc",
    "iron",
    g(
      "",
      hc3("Temple_Guardian", "ESM_HC3_cinematic_fx_voice_temple_guardian_alert_big_roar_01.wav"),
      1.8,
      -19,
    ),
    g(
      "",
      hc3("Temple_Guardian", "ESM_HC3_cinematic_fx_voice_temple_guardian_attack_heavy_roar.wav"),
      1.45,
      -17,
    ),
  ),
  ...skin(
    "zombie-orc",
    "obsidian",
    g(
      "",
      hc3("Temple_Guardian", "ESM_HC3_cinematic_fx_voice_temple_guardian_alert_growl_roar.wav"),
      1.8,
      -19,
    ),
    g(
      "",
      hc3("Temple_Guardian", "ESM_HC3_cinematic_fx_voice_temple_guardian_attack_loud_low_roar.wav"),
      1.45,
      -17,
    ),
  ),
  ...skin(
    "zombie-orc",
    "sunken",
    g(
      "",
      hc3("Sewer_Dweller", "ESM_HC3_cinematic_fx_voice_sewer_dweller_alert_disgusting_roar.wav"),
      1.8,
      -20,
    ),
    g(
      "",
      hc3("Sewer_Dweller", "ESM_HC3_cinematic_fx_voice_sewer_dweller_attack_roar.wav"),
      1.45,
      -17,
    ),
  ),
  ...skin(
    "zombie-orc",
    "fungal",
    g(
      "",
      hc3("Mutant_Growth", "ESM_HC3_cinematic_fx_voice_mutant_growth_alert_mournful_howl.wav"),
      1.8,
      -20,
    ),
    g(
      "",
      hc3("Mutant_Growth", "ESM_HC3_cinematic_fx_voice_mutant_growth_attack_and_creepy.wav"),
      1.4,
      -17,
    ),
  ),
  ...skin(
    "zombie-orc",
    "backrooms",
    g("", hc3("Psycho", "ESM_HC3_cinematic_fx_voice_psycho_alert_insane_laugh.wav"), 1.7, -20),
    g(
      "",
      hc3("Psycho", "ESM_HC3_cinematic_fx_voice_psycho_attack_frenzy_gritty_laughter.wav"),
      1.35,
      -17,
    ),
  ),

  // ===== spider: insectoid + giant spider; frost extra insect =====
  f(
    "enemy-spider-v0",
    `${MC}\\CREAInsc_Giant Spider, Provocation Idle_Ocular Sounds_Monsters & Creatures_The Complete Fantasy Collection.wav`,
    1.85,
    -23,
  ),
  f(
    "enemy-spider-v1",
    es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_alert_chatter_warning_01.wav"),
    1.7,
    -23,
  ),
  f(
    "enemy-spider-v2",
    es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_alert_aggro_growl_01_2.wav"),
    1.7,
    -23,
  ),
  f(
    "enemy-spider-attack-v0",
    es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_01.wav"),
    0.9,
    -19,
  ),
  f(
    "enemy-spider-attack-v1",
    es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_02_2.wav"),
    0.95,
    -19,
  ),
  f(
    "enemy-spider-attack-v2",
    es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_03.wav"),
    0.95,
    -19,
  ),
  ...skin(
    "spider",
    "frost",
    f(
      "",
      es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_alert_chatter_warning_02.wav"),
      1.7,
      -23,
    ),
    f(
      "",
      es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_04_2.wav"),
      0.95,
      -19,
    ),
  ),
  ...skin(
    "spider",
    "molten",
    f(
      "",
      es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_alert_aggro_growl_02_3.wav"),
      1.7,
      -23,
    ),
    f(
      "",
      es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_06_2.wav"),
      0.95,
      -19,
    ),
  ),
  ...skin(
    "spider",
    "grim",
    f("", `${CD}\\bug_tense.wav`, 1.5, -23),
    f("", `${CD}\\bug_attack.wav`, 1.2, -19),
  ),
  ...skin(
    "spider",
    "verdant",
    f("", `${AN}\\Bees\\File00016.ogg`, 1.3, -24, "40k"),
    f("", `${AN}\\Bees\\File00017.ogg`, 1.1, -20, "40k"),
  ),
  ...skin(
    "spider",
    "ash",
    f(
      "",
      es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_alert_chatter_warning_03.wav"),
      1.7,
      -23,
    ),
    f(
      "",
      es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_07.wav"),
      0.95,
      -19,
    ),
  ),
  ...skin(
    "spider",
    "iron",
    f("", `${BH}\\Mechanicals\\Mechanical Abomination D.wav`, 1.5, -21),
    f("", `${BH}\\Mechanicals\\Lazer Slice and Dice.wav`, 1.15, -19),
  ),
  ...skin(
    "spider",
    "obsidian",
    f(
      "",
      es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_alert_aggro_growl_03_2.wav"),
      1.7,
      -23,
    ),
    f(
      "",
      es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_08_2.wav"),
      0.95,
      -19,
    ),
  ),
  ...skin(
    "spider",
    "sunken",
    f(
      "",
      `${MC}\\CREAInsc_Giant Spider, Attacks_Ocular Sounds_Monsters & Creatures_The Complete Fantasy Collection.wav`,
      1.6,
      -22,
    ),
    f(
      "",
      es("Insectoid", "ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_05_2.wav"),
      0.95,
      -19,
    ),
  ),
  ...skin(
    "spider",
    "fungal",
    f("", `${BH}\\CreepyCrawlies\\Bugs On Bodies A.wav`, 1.55, -23),
    f("", `${BH}\\CreepyCrawlies\\Kronenbug A.wav`, 1.2, -19),
  ),
  ...skin(
    "spider",
    "backrooms",
    g(
      "",
      hc3("Alien_Parasite", "ESM_HC3_cinematic_fx_voice_alien_alert_squishy_wet_crunchy.wav"),
      1.6,
      -22,
    ),
    g(
      "",
      hc3("Alien_Parasite", "ESM_HC3_cinematic_fx_voice_alien_attack_screeching_squish.wav"),
      1.2,
      -19,
    ),
  ),

  // ===== bone-slime: blob; frost crawler, fungal mutant, iron metal =====
  f(
    "enemy-bone-slime-v0",
    es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_01.wav"),
    1.32,
    -22,
  ),
  f(
    "enemy-bone-slime-v1",
    es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_02.wav"),
    1.32,
    -22,
  ),
  f(
    "enemy-bone-slime-v2",
    es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_03.wav"),
    1.32,
    -22,
  ),
  f(
    "enemy-bone-slime-attack-v0",
    es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_02.wav"),
    1.1,
    -19,
  ),
  f(
    "enemy-bone-slime-attack-v1",
    es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_03.wav"),
    1.2,
    -19,
  ),
  f(
    "enemy-bone-slime-attack-v2",
    es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_05.wav"),
    1.2,
    -19,
  ),
  ...skin(
    "bone-slime",
    "frost",
    f("", `${BH}\\CreepyCrawlies\\Kronenbug B.wav`, 1.4, -22),
    f("", `${BH}\\CreepyCrawlies\\Kronenbug C.wav`, 1.2, -19),
  ),
  ...skin(
    "bone-slime",
    "molten",
    f(
      "",
      es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_07.wav"),
      1.2,
      -21,
    ),
    f(
      "",
      es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_08.wav"),
      1.2,
      -19,
    ),
  ),
  ...skin(
    "bone-slime",
    "grim",
    f("", `${CD}\\alien_tense.wav`, 1.5, -22),
    f("", `${CD}\\alien_attack.wav`, 1.3, -19),
  ),
  ...skin(
    "bone-slime",
    "verdant",
    g(
      "",
      hc3("Elemental", "ESM_HC3_cinematic_fx_voice_elemental_alert_squishy_moan.wav"),
      1.55,
      -22,
    ),
    g(
      "",
      hc3("Elemental", "ESM_HC3_cinematic_fx_voice_elemental_attack_tone_wet_normal.wav"),
      1.25,
      -19,
    ),
  ),
  ...skin(
    "bone-slime",
    "ash",
    f("", es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_04.wav"), 1.32, -22),
    f(
      "",
      es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_06.wav"),
      1.15,
      -19,
    ),
  ),
  ...skin(
    "bone-slime",
    "iron",
    f("", `${BH}\\Mechanicals\\Electrocute Flesh A.wav`, 1.4, -21),
    f("", `${BH}\\Mechanicals\\Electrocute Flesh B.wav`, 1.2, -19),
  ),
  ...skin(
    "bone-slime",
    "obsidian",
    g(
      "",
      hc3("Elemental", "ESM_HC3_cinematic_fx_voice_elemental_alert_hissy_throaty_creepy_moan.wav"),
      1.55,
      -22,
    ),
    g(
      "",
      hc3("Elemental", "ESM_HC3_cinematic_fx_voice_elemental_attack_hissing_throaty.wav"),
      1.25,
      -19,
    ),
  ),
  ...skin(
    "bone-slime",
    "sunken",
    f("", es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_05.wav"), 1.32, -22),
    f(
      "",
      es("Blob", "ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_01.wav"),
      1.4,
      -19,
    ),
  ),
  ...skin(
    "bone-slime",
    "fungal",
    g(
      "",
      hc3("Mutant_Growth", "ESM_HC3_cinematic_fx_voice_mutant_growth_alert_squishy_disgusting.wav"),
      1.6,
      -22,
    ),
    g(
      "",
      hc3(
        "Mutant_Growth",
        "ESM_HC3_cinematic_fx_voice_mutant_growth_attack_low_hissing_throaty.wav",
      ),
      1.3,
      -19,
    ),
  ),
  ...skin(
    "bone-slime",
    "backrooms",
    g(
      "",
      hc3("Alien_Parasite", "ESM_HC3_cinematic_fx_voice_alien_alert_roar_squishy_wet_moaning.wav"),
      1.6,
      -22,
    ),
    g(
      "",
      hc3("Alien_Parasite", "ESM_HC3_cinematic_fx_voice_alien_attack_screeching_squishy_gross.wav"),
      1.3,
      -19,
    ),
  ),

  // ===== white-eyed-shadow: phantom, not siren =====
  g(
    "enemy-white-eyed-shadow-v0",
    tf("TF22V 307- Phantom", "Monsters_Phantom_Breath_1.wav"),
    1.7,
    -22,
  ),
  g(
    "enemy-white-eyed-shadow-v1",
    tf("TF22V 307- Phantom", "Monsters_Phantom_Breath_2.wav"),
    1.7,
    -22,
  ),
  g(
    "enemy-white-eyed-shadow-v2",
    tf("TF22V 307- Phantom", "Monsters_Phantom_Drone_1.wav"),
    1.7,
    -22,
  ),
  g(
    "enemy-white-eyed-shadow-attack-v0",
    tf("TF22V 307- Phantom", "Monsters_Phantom_Curse_ 3.wav"),
    1.25,
    -18,
  ),
  g(
    "enemy-white-eyed-shadow-attack-v1",
    tf("TF22V 307- Phantom", "Monsters_Phantom_Curse_ 4.wav"),
    1.25,
    -18,
  ),
  g(
    "enemy-white-eyed-shadow-attack-v2",
    tf("TF22V 307- Phantom", "Monsters_Phantom_Exhale_ 1.wav"),
    1.2,
    -18,
  ),
  ...skin(
    "white-eyed-shadow",
    "frost",
    g("", tf("TF22V 301- Banshee", "Monsters_Banshee_Shriek_2.wav"), 1.55, -22),
    g("", tf("TF22V 301- Banshee", "Monsters_Banshee_Shriek_3.wav"), 1.25, -18),
  ),
  ...skin(
    "white-eyed-shadow",
    "molten",
    f("", `${FR}\\FireFriend\\Fire Friend Mage Angry B.wav`, 1.5, -21),
    f("", `${FR}\\FireFriend\\Fire Friend Mage Effort B.wav`, 1.15, -18),
  ),
  ...skin(
    "white-eyed-shadow",
    "grim",
    g("", tf("TF22V 301- Banshee", "Monsters_Banshee_Hum_1.wav"), 1.6, -22),
    g("", tf("TF22V 301- Banshee", "Monsters_Banshee_Shriek_4.wav"), 1.25, -18),
  ),
  ...skin(
    "white-eyed-shadow",
    "verdant",
    f("", `${FR}\\EarthFriend\\Earth Friend Mage Surprise A.wav`, 1.5, -22),
    f("", `${FR}\\EarthFriend\\Earth Friend Mage Effort B.wav`, 1.15, -18),
  ),
  ...skin(
    "white-eyed-shadow",
    "ash",
    g("", tf("TF22V 307- Phantom", "Monsters_Phantom_Breath_3.wav"), 1.7, -22),
    g("", tf("TF22V 307- Phantom", "Monsters_Phantom_Curse_ 5.wav"), 1.25, -18),
  ),
  ...skin(
    "white-eyed-shadow",
    "iron",
    f("", `${BH}\\Mechanicals\\Painful Teleport.wav`, 1.55, -21),
    f("", `${BH}\\Mechanicals\\Lazer Decapitation.wav`, 1.2, -18),
  ),
  ...skin(
    "white-eyed-shadow",
    "obsidian",
    g(
      "",
      hc3("Void_Beast", "ESM_HC3_cinematic_fx_voice_void_beast_alert_big_roara.wav"),
      1.75,
      -21,
    ),
    g(
      "",
      hc3("Void_Beast", "ESM_HC3_cinematic_fx_voice_void_beast_attack_roaring_big_swing.wav"),
      1.4,
      -18,
    ),
  ),
  ...skin(
    "white-eyed-shadow",
    "sunken",
    f("", es("Naga", "ESM_HC4_Cinematic_FX_naga_creature_alert_angered_scream_01.wav"), 1.7, -22),
    f("", es("Naga", "ESM_HC4_Cinematic_FX_naga_creature_attack_attack_02.wav"), 1.2, -18),
  ),
  ...skin(
    "white-eyed-shadow",
    "fungal",
    g(
      "",
      hc3("Mutant_Growth", "ESM_HC3_cinematic_fx_voice_mutant_growth_alert_tortured_howl.wav"),
      1.75,
      -22,
    ),
    g(
      "",
      hc3("Mutant_Growth", "ESM_HC3_cinematic_fx_voice_mutant_growth_attack_creepy_moaning.wav"),
      1.35,
      -18,
    ),
  ),
  ...skin(
    "white-eyed-shadow",
    "backrooms",
    g(
      "",
      hc3("Psycho", "ESM_HC3_cinematic_fx_voice_psycho_alert_low_and_quiet_laugh.wav"),
      1.7,
      -22,
    ),
    g(
      "",
      hc3("Psycho", "ESM_HC3_cinematic_fx_voice_psycho_attack_high_effort_swing.wav"),
      1.2,
      -18,
    ),
  ),

  // ===== carrion-stalker: lycan, never the hyena carrion =====
  g(
    "enemy-carrion-stalker-v0",
    hc3("Lycan", "ESM_HC3_cinematic_fx_voice_lycan_alert_deep_snarl_low_threat.wav"),
    1.75,
    -21,
  ),
  g(
    "enemy-carrion-stalker-v1",
    hc3("Lycan", "ESM_HC3_cinematic_fx_voice_lycan_alert_snarling.wav"),
    1.75,
    -21,
  ),
  g(
    "enemy-carrion-stalker-v2",
    hc3("Lycan", "ESM_HC3_cinematic_fx_voice_lycan_alert_snarl_warning.wav"),
    1.75,
    -21,
  ),
  g(
    "enemy-carrion-stalker-attack-v0",
    hc3("Lycan", "ESM_HC3_cinematic_fx_voice_lycan_attack_chomp.wav"),
    1.25,
    -18,
  ),
  g(
    "enemy-carrion-stalker-attack-v1",
    hc3("Lycan", "ESM_HC3_cinematic_fx_voice_lycan_attack_heavy_snarl_bite.wav"),
    1.35,
    -18,
  ),
  g(
    "enemy-carrion-stalker-attack-v2",
    hc3("Lycan", "ESM_HC3_cinematic_fx_voice_lycan_attack_snarl.wav"),
    1.3,
    -18,
  ),
  ...skin(
    "carrion-stalker",
    "frost",
    g("", hc3("Lycan", "ESM_HC3_cinematic_fx_voice_lycan_alert_heavy_breath_snarl.wav"), 1.7, -21),
    g("", hc3("Lycan", "ESM_HC3_cinematic_fx_voice_lycan_attack_barking_snarl.wav"), 1.3, -18),
  ),
  ...skin(
    "carrion-stalker",
    "molten",
    f(
      "",
      es("Draconid", "ESM_HC4_Cinematic_FX_draconid_creature_alert_roar_aggressive_01.wav"),
      1.7,
      -20,
    ),
    f(
      "",
      es("Draconid", "ESM_HC4_Cinematic_FX_draconid_creature_attack_aggressive_yell_roar_01.wav"),
      1.4,
      -17,
    ),
  ),
  ...skin(
    "carrion-stalker",
    "grim",
    f(
      "",
      es("Werewolf", "ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_01.wav"),
      1.85,
      -21,
    ),
    f(
      "",
      es("Werewolf", "ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_01.wav"),
      1.85,
      -18,
    ),
  ),
  ...skin(
    "carrion-stalker",
    "verdant",
    g("", hc3("Basalisk", "ESM_HC3_cinematic_fx_voice_basalisk_alert_enemy_spotted.wav"), 1.7, -21),
    g("", hc3("Basalisk", "ESM_HC3_cinematic_fx_voice_basalisk_attack_intense_roar.wav"), 1.4, -18),
  ),
  ...skin(
    "carrion-stalker",
    "ash",
    f(
      "",
      es("Werewolf", "ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_02.wav"),
      1.85,
      -21,
    ),
    f(
      "",
      es("Werewolf", "ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_02.wav"),
      1.85,
      -18,
    ),
  ),
  ...skin(
    "carrion-stalker",
    "iron",
    g(
      "",
      hc3("Temple_Guardian", "ESM_HC3_cinematic_fx_voice_temple_guardian_alert_warning_growl.wav"),
      1.7,
      -20,
    ),
    g(
      "",
      hc3("Temple_Guardian", "ESM_HC3_cinematic_fx_voice_temple_guardian_attack_quiet_growl.wav"),
      1.35,
      -18,
    ),
  ),
  ...skin(
    "carrion-stalker",
    "obsidian",
    f("", es("Draconid", "ESM_HC4_Cinematic_FX_draconid_creature_alert_02.wav"), 1.7, -20),
    f(
      "",
      es("Draconid", "ESM_HC4_Cinematic_FX_draconid_creature_attack_growl_roar_hit_01.wav"),
      1.4,
      -17,
    ),
  ),
  ...skin(
    "carrion-stalker",
    "sunken",
    f("", `${AN}\\Alligator\\alligator_attack_01.ogg`, 1.35, -20, "40k"),
    f("", `${AN}\\Alligator\\alligator_attack_02.ogg`, 1.2, -18, "40k"),
  ),
  ...skin(
    "carrion-stalker",
    "fungal",
    g(
      "",
      hc3("Alien_Parasite", "ESM_HC3_cinematic_fx_voice_alien_alert_roaring_crackle_squish.wav"),
      1.7,
      -21,
    ),
    g(
      "",
      hc3("Alien_Parasite", "ESM_HC3_cinematic_fx_voice_alien_attack_low_screech_wet.wav"),
      1.3,
      -18,
    ),
  ),
  ...skin(
    "carrion-stalker",
    "backrooms",
    g(
      "",
      hc3("Psycho", "ESM_HC3_cinematic_fx_voice_psycho_alert_throaty_hacking_laugh.wav"),
      1.7,
      -21,
    ),
    g("", hc3("Psycho", "ESM_HC3_cinematic_fx_voice_psycho_attack_heave_throw.wav"), 1.25, -18),
  ),
];
