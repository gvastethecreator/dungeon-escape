# Architecture reference generation record

## Mode and shared contract

All sheets used built-in `imagegen`. Each object received its own generation call. The accepted
treasure chest supplied the locked layout, low-poly finish, and material scale. Local subject
concepts supplied shape cues where listed. Every accepted file was copied from the default Codex
generated-image folder into `../architecture/` and inspected there with `view_image`.

Acceptance required one object shown as exactly three consistent views: orthographic front,
orthographic right profile, and rear-left three-quarter. Floor signals use a front view aligned to
their decorated top face, an edge profile, and a rear-left view that exposes the underside. All
sheets use a warm neutral gray background without labels, scene dressing, or frames.

## `dungeon-door`

**Mode:** generation; no edit.

**References:**

- `../carpentry/treasure-chest-three-view.png`: style and layout.
- `../../biome-doors-v1.png`: door family and material cues.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style and three-view layout anchor; Image 2 supplies dungeon-door shape and material cues only.
Primary request: show one closed double-leaf dungeon door as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: a full-height medieval dungeon door assembly with two thick aged-oak leaves, a heavy faceted worn-stone frame, a low curved masonry arch trim, black-iron straps and vertical outer stiles. Each leaf has three horizontal straps. Show clear hinge barrels and mounting plates on the rear construction. Door remains closed in all three views.
Style/medium: low-poly game model reference, chunky deliberate bevels, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, proportions, wear and part placement; full silhouette with generous padding. Front and right views must be orthographic. Rear-left view must clearly expose leaf backs, frame depth, hinges and mounts.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: dark aged oak, black iron, worn charcoal-gray stone; readable material zones and modest pixel texture.
Constraints: exactly one door identity repeated across exactly three views; no open leaf; no scenery, floor, wall, props, text, labels, dividers, frames, watermark, hard baked shadows, high-poly ornament, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Files:** original `exec-651868c2-7703-4a27-8ccb-cd6561c625a8.png`; accepted
`../architecture/dungeon-door-three-view.png`.

**Acceptance:** three views share the same closed leaves, stone arch, strap layout, center seam,
wear, and scale. Profile proves frame depth. Rear-left proves hinge barrels and rear straps.

## `office-door`

**Mode:** generation; no edit.

**References:** treasure chest style anchor and `../../biome-doors-v1.png` office-door cue.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style and three-view layout anchor; Image 2 supplies the plain yellow office double-door identity shown at bottom right.
Primary request: show one closed double-leaf worn office fire door as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: square full-height industrial office doorway, two flat painted ochre-beige metal leaves, simple dark steel rectangular frame, one horizontal black push bar on each front leaf, lower rusted kick plates, compact outer hinges. Rear construction has matching hinge barrels, reinforcement plates and plain pull hardware. No arch, stone, fantasy crest or window. Door remains closed in all views.
Style/medium: low-poly game model reference, chunky deliberate bevels, grim restrained pixel-PBR matching Image 1 while keeping the office form.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, proportions, wear and part placement; full silhouette with generous padding. Front and right views orthographic. Rear-left view clearly exposes frame depth, leaf backs, hinges and mounts.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: scuffed ochre paint, dark blackened steel, dull rust on kick plates; readable low-poly material zones and modest pixel texture.
Constraints: exactly one door identity repeated across exactly three views; no open leaf; no scenery, floor, wall, props, text, labels, dividers, frames, watermark, curved arch, medieval ornament, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Files:** original `exec-65a62fb3-6bb8-4c1a-91ab-f7344a2ac0db.png`; accepted
`../architecture/office-door-three-view.png`.

**Acceptance:** square frame, two push bars, two kick plates, hinge count, paint wear, and leaf
size remain stable. Rear-left shows pulls and rear hinges.

## `entrance-portal-gate`

**Mode:** generation followed by one rear-view edit.

**Reference:** treasure chest style anchor.

