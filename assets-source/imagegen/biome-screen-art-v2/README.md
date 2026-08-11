# Biome screen art v2

This source set owns the 22 regenerated screen illustrations for Dungeon Escape.

- `main`: one cover for each canonical biome.
- `ending`: one result illustration for each canonical biome.
- Public output: `836x470` RGB WebP under `public/assets/ui/biome-screens/`.
- Source output: full generated PNG files under `generated/`.

## Visual contract

- Use the same small faceless adventurer in every image.
- Give the adventurer a round black head, a torn black cloak, brown boots, and one glowing stone.
- Use three promoted enemies from the correct biome as identity references.
- Combine dark pixel art, grotesque monster anatomy, and compact chibi proportions.
- Keep silhouettes readable at the mobile crop.
- Do not add text, logos, borders, UI, signatures, or watermarks.
- For `main`, place the chase on the right and keep the left third dark.
- For `ending`, place the exit on the left and keep the right third dark.

## Reference contract

Run:

```powershell
python scripts/extract-biome-screen-art-references.py
```

The script extracts the first promoted movement frame for all 121 biome-enemy identities. It reads `movement_row` from each biome animation package, then scales each crop from `160x160` to `320x320` with nearest-neighbor sampling. `references/reference-manifest.json` records the source atlas, animation package, source rectangle, and hashes.

Build the reviewed PNG sources into the public assets with:

```powershell
python scripts/build-biome-screen-art-v2.py
```

The build validates that all 22 sources exist, crops the generated `1672x941` image to `1672x940`, performs an exact nearest-neighbor reduction to `836x470`, writes compressed RGB WebP files, updates hashes in both asset manifests, and creates the two complete review sheets under `.scratch/proof/biome-screen-art-v2/`. These screen illustrations are authored directly at runtime size, so the global optimizer must preserve them instead of applying another 50% reduction.

Do not use `.scratch` enemy candidates for this set.
