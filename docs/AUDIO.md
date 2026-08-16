# Audio runtime

`GameAudio` loads Opus assets from `public/assets/audio/dungeon/` after a player gesture. It handles mute, pause, group gain, limiting, and spatial one-shots.

Spatial pose is browser-safe: Chrome/Edge/Safari use `AudioListener`/`PannerNode` AudioParam axes (`positionX`…); Firefox still only exposes legacy `setPosition` / `setOrientation` on the listener. `applyAudioListenerPose` and `applyPannerPosition` pick the supported path so the play frame never throws after unlock.

Sources are a personal sample library. Rebuild with:

```powershell
pwsh -File scripts/build-audio-pack.ps1
```

## Mix targets

| Group           |                    Runtime gain |    Asset target | Effective bus target | Use                       |
| --------------- | ------------------------------: | --------------: | -------------------: | ------------------------- |
| ambience        |                            0.60 |        -29 LUFS |            ~-39 LUFS | Cave room tone            |
| torch           |                  ambience ×0.69 |        -25 LUFS |            ~-36 LUFS | Nearby fire               |
| sfx (pickups)   |                            0.84 | -21 to -19 LUFS |            ~-26 LUFS | Stones and powers         |
| sfx (world)     |                            0.84 | -24 to -22 LUFS |     ~-31 to -30 LUFS | Doors and chests          |
| sfx (hits/ends) |                            0.84 | -25 to -18 LUFS |     ~-27 to -24 LUFS | Damage, win, lose, portal |
| stone footsteps | 0.84 group; 0.10–0.11 per asset |        -30 LUFS |             soft bed | Dry floors (left soft)    |
| wet footsteps   | 0.84 group; 0.14–0.16 per asset |        -32 LUFS |             soft bed | Water masks (left soft)   |
| threat          |                            0.72 | -24 to -18 LUFS |     ~-30 to -27 LUFS | Enemy voices              |
| ui              |                            0.28 |        -32 LUFS |             soft bed | Soft menu clicks/ticks    |
| music           |                           0.288 |        -16 LUFS |            under SFX | Scene and biome beds      |

Master defaults to `0.76`. Effective level ≈ file LUFS + asset gain + group gain + master. Per-asset gains in `GameAudio` were matched to measured Opus loudness; footsteps stay intentionally quiet.

A compressor at -12 dB / 12:1 limits overlap. Encode uses loudnorm plus a pre-Opus limiter so decoded peaks stay at or below -2 dBTP.

## Asset map

| Asset            | Role                          |
| ---------------- | ----------------------------- |
| `ambience-cave`  | Looping dungeon room tone     |
| `torch-crackle`  | Nearby fire one-shot          |
| `step-stone-a/b` | Dry footstep variants         |
| `step-water-a/b` | Wet footstep variants         |
| `ui-metal`       | Forge / heavy UI confirm      |
| `ui-click`       | Default interface click       |
| `ui-tick`        | Slider ticks / seed chips     |
| `ui-hover`       | Soft menu hover blip          |
| `ui-select`      | Primary menu / biome select   |
| `ui-back`        | Back / secondary actions      |
| `ui-toggle`      | Mute / CRT / checkbox toggles |
| `ui-deny`        | Disabled control feedback     |

Regenerate synthetic UI clicks with:

```powershell
python scripts/generate-ui-sounds.py
```

| `pickup-stone` | Magic stone bind |
| `pickup-resolve` | Health flask |
| `pickup-time-freeze` | Time freeze power |
| `pickup-ward` | Luminous ward power |
| `enemy-growl` / `enemy-attack` | Generic threat fallbacks |
| `enemy-{kind}-v0..v2` | Three presence takes per kind (random, no immediate repeat) |
| `enemy-{kind}-attack-v0..v2` | Three attack takes per kind |
| `enemy-{kind}-{biome}` | Biome subspecies presence (one clip per non-ancient biome) |
| `enemy-{kind}-attack-{biome}` | Biome subspecies attack |
| `door-open` / `door-close` | Dungeon doors |
| `chest-open` / `chest-reward` | Chest lid + shimmer |
| `damage` | Player hit |
| `lose` | Death end SFX (sting) |
| `win` | Escape end |
| `portal-open` | Portal unlock / spawn |
| `music-biome-*` | Exploration bed per biome (see `docs/BIOME-MUSIC.md`) |
| `music-biome-*-portal` | Quietly raised bed after four stones bind |
| `music-lose` | Melancholic death bed (`Last Wick`) |
| `music-win` | Relief bed after escape (`Open Air`) |
| `music-menu` | Welcome home bed (`Threshold Ember`) |
| `music-hall` | Hall of Escapes bed (`Names in Stone`) |
| `music-biome-select` | Biome picker bed (`Choose the Descent`) |

Kinds: `carrion`, `goblin`, `ghost`, `ratling`, `husk`, `imp`, `zombie-orc`, `spider`, `bone-slime`, `white-eyed-shadow`, `carrion-stalker`.

`creatureVoiceForEnemy(kind)` is 1:1 with roster kind. Proximity picks from presence takes; `playEnemyHit` picks from attack takes. The active dungeon mood is on `DungeonAudioFrame.moodId` and maps via `creatureToneForMood`:

| Mood              | Tone          | Pool effect                               |
| ----------------- | ------------- | ----------------------------------------- |
| ancient           | base          | only v0–v2 (canonical species)            |
| every other biome | that biome id | skin clips double-weighted into take pool |

Sources live in `scripts/enemy-audio-sources.ts` (personal libraries under `F:\# AUDIO\# SAMPLES\#SFX\` and `G:\#SAMPLES\# SFX\`). Rebuild with `build-audio-pack.ps1 -EnemyOnly`.

## Spatial behavior

`DungeonWorld.getAudioFrame()` exposes fire, stone, enemy, and portal positions. Listener follows the camera. One-shots use HRTF with inverse distance.

- Torch: ref 2.2 m, max 17 m
- Pickups: ref 1.5–1.6 m, max 11–14 m
- Enemy voices: ref 1.25–2.3 m, max 13–24 m
- Doors / chest: ref 1.8–2 m, max 14–18 m
- Portal: ref 3.5 m, max 28 m

Audio arms on the first pointer or keyboard gesture. Interrupted asset loads retry on the next gesture.
