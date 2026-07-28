# Lighting reference generation record

## Shared contract

Each object uses one built-in `imagegen` generation call. Every call uses
`carpentry/treasure-chest-three-view.png` as Image 1, the style and layout anchor. Supporting
concepts supply only the named shape or construction cue. They do not define the final geometry.

Every accepted sheet must show one unchanged object in exactly three views, ordered left to
right: orthographic front, orthographic right profile, and rear-left three-quarter. The front and
right cameras have no perspective distortion. All three views keep the same scale, proportions,
materials, wear, piece counts, and attachment points. The rear-left view must expose the back,
mount, underside, or hidden joints needed for reconstruction.

Shared finish: low-poly grim pixel-PBR, clear primary masses, deliberate bevels, dark aged iron,
dull brass, charred wood, worn stone, or aged diffuser material as required. Each sheet uses a
flat neutral warm-gray background and even neutral studio light. No scene, floor plane, text,
labels, dividers, frame, border, watermark, extra props, cropped silhouettes, or view-to-view
redesign. Fire sheets use a small simple flame only as a VFX placement guide; solid construction
remains fully readable.

## Source roles

- `carpentry/treasure-chest-three-view.png`: shared style, materials, wear, camera, spacing, and
  sheet-layout anchor.
- `public/assets/concepts/floor-campfire-v1.jpg`: campfire footprint and material cue only.
- `public/assets/concepts/hanging-ceiling-kit-v1.jpg`: hanging oil-lantern form and suspension cue
  only.
- `public/assets/concepts/dungeon-prop-kit-v1.png`: wall bracket and worn iron construction cue
  only.
- Runtime source in `src/world/WallTorchFactory.ts`, `src/world/ImageSculptedPropKit.ts`,
  `src/world/ImageSculptedHangingKit.ts`, `src/world/FloorCampfireFactory.ts`, and
  `src/world/StaticDungeonScene.ts`: part names, counts, pivots, and mount semantics.
- `src/forge/main.js`: comparison source for the smaller Forge campfire and tripod brazier
  variants. Those alternate assemblies remain separate from the selected canonical sheets.

## Generation prompts

### wall-torch

Input images: Image 1 is the accepted treasure-chest style and three-view layout anchor. Image 2
is a wall-mounted prop construction cue only; do not copy its lantern body.

```text
Use case: stylized-concept
Asset type: three-view reconstruction reference for a procedural low-poly real-time game model
Primary request: one wall-mounted forged-iron torch sconce, shown as the same unchanged design in exactly three views
Input images: Image 1: locked style, material, wear, camera, spacing, and layout reference; Image 2: wall plate and projecting bracket construction cue only
Scene/backdrop: flat neutral warm-gray background, even neutral studio light, no floor plane
Subject: a tall shield-shaped hammered iron backplate with one short crown bar, exactly two lower mounting bolts, one welded S-curve projecting bracket, one raised tapered torch handle, a basket with exactly two circular rings and exactly two upright ribs, and one small simple flame
Style/medium: low-poly grim pixel-PBR game turntable render; chunky faceted construction; deliberate bevels; blackened rough iron with restrained edge wear
Composition/framing: wide horizontal sheet; exactly three evenly spaced views ordered left to right: orthographic front, orthographic right profile, rear-left three-quarter; equal scale and camera height; full silhouette with generous padding
Rear construction: rear-left view clearly shows the flat back of the shield plate, both bolt shanks, the bracket weld and tenon, and the basket support; every piece connects physically with no floating geometry
Constraints: preserve one identical design, proportions, part placement, two-bolt count, two-ring count, two-rib count, materials, and wear across all views; flame stays small and exposes the basket and handle
Avoid: wood body, glass lantern, chain, extra bolts, extra ribs, extra rings, smoke, sparks, glow cloud, scenery, text, labels, dividers, frame, border, watermark, perspective in front or right view, cropped parts, view-to-view changes
```

### wall-lantern

Input images: Image 1 is the accepted treasure-chest style and three-view layout anchor. Image 2
is the wall-lantern mounting and cage cue only.

