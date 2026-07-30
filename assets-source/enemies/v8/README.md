# Enemy atlases v8

The source pack uses one RGBA atlas for each biome with 11 rows and four 320 px
frames per row. Runtime publishes a half-size lossless WebP with 160 px cells.
`manifest.json` fixes the row order and both layouts.

## Sources

Imported source strips live at `raw/hq-strips/<enemy>.*` and the reviewed raw
atlases live under `raw/`.
Keep these files unchanged. Some imported folders had the wrong biome label.
`source-assignments.json` maps each destination biome to the reviewed source
folder without moving or renaming the import.

`source-provenance.json` records the source path, size, dimensions, and SHA-256
hash for every destination row.

## Reprocess

The packer needs Python, Pillow, Torch, torchvision, and Transformers. It loads
`ZhengPeng7/BiRefNet` on the first run. CUDA cuts the full run time.

```powershell
python scripts/pack-enemy-strips-v8.py --method hybrid --device cuda
```

The packer splits each strip, removes its source background, registers the four
frames against one shared box, and publishes half-size WebP biome atlases. Its detailed run
report and checker contacts go under `.scratch/enemies-v8/qa/hybrid/`.

## Audit

The audit only needs Python and Pillow.

```powershell
bun run audit:enemy-atlases
```

It checks all 121 rows and 484 frames, verifies dimensions and cell edges,
records hashes, and writes dark, light, and alpha review sheets under
`.scratch/enemies-v8/qa/published/`.
