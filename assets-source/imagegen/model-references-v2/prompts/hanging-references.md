# Hanging reference generation record

## Mode and shared contract

All seven sheets used built-in `imagegen`, with one generation call per object and no edit pass.
The accepted treasure chest supplied the locked three-view layout, low-poly finish, material scale,
and warm neutral background. The hanging-ceiling concept supplied subject, material, and mounting
cues. Runtime factories were read only to keep each reference close to the current part layout.

Each accepted sheet shows one object in exactly three views: orthographic front, orthographic right
profile, and rear-left three-quarter. Review required a complete ceiling origin, a complete lower
silhouette, useful rear construction, stable part placement, a plain warm gray background, and no
text, scene, frame, or floating part. Every accepted file was copied from the Codex generated-image
folder into `../hanging/` and checked with `view_image`.

Shared references:

- `../carpentry/treasure-chest-three-view.png`: style and three-view layout anchor.
- `../../../../public/assets/concepts/hanging-ceiling-kit-v1.jpg`: hanging subject, mounting, and
  material cues.

## `iron-cage`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style and three-view layout anchor. Image 2 supplies hanging iron-cage material, ceiling-mount and construction cues only.
Primary request: show one empty hanging iron cage as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: compact cylindrical low-poly black-iron cage hanging from one round ceiling mount plate, one anchor eye and four alternating oval chain links. Cage has one thick top ring, one mid hoop, one slightly smaller bottom ring, seven evenly spaced vertical bars, and one solid shallow floor pan. Front has a narrow barred door seam and simple vertical hinge plate. Rear construction shows the opposite bar spacing, floor-pan underside, ring joins and chain attachment. Full ceiling origin and full cage bottom visible. Empty interior.
Style/medium: low-poly real-time dungeon game model, chunky readable joints and deliberate bevels, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, chain length, proportions, bar count, wear and part placement. Front and right views orthographic. Rear-left view exposes rear joins and underside. Generous padding around ceiling mount and cage.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: blackened iron with dull rust and worn edges; no other material.
Constraints: exactly one cage identity repeated across exactly three views; exactly seven vertical bars and one continuous chain; no prisoner, skeleton, padlock, floor, wall, scene, props, text, labels, dividers, frames, watermark, floating parts, detached links, perspective distortion in front/profile, cropped ceiling mount, cropped floor pan, or view-to-view design changes.
```

**Corrections:** none. The first pass already kept the mount, chain, cage rings, door, floor pan,
and rear construction connected and in frame.

**Files:** original `exec-77f619b6-c90f-4b4d-a6c3-15f26b5c2721.png`; accepted
`../hanging/iron-cage-three-view.png`.

**Acceptance:** the three views keep the same round mount, four-link drop, cylindrical cage,
door hardware, mid hoop, lower pan, rust pattern, and scale. The rear-left view exposes the lower
pan underside and rear bar joins.

## `tattered-banner`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style and three-view layout anchor. Image 2 supplies the tattered red hanging-banner material, ceiling-mount and construction cues only.
Primary request: show one tattered hanging banner as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: one compact dungeon banner hanging from one round black-iron ceiling plate. Two short iron hanger rings support one horizontal dark-oak rod. The rod has exactly two dull-brass end finials. One deep oxblood cloth panel hangs from exactly two iron loops around the rod. The panel is a simple low-poly sheet with four uneven attached fray strips along the bottom. Front is blank. Rear shows a plain stitched top sleeve, back cloth surface, loop joins and all ceiling hardware. Full ceiling origin and full frayed bottom visible.
Style/medium: low-poly real-time dungeon game model, chunky readable joints and deliberate bevels, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, hanging length, proportions, folds, tears, wear and part placement. Front and right views orthographic. Rear-left view exposes back seams, rod joins and cloth thickness. Generous padding around ceiling plate and frayed hem.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: blackened iron, dark weathered oak, dull aged brass and heavy deep-oxblood cloth with worn edges.
Constraints: exactly one banner identity repeated across exactly three views; blank cloth with no emblem; exactly one continuous panel, two support loops, two rod finials and four attached bottom frays; no writing, symbols, characters, wall, floor, scene, extra props, text, labels, dividers, frames, watermark, floating parts, detached strips, perspective distortion in front/profile, cropped ceiling mount, cropped hem, or view-to-view design changes.
```

