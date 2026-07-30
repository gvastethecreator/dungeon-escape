# Biome music

Dungeon Escape uses one original looping exploration cue per campaign biome. `GameAudio` resolves the active cue from the biome id and keeps the existing music mute preference and decode-failure fallback.

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

## Production record

- Source: from-scratch deterministic Neo-SPC compositions, 8 bars, `expanded_16` voice profile.
- Samples: Neo-SPC Factory Bank, CC0-1.0, procedurally synthesized; no game samples or third-party recordings.
- Validation: every plan, harness, catalog, and bank audit passed; all 11 symbolic reviews are approved.
- Mix: integrated loudness ranges from -17.82 to -16.00 LUFS; true peaks range from -2.53 to -1.25 dBFS.
- Runtime format: Ogg Vorbis under `public/assets/audio/dungeon/`.
- Editable evidence: `.scratch/audio/biome-music/<biome>/` contains composition JSON, MIDI, MP3/Ogg renders, mix report, review, and bank audit.

The symbolic review does not replace a representative human listening pass. Keep the source compositions and rendered previews when tuning future cues.
