# Audio runtime

`GameAudio` loads the local Opus assets in `public/assets/audio/dungeon/` after a player gesture. It manages master mute, pause, group gain, limiting, and spatial one-shots.

## Mix targets

| Group           |                    Runtime gain |    Asset target | Use                                |
| --------------- | ------------------------------: | --------------: | ---------------------------------- |
| ambience        |                            0.60 |        -29 LUFS | Cave room tone and torch crackle   |
| sfx             |                            0.84 | -23 to -18 LUFS | Items, doors, damage, and portal   |
| stone footsteps | 0.84 group; 0.10–0.11 per asset |        -30 LUFS | Grounded movement on dry floors    |
| wet footsteps   | 0.84 group; 0.14–0.16 per asset |        -32 LUFS | Grounded movement over water masks |
| threat          |                            0.72 | -24 to -18 LUFS | Enemy calls, alert, and attack     |
| ui              |                            0.58 |        -24 LUFS | Menu, mode, and Forge feedback     |

Master defaults to `0.76`. A compressor with a -12 dB threshold and 12:1 ratio limits overlap. The asset process applies a pre-encode limiter so decoded Opus files remain at or below -2 dB true peak.

## Spatial behavior

`DungeonWorld.getAudioFrame()` exposes read-only fire, stone, enemy, and portal positions. `GameAudio` updates the Web Audio listener from the camera and plays HRTF one-shots with inverse-distance falloff.

- Torch crackle: 2.2 m reference distance and 17 m maximum.
- Stone and resolve pickups: 1.5 m reference distance and 11–13 m maximum.
- Enemy calls: 1.25–2.3 m reference distance and 16–24 m maximum.
- Doors: 2 m reference distance and 18 m maximum.
- Portal: 3.5 m reference distance and 28 m maximum.

Audio starts on the first pointer or keyboard gesture. If an asset request is interrupted, the next gesture retries only the missing asset.

## Asset maintenance

`scripts/build-audio-pack.ps1` prepares browser-ready 48 kHz Opus output from the selected source library. Confirm the licence for every source sample before distributing the audio pack.
