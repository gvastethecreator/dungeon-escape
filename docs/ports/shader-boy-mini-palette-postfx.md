# Shader Boy Mini Palette Post Effect Port

## Source

- Repository: `X:\shader-boy-mini`
- Commit: `4d58a9126626e75b89ce6d78a3a57820de431e0e`
- License file: none found at the repository root
- Source files:
  - `src/utils/shaders/Dithering/DitheringShader.ts`
  - `src/utils/math/paletteMatching.ts`
  - `src/utils/math/sourceProcessingTransforms.ts`
  - `src/constants/palettes.ts`

Both repositories belong to the same project owner. This port uses the source files as an internal reference.

## Port Ledger

| Item                                  | Result          | Local owner                                                                   |
| ------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| Bayer 4x4 threshold                   | Adapted         | `src/systems/PovPostFx.ts`                                                    |
| Oklab palette distance                | Adapted         | `src/systems/PovPostFx.ts`                                                    |
| Nearest-pair ordered palette blend    | Local extension | `src/systems/PovPostFx.ts`                                                    |
| Shadow, flat-field, and edge guards   | Local extension | `src/systems/PalettePostEffect.ts`, `src/systems/PovPostFx.ts`                |
| Classic palette colors                | Copied          | `src/systems/PalettePostEffect.ts`                                            |
| Palette selection and persistence     | Local extension | `src/game/UserSettings.ts`, `src/main.ts`                                     |
| CPU error-diffusion modes             | Omitted         | They require neighborhood work that does not fit the single-pass game budget. |
| Shader Boy editor and export surfaces | Omitted         | Dungeon Escape has no matching editor or export route.                        |
| CRT phosphor mask and scanlines       | Local extension | `src/systems/PovPostFx.ts`                                                    |

## Compatibility

The default palette is `off`. Existing saved settings load with this default. The effect uses the existing full-screen pass and adds no draw call.

Each palette owns its recommended dither amount, lightness/chroma weights, shadow range, flat-field suppression, edge response, and exposure bias. The shader perturbs Oklab lightness and then uses the Bayer threshold to choose between the two perceptually nearest colors. This keeps ordered dithering visible around gradients and readable objects without laying the same checker pattern over flat fog and black backgrounds.

The local Display Lab exposes multipliers for dither coverage, shadow guard, flat-background guard, edge detail, and palette exposure. Its presets cover every shipped palette; changing the player palette loads that palette's recommended master amount while persisted manual changes still round-trip.

## Visual evidence

The browser proof matrix renders the real `PovPostFx` shader against the same dark wall, fog, enemy, chest, and light targets for `off` plus all six palettes. Every capture linked two WebGL programs and completed a framebuffer capture. Evidence lives outside the public asset tree under the Codex visualization run `019feecb-784c-7be3-942c-6a69cef8b3ed/palette-matrix`.

## Debug and profile reference ledger

| Reference                     | Used | Path                                                                  | Result                                                                                                                    |
| ----------------------------- | ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Debug and profile checklist   | Yes  | `threejs-debug-profiler/references/debug-profile-checklists.md`       | The display lab stays local, uses the existing render loop, and reports live frame, call, and program counts.             |
| Scene debugging checklist     | Yes  | `threejs-debug-profiler/references/checklists/scene-debugging.md`     | Browser proof covers canvas output, WebGL errors, interaction, and screenshots.                                           |
| Performance profile checklist | Yes  | `threejs-debug-profiler/references/checklists/performance-profile.md` | The comparison keeps one post pass and stable uniforms. No material or shader variant is created while a control changes. |
