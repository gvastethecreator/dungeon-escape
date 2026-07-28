# Model material textures v2

These ImageGen files are full-bleed albedo masters for the shared low-poly prop roles. They contain color only: no cast light, hard highlight, text, object outline, or empty border.

`scripts/build-model-material-pbr.py` crops the generation rim, sets a measured mean value, and derives normal, roughness, height and AO maps. It keeps the source interior intact. Runtime uses mirrored repeat on every channel, which closes each edge without painting a seam through the middle of the texture.

The output manifest records source hashes, crop margin, map paths, value range and wrap mode.

The first root-bark master failed browser QA because mirrored UVs turned its bright braided waves into chevrons. The current master is an ImageGen edit with restrained longitudinal ridges. Its build samples the central 48% of the clean upper 46% to exclude the horizontal generation band and busy edges before deriving the runtime PBR channels.

The luminous-ward-gold role belongs only to the ward core. Its first ImageGen draft was rejected because vivid yellow and hard facet values looked like baked light. The accepted edit uses muted champagne color, broad clean facets and thin veins, leaving normal, roughness and AO to the derived channels.

The cured-meat role belongs only to the meat-hook haunch. ImageGen supplied a dark red, angular muscle albedo with restrained fat seams and no woven grain. The project copy keeps the source stable; the matching original remains at `C:/Users/cristian/.codex/generated_images/019fa678-ede2-78f2-9561-8501daa8fc7a/exec-0ca6e774-bd07-4451-85c6-72196392737f.png`. `imagegen-provenance.json` records its prompt contract, source name and retained original directory.

ImageGen masters stay at source resolution. The repeatable runtime maps are 512 px: this keeps low-poly grain readable while bounding the cold-load cost across the thirteen material roles.