**Corrections:** none. The first pass kept the cloth blank, the hardware connected, and the frayed
hem attached. No loose cloth strip or mount needed repair.

**Files:** original `exec-b854e8d3-3d10-4683-95ad-cea01fdd2200.png`; accepted
`../hanging/tattered-banner-three-view.png`.

**Acceptance:** mount, support chains, rod, two finials, two loops, cloth shape, wear, and length
remain stable. The profile proves cloth thickness; the rear-left view shows the stitched sleeve and
rear loop mounts.

## `meat-hooks`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style and three-view layout anchor. Image 2 supplies the hanging meat-hook rack, metal, meat and ceiling-construction cues only.
Primary request: show one hanging meat-hook rack as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: one compact dungeon hook rack suspended from one round black-iron ceiling plate by exactly two short alternating-link chain supports. A single horizontal black-iron bar carries exactly three large open S-hooks. The left hook holds one small dark-red cured meat haunch with one short pale bone stub; the center and right hooks are empty. Show welded hook collars, bar end caps, rear chain joins, open hook shape and ceiling bolts. Every hook and the meat must connect physically. Full ceiling origin and full hook tips visible.
Style/medium: low-poly real-time dungeon game model, chunky readable joints and deliberate bevels, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, chain length, proportions, hook count, meat placement, wear and part placement. Front and right views orthographic. Rear-left view exposes back welds, bar depth, chain joins and rear of the meat. Generous padding around ceiling plate and hook tips.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: blackened iron with dull rust and worn edges, dark cured meat, short ivory bone.
Constraints: exactly one rack identity repeated across exactly three views; exactly three S-hooks and one meat haunch on the same left hook in every view; no blood drips, gore pile, extra meat, extra hooks, rope, characters, wall, floor, scene, extra props, text, labels, dividers, frames, watermark, floating parts, detached chain links, perspective distortion in front/profile, cropped ceiling mount, cropped hook tips, or view-to-view design changes.
```

**Corrections:** none. Review found one continuous mount-and-bar assembly, three connected hooks,
and one tied haunch on the same outer hook in every view.

**Files:** original `exec-334ea92d-b25d-4653-b7a0-97e84b067f49.png`; accepted
`../hanging/meat-hooks-three-view.png`.

**Acceptance:** ceiling plate, twin support chains, bar collars, end caps, three hooks, and one meat
haunch remain stable. The profile compresses the bar without hiding the hook opening or meat
attachment. The rear-left view proves welds and bar depth.

## `bone-mobile`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style and three-view layout anchor. Image 2 supplies the bone-mobile, rope, skull and ceiling-knot construction cues only.
Primary request: show one hanging bone mobile as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: one compact dungeon bone mobile tied to one rough dark-wood ceiling knot. Exactly four coarse brown rope strands hang from the knot at distinct fixed points. The left-front strand holds one small animal-like skull; each of the other three strands holds one long pale bone with two clear joint knobs. All rope ends wrap and knot around the bones. Show the ceiling fastening, rear knot, rope routing, skull back and bone backs. Full ceiling origin and all lowest bones visible.
Style/medium: low-poly real-time dungeon game model, chunky readable joints and deliberate bevels, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, rope length, skull placement, bone count, wear and part placement. Front and right views orthographic. Rear-left view exposes back knots, rear skull form and strand depth. Generous padding around ceiling knot and lowest bone.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: dry dark rope, rough dark oak knot, aged ivory bones with dirt in recesses.
Constraints: exactly one mobile identity repeated across exactly three views; exactly four ropes, one skull and three long bones; all parts tied and connected; no extra skull, extra bones, feathers, charms, metal, characters, wall, floor, scene, extra props, text, labels, dividers, frames, watermark, floating parts, detached ropes, perspective distortion in front/profile, cropped ceiling knot, cropped bones, or view-to-view design changes.
```

