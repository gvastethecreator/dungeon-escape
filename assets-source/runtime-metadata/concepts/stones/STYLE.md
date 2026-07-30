# Stone & POV art direction

**Style:** 16-bit grimdark pixel art, neutral (desaturated ash / iron / bone).

- Hard pixels, limited muted palette
- POV matting: **BiRefNet** via `scripts/birefnet-remove-bg.py` (venv-pbr)
- Magenta key helper (sheets): `scripts/key-magenta-sprites.py`
- No soft bloom / neon emissive
- Albedos use `NearestFilter` in runtime
- POV is an **oil lantern** only (no weapon — player cannot defend)

Sheets: `*-sheet.jpg` · Keyed sheets: `sprites/keyed/*-sheet.png`  
Albedos: `textures/stones/*-albedo.jpg`  
POV: `sprites/viewmodel/lantern-f{1,2,3}.png`
