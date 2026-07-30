# Ambient godrays

## Contract

Ambient godrays are environment VFX. `StaticDungeonScene` places each shaft in a selected room near the ceiling and owns its lifetime with the dungeon build. The shaft is a world-space mesh; it is not a fullscreen pass, camera child, HUD layer, or post-process input.

`VolumetricBeam` keeps the shared portal/stone signal factory compatible, while ambient shafts opt into:

- `NormalBlending` so the volume settles into room surfaces instead of reading as a white overlay.
- Scene fog and tone mapping so distance and mood affect the shaft.
- `depthTest: true` and `depthWrite: false` so architecture occludes the light without transparent depth pollution.
- World-position procedural noise. The shader must not sample `gl_FragCoord` for its body or dither.

The local mesh origin is the ceiling source (`y = 0`); the beam descends along local `-Y`. `DungeonWorld.updateEffects` advances `uTime`, which moves dust through world coordinates without locking the texture to the screen.

## Budget and readability

The effect remains one mesh and one draw call per shaft. Ambient placement stays sparse and deterministic: two shafts at normal decor density, three at high density. The shaft must remain readable at production strength without disabling depth or artificially forcing a debug opacity.

## Verification

Focused contract checks:

```powershell
bun test tests/lighting-integration.test.ts tests/static-dungeon-scene.test.ts
bun run typecheck:all
```

For browser proof, enter a real Play run in local Chrome, inspect the shaft from two angles, and check that there are no page/console errors. Static tests prove the world-space contract; screenshots prove the rendered read.
