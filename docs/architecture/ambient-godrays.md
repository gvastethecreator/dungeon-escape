# Ambient godrays

## Contract

Ambient godrays are environment VFX. `StaticDungeonScene` places each shaft in a selected room near the ceiling and owns its lifetime with the dungeon build. The shaft is a world-space mesh; it is not a fullscreen pass, camera child, HUD layer, or post-process input.

`VolumetricBeam` keeps the shared portal/stone signal factory compatible, while ambient shafts opt into:

- `NormalBlending` so the volume settles into room surfaces instead of reading as a white overlay.
- Scene fog plus explicit `tonemapping_fragment` and `colorspace_fragment` shader chunks. The material flag alone is not treated as proof that the transform runs.
- `depthTest: true` and `depthWrite: false` so architecture occludes the light without transparent depth pollution.
- An eight-sided, four-ring non-indexed shell with flat normals. Ambient geometry is deliberately polygonal; portal and stone signals retain their smoother profile.
- Four authored density bands, 5-bit color quantization, and a 4x4 Bayer transition pattern sampled from local cylindrical UV. The shader must not sample `gl_FragCoord` for its body or dither.
- `BackSide` rendering so one far shell describes the volume from outside and the containing surface remains visible when the camera enters it.
- Local camera containment detection reduces shell alpha from inside the shaft. The fake volume must not become a full-screen color wash when the player crosses it.

The local mesh origin is the ceiling source (`y = 0`); the beam descends along local `-Y`. `DungeonWorld.updateEffects` continues to advance `uTime` for the shared signal profile. Ambient Bayer cells stay fixed to local UV, so camera movement cannot make them swim across the shaft.

## Budget and readability

The effect remains one mesh and one draw call per shaft. An ambient shell is 64 triangles instead of the smooth profile's 320. Ambient placement stays sparse and deterministic: two shafts at normal decor density, three at high density. The shaft must remain readable at production strength without disabling depth or artificially forcing a debug opacity.

## Verification

Focused contract checks:

```powershell
bun test tests/lighting-integration.test.ts tests/static-dungeon-scene.test.ts
bun run typecheck:all
```

For browser proof, enter a real Play run in local Chrome and inspect the shaft from two angles plus one near/inside view. Check the wall/floor intersections, stable local dither, faceted silhouette, renderer calls/triangles, and page/console errors. Static tests prove the world-space contract; screenshots prove the rendered read.