```text
Use case: stylized-concept
Asset type: three-view reconstruction reference for a procedural low-poly real-time game model
Primary request: one compact wall-mounted oil lantern sconce, shown as the same unchanged design in exactly three views
Input images: Image 1: locked style, material, wear, camera, spacing, and layout reference; Image 2: wall bracket and lantern cage construction cue only
Scene/backdrop: flat neutral warm-gray background, even neutral studio light, no floor plane
Subject: one rectangular hammered black-iron wall plate, one straight projecting iron bracket, one squat dull-brass oil reservoir, a cylindrical cage with exactly two horizontal rings and exactly two fixed upright bars, one closed rectangular cage door hinged on its left edge, exactly four dull-brass through-rivets in a two-by-two pattern on the plate, one clear glass chamber, and one small simple flame
Style/medium: low-poly grim pixel-PBR game turntable render; chunky faceted parts; deliberate bevels; blackened rough iron, tarnished dull brass, slightly sooted glass
Composition/framing: wide horizontal sheet; exactly three evenly spaced views ordered left to right: orthographic front, orthographic right profile, rear-left three-quarter; equal scale and camera height; full silhouette with generous padding
Rear construction: rear-left view clearly exposes the complete flat rear face of the wall plate, four aligned rivet ends, the bracket root and weld, and the rear edge of the hinged cage door; lantern body remains firmly attached
Constraints: preserve one identical design, proportions, four-rivet count, two-ring count, two-fixed-bar count, door hinge side, materials, flame size, and wear across all views
Avoid: ceiling chain, carrying handle, open door, extra bars, extra rivets, extra rings, detached parts, smoke, sparks, glow cloud, scenery, text, labels, dividers, frame, border, watermark, perspective in front or right view, cropped parts, view-to-view changes
```

### oil-lantern

Input images: Image 1 is the accepted treasure-chest style and three-view layout anchor. Image 2
is the ceiling suspension and oil-lantern shape cue only.

```text
Use case: stylized-concept
Asset type: three-view reconstruction reference for a procedural low-poly real-time game model
Primary request: one ceiling-hung oil lantern, shown as the same unchanged design in exactly three views
Input images: Image 1: locked style, material, wear, camera, spacing, and layout reference; Image 2: hanging oil-lantern silhouette and suspension cue only
Scene/backdrop: flat neutral warm-gray background, even neutral studio light, no floor plane
Subject: one round iron ceiling mount plate, one mount eye, exactly five alternating oval chain links for the canonical 2.2-meter runtime length, one faceted iron dome cap, exactly one top cage ring and one lower cage ring, exactly four evenly spaced vertical iron cage bars, one clear cylindrical glass chamber, one dull-brass wick collar, one flattened round dull-brass oil reservoir, and one small simple flame inside the glass
Style/medium: low-poly grim pixel-PBR game turntable render; chunky faceted construction; deliberate bevels; rough black iron, tarnished dull brass, lightly sooted glass
Composition/framing: wide horizontal sheet; exactly three evenly spaced views ordered left to right: orthographic front, orthographic right profile, rear-left three-quarter; equal scale and camera height; show ceiling mount through reservoir with generous padding
Rear construction: rear-left view clearly shows rear cage bars, ring joints, reservoir seam, chain alternation, and the centered connection from ceiling plate through all five links to the cap
Constraints: preserve one identical design, five-link count, four-bar count, two-ring count, proportions, materials, flame size, suspension alignment, and wear across all views; every link interlocks correctly
Avoid: wall plate, wall bracket, carrying handle, extra chains, extra links, extra bars, extra rings, detached body, smoke, sparks, glow cloud, scenery, text, labels, dividers, frame, border, watermark, perspective in front or right view, cropped parts, view-to-view changes
```

### floor-campfire

Input images: Image 1 is the accepted treasure-chest style and three-view layout anchor. Image 2
is the campfire footprint and material cue only; its larger stone and log counts are excluded.