**Corrections:** none. The first pass kept four tied strands, one skull, and three long bones, with
all knots and the ceiling block visible.

**Files:** original `exec-212d31a3-00e8-49c5-8525-85f92633eaf1.png`; accepted
`../hanging/bone-mobile-three-view.png`.

**Acceptance:** ceiling block, large wrap knot, four rope routes, skull position, three bones, dirt,
and scale remain stable. The rear-left view exposes the skull back and rear rope wraps.

## `root-cluster`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style and three-view layout anchor. Image 2 supplies the ceiling root-cluster silhouette, bark, moss and construction cues only.
Primary request: show one hanging root cluster as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: one compact dead root cluster growing downward from one thick cut woody ceiling crown. Exactly six curved tapering roots branch from the same solid crown, bend downward at distinct fixed angles, and end in blunt low-poly tips. Exactly three small dark-green moss clumps grip the crown and root junctions. Show the flat upper ceiling-contact face, underside fork, rear root joins, bark seams and all root backs. Every root must merge physically into the crown. Full ceiling origin and all root tips visible.
Style/medium: low-poly real-time dungeon game model, chunky readable joints and deliberate faceting, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, crown shape, root count, curves, moss placement, wear and part placement. Front and right views orthographic. Rear-left view exposes back joins, rear bark and underside fork. Generous padding around ceiling crown and lowest tips.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: dry near-black brown bark, worn cut wood at the ceiling contact, sparse dull dark-green moss.
Constraints: exactly one root-cluster identity repeated across exactly three views; exactly six connected main roots and three attached moss clumps; no trunk rising above the mount, leaves, vines, ground, rocks, wall, floor, scene, extra props, text, labels, dividers, frames, watermark, floating roots, detached moss, perspective distortion in front/profile, cropped ceiling crown, cropped roots, or view-to-view design changes.
```

**Corrections:** none. Review found one solid crown, only attached root limbs, and moss fixed to the
crown or fork faces. No root or moss clump floats away from the body.

**Files:** original `exec-8acb670f-bd4b-4a94-841b-7cc9eadf12d2.png`; accepted
`../hanging/root-cluster-three-view.png`.

**Acceptance:** cut crown, main root bends, bark facets, moss placement, tip height, and scale remain
stable. The profile and rear-left views expose the fork depth, back joins, and flat ceiling-contact
face.

## `hanging-chain`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style and three-view layout anchor. Image 2 supplies the dungeon hanging-metal, ceiling-mount and wear cues only.
Primary request: show one hanging iron chain as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: one straight compact dungeon chain hanging from one round black-iron ceiling plate with four bolts and one thick welded anchor eye. Exactly nine chunky oval links form one continuous chain, alternating orientation by ninety degrees. The ninth lower link connects to one simple heavy open iron end hook. Show ceiling-plate underside, anchor weld, link weld seams, hook back and hook opening. Every link must pass through the next with no gaps. Full ceiling origin and full hook tip visible.
Style/medium: low-poly real-time dungeon game model, chunky readable joints and deliberate bevels, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, link count, link orientation, chain length, hook shape, wear and part placement. Front and right views orthographic. Rear-left view exposes rear plate, weld seams, link depth and back of hook. Generous padding around ceiling plate and hook tip.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: blackened iron with dull rust, rough pitting and worn edges.
Constraints: exactly one chain identity repeated across exactly three views; exactly nine connected oval links and one connected end hook; no branching, rope, weight, cage, wall, floor, scene, extra props, text, labels, dividers, frames, watermark, floating links, detached hook, fused impossible links, perspective distortion in front/profile, cropped ceiling plate, cropped hook, or view-to-view design changes.
```

**Corrections:** none. The first pass preserved one continuous chain, alternating link planes, and
one connected hook. No detached or fused link needed an edit.

**Files:** original `exec-529a7ad0-93f1-4609-a79a-e25b49e13331.png`; accepted
`../hanging/hanging-chain-three-view.png`.

