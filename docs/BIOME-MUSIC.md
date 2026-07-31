# Biome music

Dungeon Escape uses one original looping exploration cue per campaign biome, plus a denser portal variant that starts after all four stones bind. `GameAudio` resolves the active cue from the biome id and portal state, and keeps the existing music mute preference and decode-failure fallback.

Death uses a separate melancholic bed (`Last Lantern` → `music-lose.ogg`) on the lose end screen.

## Exploration beds

| Biome | Cue | Runtime asset |
|---|---|---|
| Ancient | Buried Oath | `music-biome-ancient.ogg` |
| Molten | Cinder Pursuit | `music-biome-molten.ogg` |
| Frost | Glass Underfoot | `music-biome-frost.ogg` |
| Grim | Grave Procession | `music-biome-grim.ogg` |
| Verdant | Rootbound Lanterns | `music-biome-verdant.ogg` |
| Ash | After the Pyre | `music-biome-ash.ogg` |
| Iron | Chainworks | `music-biome-iron.ogg` |
| Obsidian | Black Glass Pulse | `music-biome-obsidian.ogg` |
| Sunken | Pressure Below | `music-biome-sunken.ogg` |
| Fungal | Spore Choir | `music-biome-fungal.ogg` |
| Backrooms | Fluorescent Recurrence | `music-biome-backrooms.ogg` |

## Portal beds (four stones bound)

Escape-rush rearrangements of each biome cue: same key/mode/lead colors, but nearly double BPM, `symphonic_32` voice ceiling, 16 bars, 16th-note motors, stacked countermelodies, and dense kit writing so the phase clearly hurries the player to the portal.

| Biome | Cue | Runtime asset | BPM (explore → portal) |
|---|---|---|---|
| Ancient | Oath Unsealed | `music-biome-ancient-portal.ogg` | 72 → 154 |
| Molten | Cinder Breakout | `music-biome-molten-portal.ogg` | 96 → 176 |
| Frost | Shatter Sprint | `music-biome-frost-portal.ogg` | 66 → 143 |
| Grim | Procession Breaks | `music-biome-grim-portal.ogg` | 74 → 158 |
| Verdant | Lanterns Ignite | `music-biome-verdant-portal.ogg` | 82 → 174 |
| Ash | Pyre Surge | `music-biome-ash-portal.ogg` | 70 → 150 |
| Iron | Chainworks Overdrive | `music-biome-iron-portal.ogg` | 92 → 176 |
| Obsidian | Black Glass Charge | `music-biome-obsidian-portal.ogg` | 78 → 166 |
| Sunken | Pressure Breach | `music-biome-sunken-portal.ogg` | 68 → 147 |
| Fungal | Spore Uprising | `music-biome-fungal-portal.ogg` | 76 → 162 |
| Backrooms | Fluorescent Pursuit | `music-biome-backrooms-portal.ogg` | 88 → 176 |

## End-screen beds

| State | Cue | Runtime asset |
|---|---|---|
| Win | existing chiptune bed | `music-win.opus` |
| Lose | Last Lantern (melancholic Neo-SPC) | `music-lose.ogg` |

## Production record

### Exploration
- Source: from-scratch deterministic Neo-SPC compositions, 8 bars, `expanded_16` voice profile.
- Editable evidence: `.scratch/audio/biome-music/<biome>/`.

### Portal + death
- Source: Neo-SPC escape-rush rearrangements / melancholic defeat bed; portal is 16 bars, `symphonic_32`.
- Rebuild portal only: `python .scratch/audio/generate-portal-and-death-music.py --portal-only` (needs Neo-SPC skill + FFmpeg on `PATH`).
- Editable evidence: `.scratch/audio/portal-music/<biome>/` and `.scratch/audio/death-music/`.
- Samples: Neo-SPC Factory Bank, CC0-1.0, procedurally synthesized; no game samples or third-party recordings.
- Runtime format: Ogg Vorbis under `public/assets/audio/dungeon/`.

The symbolic review does not replace a representative human listening pass. Keep the source compositions and rendered previews when tuning future cues.