**Generation prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style, material finish and three-view layout anchor.
Primary request: show one sealed dungeon escape portal gate as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: a compact freestanding portal assembly built from two low-poly octagonal dark-stone piers on stepped round bases, faceted caps, a semicircular stone arch, and a small diamond keystone. Inside the arch: five black-iron vertical prison bars with pointed spear tips, two cross braces, a slim dark iron circular inner rim and a dim cold-blue magic veil behind the bars. Rear construction must reveal the arch depth, rim mounts, bar braces and hidden support plates. Same sealed state in all views.
Style/medium: low-poly real-time dungeon game model, chunky clear masses, deliberate bevels, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, proportions, wear and part placement; full silhouette with padding. Front and right views orthographic. Rear-left view clearly exposes back construction.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: worn charcoal stone, black iron, very restrained cool blue emissive veil; no transparent fog outside the opening.
Constraints: exactly one portal identity repeated across exactly three views; no doorway wall, room, floor, scenery, extra props, text, labels, dividers, frames, watermark, characters, open gate, missing rear bars, high-poly ornament, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Correction:** the generated third view still read as the front. One edit kept the first two views
and changed only the third view to expose rear bar faces, rear braces, rim mounts, arch depth, and
support plates.

**Files:** initial `exec-5839f3f5-086a-4ad9-9fdc-38fd157a48c2.png`; corrected original
`exec-5568d687-2591-40df-935c-63b421c280d1.png`; accepted
`../architecture/entrance-portal-gate-three-view.png`.

**Acceptance:** all views keep two piers, five bars, two braces, keystone, inner rim, and blue veil.
The third view now shows the rear fasteners and arch depth.

## `carved-pillar`

**Mode:** generation; no edit. **Reference:** treasure chest style anchor.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style, material finish and three-view layout anchor.
Primary request: show one freestanding carved dungeon pillar as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: tall low-poly octagonal worn-stone pillar. Broad octagonal stepped foot, narrow 2.35-meter shaft, broad octagonal capital. One dark-stone carved collar near the base and one under the capital. Eight slim recessed dark vertical flutes run down the shaft, one on each face. Back construction continues the same eight-sided pattern and reveals full collar depth. No attached wall.
Style/medium: low-poly real-time dungeon game model, clear primary masses, deliberate bevels, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, proportions, wear and exact flute placement; full silhouette with padding. Front and right views orthographic. Rear-left view exposes back faces and carving continuity.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: worn medium-gray stone body, darker charcoal stone collars and recessed flutes, chipped edges kept coarse and game-ready.
Constraints: exactly one pillar identity repeated across exactly three views; no scenery, floor, wall, rubble, vines, skulls, text, labels, dividers, frames, watermark, high-poly ornament, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Files:** original `exec-7f2c6f14-68f7-4402-8dee-1143a23b1966.png`; accepted
`../architecture/carved-pillar-three-view.png`.

**Acceptance:** eight-sided base, shaft, collars, capital, flute width, and wear match across views.

## `grave-marker`

**Mode:** generation; no edit. **Reference:** treasure chest style anchor.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style, material finish and three-view layout anchor.
Primary request: show one dungeon grave marker as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: compact freestanding beveled dark-stone grave slab, 1.4 meters tall, straight lower sides and a simple rounded pointed arch top. The slab sits in one broad low rectangular worn-stone plinth. Front face has one raised black-iron long vertical sigil crossed by one short horizontal iron bar. Rear face is plain chipped stone with two simple recessed reinforcement grooves and visible joint into the base. Clear slab thickness.
Style/medium: low-poly real-time dungeon game model, chunky bevels, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, proportions, wear and part placement; full silhouette with padding. Front and right views orthographic. Rear-left view clearly exposes the plain back, slab thickness and base joint.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: worn charcoal stone slab, lighter gray stone plinth, black iron cross sigil.
Constraints: exactly one grave marker identity repeated across exactly three views; no ground, soil, grass, candles, skulls, bones, scene, text, letters, labels, dividers, frames, watermark, elaborate statue, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Files:** original `exec-54193ae6-44d6-40a6-af08-4850f06894c3.png`; accepted
`../architecture/grave-marker-three-view.png`.

**Acceptance:** slab arch, base, iron cross, chips, thickness, and rear grooves remain consistent.

## `coffin`

**Mode:** generation followed by two geometry corrections. **Reference:** treasure chest style anchor.