```text
Use case: stylized-concept
Asset type: three-view reconstruction reference for a procedural low-poly real-time game model
Primary request: one compact floor campfire assembly matching the primary FloorCampfireFactory, shown as the same unchanged design in exactly three views
Input images: Image 1: locked style, material, wear, camera, spacing, and layout reference; Image 2: campfire footprint, charred wood, ash, and stone material cue only
Scene/backdrop: flat neutral warm-gray background, even neutral studio light, no floor plane or dungeon floor
Subject: one shallow decagonal ash disc, exactly eight distinct irregular low stone blocks forming one complete ring, exactly three short charred logs arranged as a stable triangle, one dark char cap on the outward end of each log, and exactly six solid coal lumps in the center; one small simple flame marks the VFX socket without hiding the logs or coals; this is the 21-solid primary runtime assembly, excluding the smaller Forge alternate
Style/medium: low-poly grim pixel-PBR game turntable render; chunky faceted stones and logs; deliberate bevels; worn dark stone, scorched aged wood, matte black coal, restrained ember color
Composition/framing: wide horizontal sheet; exactly three evenly spaced views ordered left to right: orthographic front at a fixed slightly elevated eye level, orthographic right profile at the same height, rear-left three-quarter at the same height; equal scale; full footprint with generous padding
Rear and underside construction: rear-left view keeps all eight ring stones and three logs identifiable and shows the ash disc edge, rear stones, log overlaps, char caps, and centered coal bed; no piece floats or changes position
Constraints: preserve one identical design, eight-stone count, three-log count, three-char-cap count, six-coal count, proportions, materials, flame size, and wear across all views; solid structure is the visual focus
Avoid: extra stones, extra logs, extra coals, tall flame, multiple large flame tongues, smoke, sparks, ash particles, cookware, scenery, floor texture, text, labels, dividers, frame, border, watermark, perspective in front or right view, cropped parts, view-to-view changes
```

### brazier

Input image: Image 1 is the accepted treasure-chest style and three-view layout anchor.

```text
Use case: stylized-concept
Asset type: three-view reconstruction reference for a procedural low-poly real-time game model
Primary request: one compact floor-standing forged-iron brazier matching the StaticDungeonScene runtime, shown as the same unchanged design in exactly three views
Input images: Image 1: locked style, material, wear, camera, spacing, and layout reference
Scene/backdrop: flat neutral warm-gray background, even neutral studio light, no floor plane
Subject: the exact two-solid StaticDungeonScene assembly: one shallow octagonal forged-iron fire bowl and one centered hexagonal tapered stem directly beneath it; one small simple flame marks the VFX socket above the empty bowl
Style/medium: low-poly grim pixel-PBR game turntable render; chunky faceted construction; deliberate bevels; rough black iron with restrained rust and edge wear; restrained ember color
Composition/framing: wide horizontal sheet; exactly three evenly spaced views ordered left to right: orthographic front, orthographic right profile, rear-left three-quarter; equal scale and camera height; full silhouette with generous padding
Rear and underside construction: rear-left view clearly exposes the direct centered joint between the smooth bowl underside and the hexagonal stem; bowl remains centered and level; no extra mounting hardware
Constraints: preserve one identical design, one octagonal bowl, one hexagonal stem, two-solid count, proportions, materials, flame size, and wear across all views; solid structure remains readable
Avoid: feet, legs, coals, underside socket, chains, handles, separate pedestal, extra supports, tall flame, smoke, sparks, glow cloud, scenery, text, labels, dividers, frame, border, watermark, perspective in front or right view, cropped parts, view-to-view changes
```

### fluorescent-fixture

Input image: Image 1 is the accepted treasure-chest style and three-view layout anchor.

