# Treasure chest generation record

## Mode

`imagegen` generation followed by two edits. The existing clutter concept supplied broad art style
and material cues. It did not supply the chest geometry.

## Generation prompt

```text
Use case: stylized concept. Asset: a three-view reconstruction reference for img2threejs and a
real-time game. Show one iron-bound treasure chest as the same object in exactly three views:
orthographic front, orthographic right profile, and rear-left three-quarter. Use the supplied image
only as a style and material reference: dark aged oak, black iron, dull brass, restrained pixel-PBR,
and chunky game-ready construction. Place the views in three clean cells on a flat warm neutral
light-gray background with no scenery. Build a compact chest with a low arched lid, readable oak
planks, two lid straps, corner guards, side handles, a dull-brass front lock, visible rear hinges,
inset feet, deliberate bevels, and clear seams. Low-poly game turntable style with faceted forms.
Keep the same scale, camera height, padding, proportions, material placement, and wear in all views.
Use neutral soft light. Avoid photorealism, high-poly ornament, toy styling, filigree, labels, extra
objects, perspective changes, cropped silhouettes, or view-to-view design changes.
```

## Correction passes

1. The first sheet did not prove the rear hinge construction.
2. The first edit kept the rear too clean.
3. The accepted edit adds two clear black-iron horizontal hinge barrels across the rear lid/body
   seam while preserving all other geometry and material choices.

## Accepted source

- Workspace: `carpentry/treasure-chest-three-view.png`
- Original generated file: `exec-24457335-f45d-4aa9-aa3b-8a3a0f75ca1f.png`
- SHA-256: `0392347ba68cbf134bf380b34e8b20cf726f89dd9bd8dde2e4e0a32bc7e56a58`