**Generation prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style, material finish and three-view layout anchor.
Primary request: show one closed stone coffin-sarcophagus as exactly the same object in exactly three views: orthographic front from the narrow foot end, orthographic right profile along the long side, and rear-left three-quarter from the raised head end.
Subject: low horizontal faceted coffin silhouette: narrow foot, broad shoulders, tapered raised head end. Thick dark-stone hull, separate lighter worn-stone beveled lid, three black-iron straps crossing the lid width at fixed intervals. Lid top has one raised dull-brass long central sigil crossed by one short brass bar. Rear-left view must reveal the full lid top, head-end bevel, strap wrap and seam between lid and hull. Closed in all views.
Style/medium: low-poly real-time dungeon game model, chunky deliberate bevels, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, proportions, wear and exact strap placement; full silhouette with padding. Front and right views orthographic.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: charcoal stone hull, worn gray stone lid, black iron straps, dull brass sigil.
Constraints: exactly one coffin identity repeated across exactly three views; no body, bones, handles, open lid, altar, floor, scene, candles, text, labels, dividers, frames, watermark, gothic sculpture, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Corrections:** the first hull read as a rectangular chest. The first edit changed hull, lid, and
bottom rim toward the eight-sided coffin plan. A final review still found straight long sides, so a
second edit strengthened the narrow foot, long taper, shoulder cuts, and narrow head across all
three views. Straps, sigil, materials, cameras, and layout remained fixed.

**Files:** initial `exec-8010d25d-3207-4bc1-84ae-a8e042685c36.png`; first correction
`exec-ceec6b10-06b4-4d0e-8b0a-72b4c18127c4.png`; final correction
`exec-10d080bc-ab9b-4e54-bbd3-b39f7fffe67b.png`; accepted
`../architecture/coffin-three-view.png`.

**Acceptance:** three straps, lid seam, raised brass sigil, low height, and material zones match.
The corrected three-quarter view proves the tapered plan.

## `reliquary-altar`

**Mode:** generation followed by one small part correction.