```text
Use case: stylized-concept
Asset type: three-view reconstruction reference for a procedural low-poly real-time game model
Primary request: one grim ceiling-mounted fluorescent light fixture matching the StaticDungeonScene runtime, shown as the same unchanged design in exactly three views
Input images: Image 1: locked low-poly finish, material wear, camera, spacing, and layout reference
Scene/backdrop: flat neutral warm-gray background, even neutral studio light, no ceiling or room scene
Subject: the exact two-solid runtime assembly: one long shallow rectangular dark painted-steel housing, 1.72 by 0.08 by 0.48 proportions, and exactly one inset rectangular aged warm-yellow diffuser panel, 1.50 by 0.035 by 0.31 proportions, mounted slightly below the luminous underside
Style/medium: low-poly grim pixel-PBR game turntable render; chunky faceted industrial construction; deliberate bevels; chipped dark steel, dust in seams, aged yellowed diffuser with restrained emission
Composition/framing: wide horizontal sheet; exactly three evenly spaced views ordered left to right: orthographic front defined as the face-on luminous underside, orthographic right profile, rear-left three-quarter exposing the top and back; equal scale and camera height; full silhouette with generous padding
Rear construction: rear-left view clearly exposes the plain flat top face of the single housing, housing depth, side edges, and the inset panel below; top and back stay smooth with no separate mount parts
Constraints: preserve one identical design, one-housing count, one-panel count, two-solid count, exact relative proportions, materials, soft emission level, and wear across all views
Avoid: visible fire, rear plate, bolts, screws, conduit inlet, tubes, chains, hanging cords, multiple panels, vents, fans, detached parts, strong bloom, room scenery, ceiling plane, text, labels, dividers, frame, border, watermark, perspective in front or right view, cropped parts, view-to-view changes
```

## Correction prompts

### wall-torch correction

Image 1 was the first generated sheet. Image 2 was the accepted chest anchor. This was the one
authorized correction for the object.

```text
Use case: precise-object-edit
Asset type: corrected three-view reconstruction reference for a procedural low-poly real-time game model
Input images: Image 1: edit target, the current wall-torch three-view sheet; Image 2: locked style and layout anchor
Primary request: correct only the wall-torch construction in all three views so it matches one coherent 10-solid runtime assembly
Required construction: one shield-shaped iron backplate, one short horizontal crown bar on the front, exactly two front-facing lower bolt heads, one front-attached S-curve projecting bracket, one raised tapered handle, exactly one upper basket ring and one lower basket ring, and exactly two upright basket ribs; keep one small simple flame
Rear correction: the rear-left three-quarter view must show a smooth plain back face of the single plate with no rear bolt shanks, keyhole, latch, weld patch, tenon, screw, rivet, slot, or added mounting hardware; the front-only bracket may appear beyond the plate edge and must join the plate on its front face; front bolt heads do not pass through the rear
Composition: preserve exactly three views ordered orthographic front, orthographic right profile, rear-left three-quarter; preserve current wide spacing, equal scale, camera height, full silhouettes, warm-gray background, and neutral studio light
Style: preserve low-poly grim pixel-PBR, blackened rough iron, restrained edge wear, chunky faceted bevels
Constraints: same unchanged object in all views; exact two-bolt, two-ring, and two-rib counts; connected geometry; no extra collars that read as basket rings
Change only the listed construction errors. No scenery, floor, text, labels, dividers, frame, border, watermark, smoke, sparks, glow cloud, perspective in front or right view, cropping, or view-to-view redesign.
```

### wall-lantern correction

Image 1 was the first generated sheet. Image 2 was the accepted chest anchor. This was the one
authorized correction for the object.

```text
Use case: precise-object-edit
Asset type: corrected three-view reconstruction reference for a procedural low-poly real-time game model
Input images: Image 1: edit target, the current wall-lantern three-view sheet; Image 2: locked style and layout anchor
Primary request: rebuild only the wall-lantern construction in all three views so it matches one coherent 12-solid runtime assembly
Required construction: one plain compact rectangular hammered-iron wall plate, one straight rectangular iron bracket projecting from the plate with no curved brace, one squat faceted dull-brass reservoir, exactly one upper cage ring and one lower cage ring, exactly two fixed upright iron cage bars, one closed thin solid rectangular iron cage door hinged on its left edge, and exactly four dull-brass front rivet heads in a two-by-two pattern on the wall plate; keep one small simple flame as a secondary VFX guide
Material correction: use only blackened rough iron and tarnished dull brass for solid construction; remove all glass, crystal, clear chamber material, carrying rings, suspension rings, and decorative dome parts
Rear correction: rear-left three-quarter view must show the single plate's smooth plain rear face with no rear rivet ends, bolt shanks, holes, slots, keyholes, weld patches, tenons, screws, or extra mounting hardware; front rivet heads stay front-only; bracket joins the plate on its front face
Composition: preserve exactly three views ordered orthographic front, orthographic right profile, rear-left three-quarter; preserve wide spacing, equal scale, camera height, full silhouettes, warm-gray background, and neutral studio light
Style: preserve low-poly grim pixel-PBR, restrained wear, chunky faceted bevels
Constraints: same unchanged object in all views; exact four-front-rivet, two-ring, two-fixed-bar, one-door, one-bracket, one-reservoir counts; door hinge remains on left in every view; connected geometry
Change only construction and material errors. No ceiling chain, curved brace, glass, extra rings, extra bars, extra rivets, scenery, floor, text, labels, dividers, frame, border, watermark, smoke, sparks, glow cloud, perspective in front or right view, cropping, or view-to-view redesign.
```

