# Ambient godrays

## Contract

Ambient godrays are environment VFX. `StaticDungeonScene` places each shaft in a selected room near the ceiling and owns its lifetime with the dungeon build. The shaft is a world-space mesh; it is not a fullscreen pass, camera child, HUD layer, or post-process input.

`VolumetricBeam` keeps the shared portal/stone signal factory compatible, while ambient shafts opt into:

- `NormalBlending` so the volume settles into room surfaces instead of reading as a white overlay.
- Scene fog plus explicit `tonemapping_fragment` and `colorspace_fragment` shader chunks. The material flag alone is not treated as proof that the transform runs.
- `depthTest: true` and `depthWrite: false` so architecture occludes the light without transparent depth pollution.
- Six open crossed strata merged into one geometry: three broad planes establish the shaft and three narrow interleaved planes deepen the centre. No face encloses the camera and no circular perimeter can turn into a screen wash.
- Three vertical segments, stepped density bands, 5-bit color quantization, and a 4x4 Bayer edge sampled from local stratum UV. The shader must not sample `gl_FragCoord` for its body or dither.
- `DoubleSide` rendering because each stratum is an open plane, not a volume shell. Architecture still controls visibility through the depth buffer and scene fog.

The local mesh origin is the ceiling source (`y = 0`); the beam descends along local `-Y`. `DungeonWorld.updateEffects` continues to advance `uTime` for the shared signal profile. Ambient Bayer cells stay fixed to local UV, so camera movement cannot make them swim across the shaft.

## Budget and readability

The effect remains one mesh and one draw call per shaft. Crossed ambient strata use 36 triangles instead of the smooth profile's 320. Ambient placement stays sparse and deterministic: two shafts at normal decor density, three at high density. The shaft must remain readable at production strength without disabling depth or artificially forcing a debug opacity.

## Objective stone signals

Collectible stones use a separate four-stratum open profile. It keeps the portal's smooth beam unchanged while giving each stone a narrow world-space beacon with its own effect color. The stone itself keeps a planted pedestal and cage; only the crystal assembly floats and turns. A short inverse-square point light, an open ritual ground mark, and a small tone-mapped crown provide local readability without a generic sphere aura or broad room fill.

## Verification

Focused contract checks:

```powershell
bun test tests/lighting-integration.test.ts tests/static-dungeon-scene.test.ts
bun run typecheck:all
```

For browser proof, enter a real Play run in local Chrome and inspect the shaft from two angles plus one near/inside view. Check the wall/floor intersections, stable local dither, faceted silhouette, renderer calls/triangles, and page/console errors. Static tests prove the world-space contract; screenshots prove the rendered read.