**References:** treasure chest style anchor and repo-root path
`public/assets/concepts/reliquary-altar-reference.png` as subject identity.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked three-view layout and pixel-PBR style anchor. Image 2 is the subject identity reference and must control the altar silhouette and parts.
Primary request: show the reliquary altar from Image 2 as exactly the same closed object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject invariants: broad two-step chipped stone plinth; low oak cabinet with black-iron corner and cross straps; two closed front doors with their own iron stiles, two horizontal straps and dull-brass ring pulls; thick stone altar ledge; tall peaked shrine back with central dark pointed niche, stone uprights and side pilasters; steep low-poly pediment; three iron finials; two empty iron candle cups on the ledge. Rear construction must expose the flat oak-and-iron cabinet back, braces supporting the shrine back, pediment depth, door hinge barrels and candle-cup mounts. No candles.
Style/medium: low-poly real-time dungeon game model, chunky deliberate bevels, grim restrained pixel-PBR matching both references.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, proportions, materials, wear and part placement; full silhouette with padding. Front and right views orthographic. Rear-left view must clearly show hidden construction.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: aged dark oak, black iron, dull brass, worn gray and charcoal stone.
Constraints: exactly one reliquary altar identity repeated across exactly three views; doors closed in all views; no floor, wall, candles, bones, books, offerings, scene, text, labels, dividers, frames, watermark, extra ornaments, high-poly filigree, perspective distortion in front/profile, cropped finials, or view-to-view design changes.
```

**Correction:** the initial sheet placed pointed candle-like parts inside both candle cups. One edit
removed only those two parts and kept the shallow iron cups, their mounts, and all architecture.

**Files:** initial `exec-b08287b0-cdea-4c6b-938d-f9c1f50060cd.png`; corrected original
`exec-de13d4f5-ed0e-46e5-8062-ac322840e199.png`; accepted
`../architecture/reliquary-altar-three-view.png`.

**Acceptance:** cabinet doors, pulls, ledge, niche, pilasters, pediment, finials, and rear braces match.
The two ledge cups are empty. The right profile proves depth. The rear-left view exposes the cabinet
and shrine support structure.

## Signal family

All five signals used the chest as the finish anchor. After the first signal passed review,
`tomb-room-signal-three-view.png` supplied the family thickness, camera layout, and rear-mount
scheme. `elite-room-signal-three-view.png` supplied the same scheme for the boss call.

### `tomb-room-signal`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Primary request: show one tomb-room floor signal as exactly the same object in exactly three views: orthographic front aligned square to its decorated top face, orthographic right profile showing its thin edge, and rear-left three-quarter tilted enough to expose the underside and back construction.
Subject: one thin circular dark-stone inlay, an open ring rather than a solid disk. Four narrow low-relief radial rune bars cross the ring at the four cardinal directions. Funeral identity: muted olive-gray stone with faint restrained olive emissive cuts. Coarse bevels, chipped outer rim, dark plain underside, four shallow rear mounting recesses. Thickness remains very low, suitable for a floor marker.
Style/medium: low-poly real-time dungeon game model, crisp primary shape, grim restrained pixel-PBR matching the style anchor.
Composition/framing: three evenly spaced views in one horizontal sheet, same object scale, proportions, rune placement, chips, materials and wear; full silhouette with padding. Front and right views orthographic.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Constraints: exactly one tomb signal identity repeated across exactly three views; exactly one outer ring and four radial bars; no central icon, grave slab, skull, bones, floor tile, scene, props, text, letters, labels, dividers, frames, watermark, bright neon, hard shadow, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Files:** original `exec-8afa3cd8-3eb6-4641-bc80-77ee9bcb5d37.png`; accepted
`../architecture/tomb-room-signal-three-view.png`.

**Acceptance:** one open ring, four narrow olive runes, thin edge, and four rear recesses remain stable.

### `treasure-room-signal`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Primary request: show one treasure-room floor signal as exactly the same object in exactly three views: orthographic front aligned square to its decorated top face, orthographic right profile showing its thin edge, and rear-left three-quarter tilted enough to expose underside and back construction.
Subject: one thin open circular dark-stone inlay. Four broad low-relief radial rune bars cross the ring at the four cardinal directions. Treasure identity: dull brass face plates inset into each bar, restrained amber emissive seams, warm brown-black worn stone. Coarse bevels, chipped outer rim, dark plain underside, four shallow rear mounting recesses. Thickness remains very low for a floor marker. No center disk or icon.
Style/medium: low-poly real-time dungeon game model, crisp primary shape, grim restrained pixel-PBR matching the style anchor.
Composition/framing: three evenly spaced views in one horizontal sheet, same object scale, proportions, rune placement, chips, materials and wear; full silhouette with padding. Front and right views orthographic.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Constraints: exactly one treasure signal identity repeated across exactly three views; exactly one outer ring and four radial bars; no chest, coins, gem, central icon, floor tile, scene, props, text, letters, labels, dividers, frames, watermark, bright gold, hard shadow, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Files:** original `exec-a4ace0dc-b95c-4c86-a79b-676d506a4548.png`; accepted
`../architecture/treasure-room-signal-three-view.png`.

**Acceptance:** four broad amber runes, warm material identity, edge thickness, and rear recesses match.

### `shrine-room-signal`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Primary request: show one shrine-room floor signal as exactly the same object in exactly three views: orthographic front aligned square to its decorated top face, orthographic right profile showing its thin edge, and rear-left three-quarter tilted enough to expose underside and back construction.
Subject: one thin open circular dark-stone inlay. Exactly six broad low-relief radial rune bars cross the ring at even 60-degree intervals. Shrine identity: cold blue-gray face plates inset into all six bars, restrained desaturated blue-violet emissive seams, slate-black worn stone. Coarse bevels, chipped outer rim, dark plain underside, six shallow rear mounting recesses. Thickness remains very low for a floor marker. No center disk or icon.
Style/medium: low-poly real-time dungeon game model, crisp primary shape, grim restrained pixel-PBR matching the style anchor.
Composition/framing: three evenly spaced views in one horizontal sheet, same object scale, proportions, six-rune placement, chips, materials and wear; full silhouette with padding. Front and right views orthographic.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Constraints: exactly one shrine signal identity repeated across exactly three views; exactly one outer ring and exactly six radial bars; no center disk, altar, crystal, star, floor tile, scene, props, text, letters, labels, dividers, frames, watermark, bright neon, hard shadow, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Files:** original `exec-b7965905-b30b-4f29-85f4-70fa982c64e1.png`; accepted
`../architecture/shrine-room-signal-three-view.png`.

**Acceptance:** six evenly spaced blue-violet runes, thin edge, and six rear mounts match.

### `elite-room-signal`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Primary request: show one elite-room floor signal as exactly the same object in exactly three views: orthographic front aligned square to its decorated top face, orthographic right profile showing its thin edge, and rear-left three-quarter tilted enough to expose underside and back construction.
Subject: one thin open circular dark-stone inlay. Exactly four broad low-relief radial rune bars cross the ring at the four cardinal directions. Elite combat identity: dark forged-iron face plates, restrained deep blood-red emissive seams, red-brown heat wear on black stone. Each bar has a blunt angular shield-like cap. Coarse bevels, chipped outer rim, dark plain underside, four shallow rear mounting recesses. Thickness remains very low for a floor marker. No center disk or icon.
Style/medium: low-poly real-time dungeon game model, crisp primary shape, grim restrained pixel-PBR matching the style anchor.
Composition/framing: three evenly spaced views in one horizontal sheet, same object scale, proportions, four-rune placement, chips, materials and wear; full silhouette with padding. Front and right views orthographic.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Constraints: exactly one elite signal identity repeated across exactly three views; exactly one outer ring and exactly four radial bars; no center disk, weapon, skull, crown, floor tile, scene, props, text, letters, labels, dividers, frames, watermark, bright neon, orange lava, hard shadow, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Files:** original `exec-81de31ee-cab3-41df-a922-b4a1e302516c.png`; accepted
`../architecture/elite-room-signal-three-view.png`.

**Acceptance:** four angular crimson runes, ring wear, edge thickness, and rear sockets match.

### `boss-room-signal`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Primary request: show one boss-room floor signal as exactly the same object in exactly three views: orthographic front aligned square to its decorated top face, orthographic right profile showing its thin edge, and rear-left three-quarter tilted enough to expose underside and back construction.
Subject: one broad thin open circular dark-stone outer inlay plus one separate small open inner ring centered inside it. Exactly eight broad low-relief radial rune bars cross the outer ring at even 45-degree intervals. Boss identity: reinforced black-iron face plates, restrained dark crimson emissive seams, scorched red-brown wear on black stone. Coarse bevels, chipped outer rim, dark plain underside, eight shallow rear mounting recesses and four small mounts under the inner ring. Thickness remains very low for a floor marker.
Style/medium: low-poly real-time dungeon game model, crisp primary shape, grim restrained pixel-PBR matching the style anchor.
Composition/framing: three evenly spaced views in one horizontal sheet, same object scale, proportions, exact eight-rune placement, two rings, chips, materials and wear; full silhouette with padding. Front and right views orthographic.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Constraints: exactly one boss signal identity repeated across exactly three views; exactly one outer ring, exactly one small inner ring and exactly eight radial bars; inner ring stays physically separate from outer ring except for discreet rear mounts; no filled center disk, skull, crown, star, weapon, floor tile, scene, props, text, letters, labels, dividers, frames, watermark, bright neon, orange lava, hard shadow, perspective distortion in front/profile, cropped parts, or view-to-view design changes.
```