### floor-campfire correction

Image 1 was the rejected first sheet. Image 2 was the accepted chest anchor. This was the one
authorized correction for the object.

```text
Use case: precise-object-edit
Asset type: corrected three-view reconstruction reference for a procedural low-poly real-time game model
Input images: Image 1: edit target, the rejected floor-campfire three-view sheet; Image 2: locked style and layout anchor
Primary request: correct only the campfire topology so every view shows one unchanged 21-solid FloorCampfireFactory assembly with fixed, countable pieces
Required fixed layout: one shallow decagonal ash disc; exactly eight separate low ring stones with small gaps, arranged at fixed clock positions around the same circle; exactly three short charred logs in one fixed low triangular arrangement; exactly one dark char cap on the outward end of each log; exactly six separate faceted coal lumps in one fixed small hexagonal cluster; one small single flame as a VFX guide
Stone consistency: use eight distinct stones that keep identity and position through rotation: broad front stone, squat front-right stone, wide right stone, tall rear-right stone, angular rear stone, tall rear-left stone, wide left stone, low front-left stone; all eight must stay visible enough to count in every view
Log consistency: all three logs must stay fully identifiable in every view; preserve the same overlap order, lengths, char caps, grain, and angles
Coal consistency: all six coal lumps must stay separate and visible; flame and logs cannot cover or replace any coal
Composition: preserve exactly three views ordered orthographic front at a slightly elevated fixed eye level, orthographic right profile at the same height, rear-left three-quarter at the same height; preserve wide spacing, equal scale, warm-gray background, neutral studio light, and full footprint
Style: preserve low-poly grim pixel-PBR, faceted worn stone, scorched aged wood, matte black coal, restrained ember color
Constraints: same unchanged object in all three views; exact 8-stone, 3-log, 3-char-cap, 6-coal counts; no piece appears, disappears, moves, changes size, or changes wear between views
Change only topology and visibility errors. No extra stones, logs, coals, flames, smoke, sparks, particles, cookware, scene, floor texture, text, labels, dividers, frame, border, watermark, perspective in front or right view, cropping, or view-to-view redesign.
```

### floor-campfire final correction

Images 1 and 2 were the rejected corrected sheet and accepted chest anchor. The root agent
authorized this final edit after the first correction still changed topology between views.

```text
Use case: precise-object-edit.
Edit Image 1 only; Image 2 is the locked low-poly grim pixel-PBR style, wear, neutral warm-gray background, camera spacing, and three-view layout anchor.

Create one unchanged compact floor campfire construction shown in exactly three turntable views ordered left to right: orthographic front at a slightly elevated eye level, orthographic right profile at the same height, and rear-left three-quarter at the same height.

Replace the current oversized ring and log layout with this simpler fixed assembly:
- one thin low decagonal ash pan;
- exactly EIGHT separate low faceted stone curb blocks, evenly spaced at the eight compass positions, with small clear gaps; use only eight stones total;
- exactly THREE short charred logs, arranged as one low triangular stack and joined at the center; use only three logs total;
- exactly SIX small separate black faceted coal chunks in a compact hexagonal cluster beneath the logs; use only six coals total;
- no flame, smoke, sparks, embers, cookware, or other VFX, so every solid part remains readable.

The three panels must depict a rigid rotation of the exact same object. Parts may hide through correct occlusion in profile, but no stone, log, coal, ash pan, material patch, or wear mark may appear, disappear, move, resize, or change identity. Keep the same eight distinct stones and the same three-log overlap order across all views. The rear-left view must expose the ash-pan thickness and rear stones.

Keep the full silhouettes, equal scale, wide padding, neutral studio light, chunky low-poly facets, deliberate bevels, worn dark stone, scorched dark oak, matte black coal, and restrained surface detail.

Remove the current ten stones, four logs, flames, orange wire/glow lines, and floor-like gravel texture. Do not add text, labels, dividers, frames, borders, watermark, scene, floor plane, perspective distortion in the front/profile views, cropped pieces, or a view-to-view redesign.
```

