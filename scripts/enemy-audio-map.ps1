# Enemy presence/attack sources for build-audio-pack.ps1
# v0-v2 = random takes; cold/wet/fire/weird = biome family skins.
# Paths are relative to F:\# AUDIO\# SAMPLES\#SFX

function EnemyClip {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Source,
    [double]$Duration = 1.6,
    [double]$TargetLufs = -21,
    [double]$Start = 0,
    [string]$Bitrate = "48k"
  )
  [pscustomobject]@{
    Name = $Name
    Channels = 1
    Bitrate = $Bitrate
    TargetLufs = $TargetLufs
    Start = $Start
    Duration = $Duration
    Source = $Source
  }
}

$ES = "Horror\EpicStockMediaHumanoidCreatures4\OneShot\Designed"
$BW = "Horror\BlastwaveFxHorrorVol2"
$MC = "Horror\MonstersAndCreatures\Monsters&Creatures"
$CD = "Horror\CreaturesDesigned"
$RAT = "Animals\EvilbananaMegaAnimalPack\Rats"

$EnemyAudioAssets = @(
  # --- generic fallbacks ---
  (EnemyClip "enemy-growl" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_alert_noticed_energy_groan_01.wav" 1.65 -20),
  (EnemyClip "enemy-attack" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_attack_quick_hit_01.wav" 1.70 -18),

  # ===== carrion =====
  (EnemyClip "enemy-carrion-v0" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_01.wav" 1.85 -21),
  (EnemyClip "enemy-carrion-v1" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_03.wav" 1.85 -21),
  (EnemyClip "enemy-carrion-v2" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_05.wav" 1.85 -21),
  (EnemyClip "enemy-carrion-attack-v0" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_01.wav" 1.85 -18),
  (EnemyClip "enemy-carrion-attack-v1" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_03.wav" 1.85 -18),
  (EnemyClip "enemy-carrion-attack-v2" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_05.wav" 1.85 -18),
  (EnemyClip "enemy-carrion-cold" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_06.wav" 1.90 -21),
  (EnemyClip "enemy-carrion-attack-cold" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_06.wav" 1.90 -18),
  (EnemyClip "enemy-carrion-wet" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_04.wav" 1.85 -21),
  (EnemyClip "enemy-carrion-attack-wet" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_04.wav" 1.85 -18),
  (EnemyClip "enemy-carrion-fire" "$BW\MonsterGrowlSnarl_S08AN.246.wav" 1.90 -20),
  (EnemyClip "enemy-carrion-attack-fire" "$BW\MonsterGrowlSnarl_S08AN.247.wav" 1.70 -18),
  (EnemyClip "enemy-carrion-weird" "$BW\MonsterBarkSnarl_S011HO.218.wav" 1.80 -20),
  (EnemyClip "enemy-carrion-attack-weird" "$BW\MonsterGrowlDeep_S08AN.241.wav" 1.80 -18),

  # ===== goblin =====
  (EnemyClip "enemy-goblin-v0" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_01.wav" 1.95 -21),
  (EnemyClip "enemy-goblin-v1" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_02.wav" 1.95 -21),
  (EnemyClip "enemy-goblin-v2" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_03.wav" 1.95 -21),
  (EnemyClip "enemy-goblin-attack-v0" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_attack_swing_effort_powerful_01.wav" 1.00 -18),
  (EnemyClip "enemy-goblin-attack-v1" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_attack_swing_effort_powerful_02.wav" 0.95 -18),
  (EnemyClip "enemy-goblin-attack-v2" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_attack_swing_effort_powerful_03.wav" 0.90 -18),
  (EnemyClip "enemy-goblin-cold" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_04.wav" 1.95 -21),
  (EnemyClip "enemy-goblin-attack-cold" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_attack_swing_effort_powerful_04.wav" 0.95 -18),
  (EnemyClip "enemy-goblin-wet" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_05.wav" 1.95 -21),
  (EnemyClip "enemy-goblin-attack-wet" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_attack_steady_growl_01.wav" 1.20 -18),
  (EnemyClip "enemy-goblin-fire" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_alert_throaty_growl_06.wav" 1.95 -21),
  (EnemyClip "enemy-goblin-attack-fire" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_attack_swing_effort_powerful_05.wav" 0.95 -18),
  (EnemyClip "enemy-goblin-weird" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_attack_steady_growl_02.wav" 1.25 -20),
  (EnemyClip "enemy-goblin-attack-weird" "$ES\Goblin\ESM_HC4_Cinematic_FX_goblin_creature_attack_steady_growl_03.wav" 1.15 -18),

  # ===== ghost =====
  (EnemyClip "enemy-ghost-v0" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_alert_scream_summon_01.wav" 2.05 -22),
  (EnemyClip "enemy-ghost-v1" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_alert_scream_summon_02.wav" 2.05 -22),
  (EnemyClip "enemy-ghost-v2" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_alert_scream_summon_03.wav" 2.05 -22),
  (EnemyClip "enemy-ghost-attack-v0" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_attack_aggressive_screech_01.wav" 1.65 -18),
  (EnemyClip "enemy-ghost-attack-v1" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_attack_aggressive_screech_02.wav" 1.65 -18),
  (EnemyClip "enemy-ghost-attack-v2" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_attack_aggressive_screech_03.wav" 1.65 -18),
  (EnemyClip "enemy-ghost-cold" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_alert_scream_summon_04.wav" 2.00 -22),
  (EnemyClip "enemy-ghost-attack-cold" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_attack_quick_hit_01.wav" 1.05 -18),
  (EnemyClip "enemy-ghost-wet" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_alert_scream_summon_05.wav" 2.00 -22),
  (EnemyClip "enemy-ghost-attack-wet" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_attack_violent_spew_01.wav" 1.70 -18),
  (EnemyClip "enemy-ghost-fire" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_attack_aggressive_screech_04.wav" 1.70 -21),
  (EnemyClip "enemy-ghost-attack-fire" "$ES\Specter\ESM_HC4_Cinematic_FX_specter_ghost_attack_aggressive_screech_05.wav" 1.65 -18),
  (EnemyClip "enemy-ghost-weird" "$ES\Harpy\ESM_HC4_Cinematic_FX_harpy_creature_alert_annoyed_warning_01.wav" 1.80 -22),
  (EnemyClip "enemy-ghost-attack-weird" "$ES\Harpy\ESM_HC4_Cinematic_FX_harpy_creature_attack_quick_attack_01.wav" 1.10 -18),

  # ===== ratling =====
  (EnemyClip "enemy-ratling-v0" "$RAT\amb_animals_rat_squeak_03.ogg" 1.20 -24 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-v1" "$RAT\amb_animals_rat_squeak_06.ogg" 1.20 -24 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-v2" "$RAT\amb_animals_rat_squeak_08.ogg" 1.20 -24 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-attack-v0" "$RAT\amb_animals_rat_squeak_01.ogg" 1.10 -20 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-attack-v1" "$RAT\amb_animals_rat_squeak_02.ogg" 1.10 -20 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-attack-v2" "$RAT\amb_animals_rat_squeak_04.ogg" 1.10 -20 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-cold" "$RAT\amb_animals_rat_squeak_05.ogg" 1.20 -24 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-attack-cold" "$RAT\amb_animals_rat_squeak_07.ogg" 1.10 -20 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-wet" "$RAT\amb_animals_rat_squeak_04.ogg" 1.20 -24 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-attack-wet" "$RAT\amb_animals_rat_squeak_05.ogg" 1.10 -20 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-fire" "$RAT\amb_animals_rat_squeak_02.ogg" 1.20 -24 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-attack-fire" "$RAT\amb_animals_rat_squeak_06.ogg" 1.10 -20 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-weird" "$CD\bug_tense.wav" 1.40 -23 -Bitrate "40k"),
  (EnemyClip "enemy-ratling-attack-weird" "$CD\bug_attack.wav" 1.15 -19 -Bitrate "40k"),

  # ===== husk =====
  (EnemyClip "enemy-husk-v0" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_alert_noticed_energy_groan_01.wav" 1.65 -20),
  (EnemyClip "enemy-husk-v1" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_alert_noticed_energy_groan_02.wav" 1.65 -20),
  (EnemyClip "enemy-husk-v2" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_alert_noticed_energy_groan_03.wav" 1.65 -20),
  (EnemyClip "enemy-husk-attack-v0" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_attack_swing_bite_01.wav" 1.55 -18),
  (EnemyClip "enemy-husk-attack-v1" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_attack_swing_bite_02.wav" 1.55 -18),
  (EnemyClip "enemy-husk-attack-v2" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_attack_swing_bite_03.wav" 1.55 -18),
  (EnemyClip "enemy-husk-cold" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_alert_noticed_energy_groan_04.wav" 1.65 -20),
  (EnemyClip "enemy-husk-attack-cold" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_attack_gutteral_groan_01.wav" 1.50 -18),
  (EnemyClip "enemy-husk-wet" "$ES\BloatedZombie\ESM_HC4_Cinematic_FX_zombie_undead_alert_lethargic_notice_aware_gutteral_01.wav" 1.80 -20),
  (EnemyClip "enemy-husk-attack-wet" "$ES\BloatedZombie\ESM_HC4_Cinematic_FX_zombie_undead_attack_growl_aggressive_yell_01.wav" 1.55 -18),
  (EnemyClip "enemy-husk-fire" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_attack_gutteral_01.wav" 1.50 -20),
  (EnemyClip "enemy-husk-attack-fire" "$ES\Zombie\ESM_HC4_Cinematic_FX_zombie_undead_attack_swing_bite_04.wav" 1.55 -18),
  (EnemyClip "enemy-husk-weird" "$ES\Ghoul\ESM_HC4_Cinematic_FX_ghoul_undead_alert_aggressive_notice_01.wav" 1.85 -20),
  (EnemyClip "enemy-husk-attack-weird" "$ES\Ghoul\ESM_HC4_Cinematic_FX_ghoul_undead_attack_hit_01.wav" 1.20 -18),

  # ===== imp =====
  (EnemyClip "enemy-imp-v0" "$BW\MonsterDemon_S08AN.229.wav" 1.80 -22),
  (EnemyClip "enemy-imp-v1" "$ES\Gargoyle\ESM_HC4_Cinematic_FX_gargoyle_creature_alert_warning_gutteral_growl_01.wav" 1.80 -22),
  (EnemyClip "enemy-imp-v2" "$BW\MonsterGrowlSnarl_S08AN.248.wav" 1.80 -22),
  (EnemyClip "enemy-imp-attack-v0" "$ES\Gargoyle\ESM_HC4_Cinematic_FX_gargoyle_creature_attack_hit_01a.wav" 0.90 -18),
  (EnemyClip "enemy-imp-attack-v1" "$ES\Gargoyle\ESM_HC4_Cinematic_FX_gargoyle_creature_attack_hit_01b.wav" 0.95 -18),
  (EnemyClip "enemy-imp-attack-v2" "$ES\Gargoyle\ESM_HC4_Cinematic_FX_gargoyle_creature_attack_hit_02.wav" 1.10 -18),
  (EnemyClip "enemy-imp-cold" "$ES\Gargoyle\ESM_HC4_Cinematic_FX_gargoyle_creature_alert_warning_gutteral_growl_02.wav" 1.80 -22),
  (EnemyClip "enemy-imp-attack-cold" "$ES\Gargoyle\ESM_HC4_Cinematic_FX_gargoyle_creature_attack_hit_03.wav" 1.10 -18),
  (EnemyClip "enemy-imp-wet" "$ES\Gargoyle\ESM_HC4_Cinematic_FX_gargoyle_creature_alert_warning_gutteral_growl_03.wav" 1.80 -22),
  (EnemyClip "enemy-imp-attack-wet" "$ES\Gargoyle\ESM_HC4_Cinematic_FX_gargoyle_creature_attack_angered_taunt_hiss_01.wav" 1.20 -18),
  (EnemyClip "enemy-imp-fire" "$BW\MonsterDemonHorse_SFXB.1406.wav" 1.90 -21),
  (EnemyClip "enemy-imp-attack-fire" "$BW\MonsterGrowlSnarl_S08AN.249.wav" 1.60 -18),
  (EnemyClip "enemy-imp-weird" "$BW\MonsterCreature_SFXB.1405.wav" 1.85 -22),
  (EnemyClip "enemy-imp-attack-weird" "$ES\Gargoyle\ESM_HC4_Cinematic_FX_gargoyle_creature_attack_hit_04.wav" 1.10 -18),

  # ===== zombie-orc =====
  (EnemyClip "enemy-zombie-orc-v0" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_alert_aggro_grunt_noticed_01.wav" 1.75 -20),
  (EnemyClip "enemy-zombie-orc-v1" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_alert_aggro_grunt_noticed_02.wav" 1.75 -20),
  (EnemyClip "enemy-zombie-orc-v2" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_alert_aggro_grunt_noticed_03.wav" 1.75 -20),
  (EnemyClip "enemy-zombie-orc-attack-v0" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_attack_power_swing_01.wav" 1.50 -17),
  (EnemyClip "enemy-zombie-orc-attack-v1" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_attack_power_swing_02.wav" 1.50 -17),
  (EnemyClip "enemy-zombie-orc-attack-v2" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_attack_power_swing_03.wav" 1.50 -17),
  (EnemyClip "enemy-zombie-orc-cold" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_alert_growl_yell_01.wav" 1.75 -20),
  (EnemyClip "enemy-zombie-orc-attack-cold" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_attack_hit_swing_01.wav" 1.40 -17),
  (EnemyClip "enemy-zombie-orc-wet" "$ES\BloatedZombie\ESM_HC4_Cinematic_FX_zombie_undead_alert_lethargic_notice_aware_gutteral_02.wav" 1.85 -20),
  (EnemyClip "enemy-zombie-orc-attack-wet" "$ES\BloatedZombie\ESM_HC4_Cinematic_FX_zombie_undead_attack_growl_aggressive_yell_02.wav" 1.55 -17),
  (EnemyClip "enemy-zombie-orc-fire" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_alert_growl_yell_charge_01.wav" 1.75 -20),
  (EnemyClip "enemy-zombie-orc-attack-fire" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_attack_hit_charged_up_01.wav" 1.50 -17),
  (EnemyClip "enemy-zombie-orc-weird" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_attack_hit_charged_up_02.wav" 1.50 -20),
  (EnemyClip "enemy-zombie-orc-attack-weird" "$ES\Orc\ESM_HC4_Cinematic_FX_orc_creature_attack_hit_charged_up_03.wav" 1.50 -17),

  # ===== spider =====
  (EnemyClip "enemy-spider-v0" "$MC\CREAInsc_Giant Spider, Provocation Idle_Ocular Sounds_Monsters & Creatures_The Complete Fantasy Collection.wav" 1.85 -23),
  (EnemyClip "enemy-spider-v1" "$ES\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_alert_chatter_warning_01.wav" 1.70 -23),
  (EnemyClip "enemy-spider-v2" "$ES\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_alert_aggro_growl_01_2.wav" 1.70 -23),
  (EnemyClip "enemy-spider-attack-v0" "$ES\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_01.wav" 0.90 -19),
  (EnemyClip "enemy-spider-attack-v1" "$ES\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_02_2.wav" 0.95 -19),
  (EnemyClip "enemy-spider-attack-v2" "$ES\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_03.wav" 0.95 -19),
  (EnemyClip "enemy-spider-cold" "$ES\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_alert_chatter_warning_02.wav" 1.70 -23),
  (EnemyClip "enemy-spider-attack-cold" "$ES\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_04_2.wav" 0.95 -19),
  (EnemyClip "enemy-spider-wet" "$MC\CREAInsc_Giant Spider, Attacks_Ocular Sounds_Monsters & Creatures_The Complete Fantasy Collection.wav" 1.60 -22),
  (EnemyClip "enemy-spider-attack-wet" "$ES\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_05_2.wav" 0.95 -19),
  (EnemyClip "enemy-spider-fire" "$ES\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_alert_aggro_growl_02_3.wav" 1.70 -23),
  (EnemyClip "enemy-spider-attack-fire" "$ES\Insectoid\ESM_HC4_Cinematic_FX_insectoid_creature_attack_hit_chomp_06_2.wav" 0.95 -19),
  (EnemyClip "enemy-spider-weird" "$CD\bug_tense.wav" 1.50 -23),
  (EnemyClip "enemy-spider-attack-weird" "$CD\bug_attack.wav" 1.20 -19),

  # ===== bone-slime =====
  (EnemyClip "enemy-bone-slime-v0" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_01.wav" 1.32 -22),
  (EnemyClip "enemy-bone-slime-v1" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_02.wav" 1.32 -22),
  (EnemyClip "enemy-bone-slime-v2" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_03.wav" 1.32 -22),
  (EnemyClip "enemy-bone-slime-attack-v0" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_02.wav" 1.10 -19),
  (EnemyClip "enemy-bone-slime-attack-v1" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_03.wav" 1.20 -19),
  (EnemyClip "enemy-bone-slime-attack-v2" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_05.wav" 1.20 -19),
  (EnemyClip "enemy-bone-slime-cold" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_04.wav" 1.32 -22),
  (EnemyClip "enemy-bone-slime-attack-cold" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_06.wav" 1.15 -19),
  (EnemyClip "enemy-bone-slime-wet" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_alerted_growl_notice_05.wav" 1.32 -22),
  (EnemyClip "enemy-bone-slime-attack-wet" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_01.wav" 1.40 -19),
  (EnemyClip "enemy-bone-slime-fire" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_07.wav" 1.20 -21),
  (EnemyClip "enemy-bone-slime-attack-fire" "$ES\Blob\ESM_HC4_Cinematic_FX_blob_creature_attack_deep_gravely_combat_08.wav" 1.20 -19),
  (EnemyClip "enemy-bone-slime-weird" "$CD\alien_tense.wav" 1.50 -22),
  (EnemyClip "enemy-bone-slime-attack-weird" "$CD\alien_attack.wav" 1.30 -19),

  # ===== white-eyed-shadow =====
  (EnemyClip "enemy-white-eyed-shadow-v0" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_alert_aggressive_warning_screech_01_3.wav" 1.75 -22),
  (EnemyClip "enemy-white-eyed-shadow-v1" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_alert_aggressive_warning_screech_02.wav" 1.75 -22),
  (EnemyClip "enemy-white-eyed-shadow-v2" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_alert_aggressive_warning_screech_03_2_2.wav" 1.75 -22),
  (EnemyClip "enemy-white-eyed-shadow-attack-v0" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_attack_hit_effort_01_3.wav" 1.20 -18),
  (EnemyClip "enemy-white-eyed-shadow-attack-v1" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_attack_hit_effort_02.wav" 1.20 -18),
  (EnemyClip "enemy-white-eyed-shadow-attack-v2" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_attack_hit_effort_03_3.wav" 1.20 -18),
  (EnemyClip "enemy-white-eyed-shadow-cold" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_alert_aggressive_warning_screech_04_2_2.wav" 1.75 -22),
  (EnemyClip "enemy-white-eyed-shadow-attack-cold" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_attack_effort_01_2.wav" 1.20 -18),
  (EnemyClip "enemy-white-eyed-shadow-wet" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_alert_aggressive_warning_screech_05_3.wav" 1.75 -22),
  (EnemyClip "enemy-white-eyed-shadow-attack-wet" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_attack_scream_ability_01_2.wav" 1.40 -18),
  (EnemyClip "enemy-white-eyed-shadow-fire" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_alert_aggressive_warning_screech_06_2_2.wav" 1.75 -22),
  (EnemyClip "enemy-white-eyed-shadow-attack-fire" "$ES\Siren\ESM_HC4_Cinematic_FX_siren_fecreature_attack_scream_ability_02_2.wav" 1.40 -18),
  (EnemyClip "enemy-white-eyed-shadow-weird" "$ES\Harpy\ESM_HC4_Cinematic_FX_harpy_creature_alert_angered_sequence_yell_01.wav" 1.80 -22),
  (EnemyClip "enemy-white-eyed-shadow-attack-weird" "$ES\Harpy\ESM_HC4_Cinematic_FX_harpy_creature_attack_aggressive_yell_01.wav" 1.30 -18),

  # ===== carrion-stalker =====
  (EnemyClip "enemy-carrion-stalker-v0" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_02.wav" 1.95 -21),
  (EnemyClip "enemy-carrion-stalker-v1" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_04.wav" 1.95 -21),
  (EnemyClip "enemy-carrion-stalker-v2" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_06.wav" 1.95 -21),
  (EnemyClip "enemy-carrion-stalker-attack-v0" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_02.wav" 1.95 -18),
  (EnemyClip "enemy-carrion-stalker-attack-v1" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_04.wav" 1.95 -18),
  (EnemyClip "enemy-carrion-stalker-attack-v2" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_06.wav" 1.95 -18),
  (EnemyClip "enemy-carrion-stalker-cold" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_03.wav" 1.90 -21),
  (EnemyClip "enemy-carrion-stalker-attack-cold" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_07.wav" 1.90 -18),
  (EnemyClip "enemy-carrion-stalker-wet" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_alert_attention_grab_05.wav" 1.90 -21),
  (EnemyClip "enemy-carrion-stalker-attack-wet" "$ES\Werewolf\ESM_HC4_Cinematic_FX_werewolf_creature_attack_growl_gutteral_08.wav" 1.90 -18),
  (EnemyClip "enemy-carrion-stalker-fire" "$BW\MonsterGrowlSnarl_S08AN.248.wav" 1.85 -20),
  (EnemyClip "enemy-carrion-stalker-attack-fire" "$BW\MonsterGrowlSnarl_S08AN.249.wav" 1.70 -18),
  (EnemyClip "enemy-carrion-stalker-weird" "$BW\MonsterCaveGrowls_SFXB.1404.wav" 1.90 -20),
  (EnemyClip "enemy-carrion-stalker-attack-weird" "$BW\MonsterGrowlDeep_S08AN.242.wav" 1.80 -18)
)
