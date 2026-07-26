# Audio runtime

The Dungeon uses local assets from `public/assets/audio/dungeon/`. `GameAudio` loads them after a player gesture and handles master mute, pause, group gain, a final limiter, and 3D source placement.

## Mix targets

| Group           |                    Runtime gain |    Asset target | Use                                |
| --------------- | ------------------------------: | --------------: | ---------------------------------- |
| ambience        |                            0.60 |        -29 LUFS | Cave room tone and torch crackle   |
| sfx             |                            0.84 | -23 to -18 LUFS | Items, doors, damage, portal       |
| stone footsteps | 0.84 group; 0.10–0.11 per asset |        -30 LUFS | Grounded movement on dry floors    |
| wet footsteps   | 0.84 group; 0.14–0.16 per asset |        -32 LUFS | Grounded movement over water masks |
| threat          |                            0.72 | -24 to -18 LUFS | Voice family, alert and attack     |
| ui              |                            0.58 |        -24 LUFS | Menu and mode feedback             |

Master defaults to `0.76`. A compressor with a -12 dB threshold and 12:1 ratio limits overlap. The asset recipe uses a pre-encode limiter so decoded Opus files stay at or below -2 dB true peak. The runtime keeps each group below the master and exposes `setGroupVolume` for future options controls.

Post-mixer verification (decoded Opus, cue gain × SFX group `0.84` × master `0.76`):

| Footstep | Effective gain |         RMS |        Peak |
| -------- | -------------: | ----------: | ----------: |
| stone A  |          0.070 | -49.90 dBFS | -28.96 dBFS |
| stone B  |          0.064 | -49.20 dBFS | -30.47 dBFS |
| water A  |          0.102 | -50.17 dBFS | -26.54 dBFS |
| water B  |          0.089 | -49.72 dBFS | -27.48 dBFS |

These levels keep the cues audible while placing them well below doors, pickups, damage, and creature calls.

## Asset matrix

| Runtime asset          | Event                      | Source from `F:\# AUDIO\# SAMPLES\#SFX`                                                                                                 |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ambience-cave.opus`   | Global room loop           | `AMBIENCE\FantasyAmbiences\...\AMBFant_Opressing Cave, Heavy Wind, Water Drops, Distant Spirits Voice, Reverse Breaths, Loopable...wav` |
| `torch-crackle.opus`   | Nearby fires               | `Fire\CinematicFire\...\FIRETrch_Waving Torch Around, Heavy Crackle...wav`                                                              |
| `step-stone-a/b.opus`  | Player movement            | `FOOTSTEPS\AllRoundFootsteps\...\FOLYFeet_Footsteps Boots One Step Concrete Distance / Concrete Gritty...wav`                           |
| `step-water-a/b.opus`  | Player movement over water | `FOOTSTEPS\AllRoundFootsteps\...\FOLYFeet_Footsteps Boot One Step Wet Sand...wav`                                                       |
| `ui-metal.opus`        | Menu, mode, forge          | `UI\UserInterface\CLICK\UIClick_Glitchy Metal UI Click 01...wav`                                                                        |
| `pickup-stone.opus`    | Magic-stone collect        | `Magic\MagicSpells\...\MAGSpel_Magic Of Metal, Fairy Spell Impact into Stones...wav`                                                    |
| `pickup-resolve.opus`  | Health collect             | `Magic\MagicSpells\...\MAGSpel_Magic Of Shadows, Spell Launch, Fairy Resonance...wav`                                                   |
| `enemy-alert.opus`     | Nearby threat cue          | `Horror\MonstersAndCreatures\...\CREAMnstr_Big Cave Creature, Menacing Idle...wav`                                                      |
| `enemy-growl.opus`     | Threat escalation          | `Horror\BlastwaveFxHorrorVol2\MonsterZombieGrowl_SFXB.145.wav`                                                                          |
| `enemy-attack.opus`    | Hostile strike             | `Horror\EpicStockMediaHumanoidCreatures4\...\Specter\...ghost_attack_quick_hit_01.wav`                                                  |
| `enemy-demon.opus`     | Imp/demon voice            | `Horror\BlastwaveFxHorrorVol2\MonsterDemon_S08AN.229.wav`                                                                               |
| `enemy-insect.opus`    | Spider/insect voice        | `Horror\EpicStockMediaHumanoidCreatures4\...\Insectoid\...alert_chatter_warning_01.wav`                                                 |
| `enemy-ooze.opus`      | Bone-slime voice           | `Horror\EpicStockMediaHumanoidCreatures4\...\Blob\...alerted_growl_notice_01.wav`                                                       |
| `enemy-vermin.opus`    | Ratling voice              | `Animals\EvilbananaMegaAnimalPack\Rats\amb_animals_rat_squeak_03.ogg`                                                                   |
| `door-open/close.opus` | Door state transition      | `Medieval\MedievalFantasySoundFxPackVol3\Dungeon\Dungeon Door Open / Close Dry A.wav`                                                   |
| `damage.opus`          | Player damage              | `Impacts\Deep Thud.wav`                                                                                                                 |
| `portal-open.opus`     | Fourth stone and exit      | `Magic\MagicSpells\...\MAGSpel_Magic Of Shadows, Fairy Spell Launch, Long Metallic Resonance, Low Tone...wav`                           |

`apps/dungeon/scripts/build-audio-pack.ps1` is the source-to-output recipe. It preserves the originals, extracts short one-shots where needed, resets timestamps, normalises with `loudnorm`, and encodes browser-ready 48 kHz Opus. Re-run it after changing a selected source.

The stone footsteps use a 150 Hz +5 dB bell and a 1.8 kHz low-pass before normalisation. Wet variants use two separate steps from one boot-on-wet-ground recording. The controller advances cadence only while grounded and suppresses the landing frame, so a jump cannot emit a step.

## Spatial behavior

`DungeonWorld.getAudioFrame()` provides read-only fire, stone, enemy, and portal positions. `GameAudio` sets the Web Audio listener from the camera and plays HRTF one-shots with inverse distance falloff:

- Torch crackle: 2.2 m reference distance, 17 m maximum.
- Stone and resolve pickups: 1.5 m reference distance, 11–13 m maximum.
- Enemy calls: 1.25–2.3 m reference distance, 16–24 m maximum.
- Doors: 2 m reference distance, 18 m maximum; one cue per open/close target transition.
- Portal: 3.5 m reference distance, 28 m maximum.

The system pauses ambience, SFX, and threats with the play state. UI remains active for pause controls. `dispose()` stops the loop and closes the audio context.

Audio arms on the first pointer or keyboard gesture, including a click on the 3D scene that captures the pointer. If an asset request is interrupted, the next gesture retries only the missing assets.

## Distribution

The selected sources come from the local library provided for this task. Confirm the relevant source licences before publishing the asset pack outside this repository.
