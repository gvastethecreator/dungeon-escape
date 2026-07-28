# Dungeon model references v2

This folder stores source concept sheets for the procedural Three.js models. It stays outside
`public/`; these images guide geometry and material work and do not ship with the game.

## Locked art contract

- One object per image.
- Exactly three consistent views of the same object: front, right profile, and rear-left
  three-quarter.
- Low-poly construction with clear primary masses, deliberate bevels, and readable joints.
- Grim pixel-PBR surfaces: dark aged oak, black iron, dull brass, worn stone, bone, ceramic,
  cloth, crystal, or ice as the object requires.
- Neutral warm-gray background, even studio light, no scenery, no props, no labels, no frame.
- Same scale, camera height, proportions, materials, wear, and part placement in all views.
- No perspective distortion in the front or right views. The rear view must expose hidden parts,
  mounts, hinges, sockets, or the back construction.
- Surface lighting may show roughness and material changes. It must not bake hard shadows,
  highlights, or ambient occlusion into the texture design.

The accepted treasure chest is the shared style anchor. New sheets may use it as a style and
layout reference, but must preserve the requested object's own shape and function.

## Runtime contract

Each rebuilt model must:

- use the shared `DungeonMaterials` roles;
- keep action pivots, sockets, names, collision data, and gameplay scale;
- keep moving parts outside static geometry merges;
- fit the budget in `manifest.json`;
- pass front, right, rear-left, back, left, and top review in `model-lab.html`;
- keep compact mode usable without new mandatory texture sets.

The source sheet drives silhouette, proportions, part hierarchy, material zones, rear detail, and
attachment design. It does not provide final normal, roughness, metalness, or depth data.

## Scope boundary

The manifest covers every discrete 3D object family used by the current world and Forge import.
Structural floor and wall tiles, liquid surfaces, smoke, flames, halos, particles, cobweb planes,
flat moss and crack decals, sprite enemies, and first-person hand sprites stay in their current
specialized systems. Their material and render quality is reviewed with the world, but they do not
benefit from image-to-object reconstruction.

## Status

`accepted-reference` means the sheet passed the three-view consistency check. `queued` means the
sheet still needs generation and visual review. A reference alone does not mark the runtime model
as rebuilt.

The manifest currently records 55 accepted sheets. Each path and SHA-256 value was checked against
its stable workspace file after the final lighting correction.
