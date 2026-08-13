# Game music

Dungeon Escape uses original Neo-SPC looping beds that stay behind play: low energy, long rests, and no chase or fanfare writing. `GameAudio` resolves the active cue from the screen, biome, and portal state. Music group gain is 40% below the previous mix (`0.48` → `0.288`).

## Screen beds

| Screen            | Cue                 | Runtime asset             | Job                                      |
| ----------------- | ------------------- | ------------------------- | ---------------------------------------- |
| Welcome home      | Threshold Ember     | `music-menu.ogg`          | Invite, then hush under the menu         |
| Hall of Escapes   | Names in Stone      | `music-hall.ogg`          | Honor recorded names without a march     |
| Biome picker      | Choose the Descent  | `music-biome-select.ogg`  | Curious, still behind the list           |
| Win               | Open Air            | `music-win.ogg`           | Relief after escape, not a fanfare       |
| Lose              | Last Wick           | `music-lose.ogg`          | Lantern failing; death SFX stay in front |

## Exploration beds

| Biome     | Cue                  | Runtime asset               |
| --------- | -------------------- | --------------------------- |
| Ancient   | Dust Litany          | `music-biome-ancient.ogg`   |
| Molten    | Slag Breath          | `music-biome-molten.ogg`    |
| Frost     | Still Glass          | `music-biome-frost.ogg`     |
| Grim      | Bone Interval        | `music-biome-grim.ogg`      |
| Verdant   | Root Hum             | `music-biome-verdant.ogg`   |
| Ash       | Cinder Veil          | `music-biome-ash.ogg`       |
| Iron      | Bolt Murmur          | `music-biome-iron.ogg`      |
| Obsidian  | Mirror Undercurrent  | `music-biome-obsidian.ogg`  |
| Sunken    | Pressure Drift       | `music-biome-sunken.ogg`    |
| Fungal    | Spore Drift          | `music-biome-fungal.ogg`    |
| Backrooms | Fluorescent Hum      | `music-biome-backrooms.ogg` |

## Portal beds (four stones bound)

Same key, mode, and motif as the biome's exploration bed. Tempo rises by 16 BPM and the inner pulse thickens slightly so the open portal feels urgent without covering footsteps or threats.

| Biome     | Cue             | Runtime asset                      | BPM (explore → portal) |
| --------- | --------------- | ---------------------------------- | ---------------------- |
| Ancient   | Unsealed Dust   | `music-biome-ancient-portal.ogg`   | 62 → 78                |
| Molten    | Ember Path      | `music-biome-molten-portal.ogg`    | 70 → 86                |
| Frost     | Fracture Light  | `music-biome-frost-portal.ogg`     | 58 → 74                |
| Grim      | Procession Stir | `music-biome-grim-portal.ogg`      | 64 → 80                |
| Verdant   | Canopy Wake     | `music-biome-verdant-portal.ogg`   | 68 → 84                |
| Ash       | Buried Glow     | `music-biome-ash-portal.ogg`       | 60 → 76                |
| Iron      | Gear Lift       | `music-biome-iron-portal.ogg`      | 72 → 88                |
| Obsidian  | Glass Tilt      | `music-biome-obsidian-portal.ogg`  | 66 → 82                |
| Sunken    | Surface Pull    | `music-biome-sunken-portal.ogg`    | 58 → 74                |
| Fungal    | Bloom Pulse     | `music-biome-fungal-portal.ogg`    | 64 → 80                |
| Backrooms | Exit Flicker    | `music-biome-backrooms-portal.ogg` | 70 → 86                |

## Production record

- Source: from-scratch deterministic Neo-SPC compositions. Screens and exploration use `legacy_8` or `compact_12`. Portal uses `expanded_16`.
- Rebuild: `python scripts/generate-game-music.py` (needs the Neo-SPC skill, FFmpeg on `PATH`, and the render Python extras).
- Editable evidence: `.scratch/audio/soundtrack-v2/<cue>/`.
- Samples: Neo-SPC Factory Bank, CC0-1.0, procedurally synthesized; no game samples or third-party recordings.
- Runtime format: Ogg Vorbis under `public/assets/audio/dungeon/`.

The symbolic review does not replace a representative human listening pass. Keep the source compositions and rendered previews when tuning future cues.