**Acceptance:** ceiling plate, bolts, anchor, chain length, alternating links, hook shape, wear, and
scale remain stable. The profile proves link rotation; the rear-left view shows weld seams and the
hook back.

## `hanging-vine`

**Mode:** generation; no edit.

**Prompt:**

```text
Use case: stylized-concept
Asset type: three-view game model reconstruction reference
Input images: Image 1 is the locked style and three-view layout anchor. Image 2 supplies the dungeon ceiling-root, hanging organic material and wear cues only.
Primary request: show one hanging vine as exactly the same object in exactly three views: orthographic front, orthographic right profile, and rear-left three-quarter.
Subject: one long dead dungeon vine growing downward from one compact knotted woody ceiling root. A single continuous thick main stem follows one gentle S curve and ends in one blunt tapered tip. Exactly three short attached side tendrils emerge at fixed heights, each with one simple pointed low-poly dark leaf. Show the flat ceiling-contact face, rear knot, stem back, branch joins and leaf backs. Every tendril and leaf must connect physically to the main stem. Full ceiling origin and lowest tip visible.
Style/medium: low-poly real-time dungeon game model, chunky readable joints and deliberate faceting, grim restrained pixel-PBR matching Image 1.
Composition/framing: three evenly spaced views in one horizontal sheet, same scale, camera height, stem curve, tendril count, leaf placement, wear and part placement. Front and right views orthographic. Rear-left view exposes rear knot, branch joins, stem depth and leaf backs. Generous padding around ceiling root and lowest tip.
Scene/backdrop: plain warm neutral gray studio background, even soft light.
Materials/textures: dry dark-brown fibrous wood, sparse desaturated olive leaves with worn edges.
Constraints: exactly one vine identity repeated across exactly three views; exactly one continuous main stem, three connected tendrils and three connected leaves; no bundle of vines, rope, chain, flowers, fruit, wall, floor, tree canopy, scene, extra props, text, labels, dividers, frames, watermark, floating tendrils, detached leaves, perspective distortion in front/profile, cropped ceiling root, cropped tip, or view-to-view design changes.
```

**Corrections:** none. Review found one continuous stem, three connected leaf tendrils, and no
floating leaf or cut branch. The ceiling knot and lower tip remain fully visible.

**Files:** original `exec-3618c566-006b-4b41-8813-b0efe8a6bee3.png`; accepted
`../hanging/hanging-vine-three-view.png`.

**Acceptance:** ceiling knot, S curve, three leaf positions, side joins, bark facets, lower tip, and
scale remain stable. The profile proves the thin side spread; the rear-left view shows the root and
leaf backs.

## Accepted-file integrity

| Object            | Dimensions  | Mode | SHA-256                                                            |
| ----------------- | ----------- | ---- | ------------------------------------------------------------------ |
| `iron-cage`       | 1774 x 887  | RGB  | `712d319ecfdfb01efdddfbc9c9480de3a06acf6e9bc060d4fd5d79801024a295` |
| `tattered-banner` | 1536 x 1024 | RGB  | `b2346914ec2bb43e42b34e95d211967b409e96e2b9ac107dd4de96636fd7a642` |
| `meat-hooks`      | 1774 x 887  | RGB  | `fdb36a3a844c051b70c6ccae85095d4a34ccbadcd4e78690fb52ae1fcfc54d32` |
| `bone-mobile`     | 1774 x 887  | RGB  | `697238b18435879733e85ff8079fa9a97cb5900bd9be6f05ba65789c659cbee8` |
| `root-cluster`    | 1774 x 887  | RGB  | `c709b912c5f81083c20faffe3beb6060bf21d6b850bdf882642c0df29e55a958` |
| `hanging-chain`   | 1717 x 916  | RGB  | `c1b8fce925f2aea6a3baefa0f8c849be1d3047e79b6e9deeb1c9a2ef508c6df3` |
| `hanging-vine`    | 1717 x 916  | RGB  | `2b4adfc1b4fb24e4f0a7f6988b45178fe671811e8c3d66538a991db02a921c69` |