## Visual review and files

All accepted workspace PNGs are 1774 by 887 pixels, RGB, with no alpha channel.

| Object              | Generated source                                | Correction source                                                                                      | Workspace file                                | SHA-256                                                            | Review                                                                                                                                                                                                                                      |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| wall torch          | `exec-d67c599f-9c66-4958-bcce-7ca8ca47306a.png` | `exec-1bcea4d9-9564-433a-8784-7130b582fc60.png`                                                        | `lighting/wall-torch-three-view.png`          | `a9c9872c79324e21d6e054c331b1dec2e2e57b5c5fc5994233eff99b96469efe` | Accepted after one correction. Smooth rear plate, front-only bolts, connected bracket, two cage rings, two ribs, and one small flame stay coherent.                                                                                         |
| wall lantern        | `exec-073e56c0-bd50-4613-8a53-665c2be75429.png` | `exec-47d6931f-2ae2-4094-8faf-7395f7609f98.png`                                                        | `lighting/wall-lantern-three-view.png`        | `ff07978630e27aecbc1418127f9aa0ffcd604bde9aeddd7fa9eb4db9276fe4a3` | Accepted after one correction. Glass, dome, hanging ring, curved brace, and rear hardware were removed. Plate, straight bracket, closed iron door, two cage rings, two fixed bars, brass reservoir, and small flame stay coherent.          |
| oil lantern         | `exec-ede5ba80-f7da-4c9e-a75e-ea484b32f9f4.png` | —                                                                                                      | `lighting/oil-lantern-three-view.png`         | `1470910a64f81d9d72bfea38eb515e3eab420dae21696096b3aaad3cf202f542` | Accepted first pass. Canonical five-link suspension, ceiling origin, four cage bars, glass, reservoir, and small flame stay aligned across three views.                                                                                     |
| floor campfire      | `exec-5ee718c9-4b1d-44b9-b033-62527af307c9.png` | `exec-77229e4d-dff0-43bd-a463-2ade03b6ed39.png`; final `exec-15657650-fe68-4992-8c7b-ec0850dc0f0f.png` | `lighting/floor-campfire-three-view.png`      | `074b23a15f41e1644b551c85c82e664811de2136d59ae0160996704e8f619642` | Accepted after a final root correction. The simpler dry assembly removes VFX occlusion, holds one low pan, an eight-position curb, a three-log triangular stack and a compact six-coal bed. Correct profile occlusion may hide rear pieces. |
| brazier             | `exec-2985abfc-5e0d-4bc0-a0af-fb7e2064c6e5.png` | —                                                                                                      | `lighting/brazier-three-view.png`             | `5efe91bc1a632068de5795402f53258bb450ce3ab9c8de0b77cd0833805dc106` | Accepted first pass. Selected StaticDungeonScene variant keeps one octagonal bowl, one centered hexagonal stem, no feet, no coals, and one small flame.                                                                                     |
| fluorescent fixture | `exec-81435232-89ab-4dff-9154-03182f7836d7.png` | —                                                                                                      | `lighting/fluorescent-fixture-three-view.png` | `9d5cd5251c3c38437e5921b1db6cf275cf86cce223f3a81937b152dc483ad61e` | Accepted first pass. One shallow housing, one inset diffuser, plain top, soft emission, and fixed proportions stay coherent.                                                                                                                |

## Manifest handoff

The generating worker did not edit the manifest. The root agent accepted all six stable files and
records their paths and hashes in the manifest.