**Files:** original `exec-c56ec48d-1f84-43ac-910d-88739dd34f83.png`; accepted
`../architecture/boss-room-signal-three-view.png`.

**Acceptance:** one outer ring, one separate inner ring, eight crimson runes, edge thickness, and rear
mount pattern match across all views.

## Integrity check

All accepted PNGs are `1774x887`, RGB, and readable by Pillow.

| Object                 | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `dungeon-door`         | `bfc9470199d2a107879fcccaeda3b24fe4cd0af795e096d138800917a123efea` |
| `office-door`          | `87a29d36f9f98f237b62ee92490933886f7c36a471c618d0139318114317b782` |
| `entrance-portal-gate` | `301cac3e2706adc183336cd5794a1b4e8476e3f494d17293e52033130c8cd038` |
| `carved-pillar`        | `b07e16d66fd8b873281fe9e8b5455ce0f0056ac886b7cda78aac6dcc99665f4a` |
| `grave-marker`         | `59af1499b09d26e976eb6662eadeb7ea24a5b588f006f8237304a797889c49b9` |
| `coffin`               | `28e285f318df593914f33d9ee6d736cb99ab52db6541124552b4eeef654119b2` |
| `reliquary-altar`      | `5cb4640c209a34e9cccb9fbff7de0506cd6a3e3cb25e1462d20ca1b5b9a04cdc` |
| `tomb-room-signal`     | `d8c46d037cfa184b724a279ebb82099b1691c092eb59c36449f8a335669cb79d` |
| `treasure-room-signal` | `dbd22ad290343c8bc30c698b05f785e99c4b676d1bd3355f9f0e2b174efff5b3` |
| `shrine-room-signal`   | `21307bd4503c6c17f27b835b4dc3b16e721e6ca5e976387014885f74fd4c2c36` |
| `elite-room-signal`    | `386e92d31eff1bffacd45e8b2f250249fa13abf96dcee5909e585d7f741a687a` |
| `boss-room-signal`     | `570fa7b772d89b1bb577c6fab073d5bdba80a67dacea501643a80acbccabbaec` |
