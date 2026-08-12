# ADR 0009: WebGPU renderer and TSL materials

Status: proposed

Date: 2026-08-12

## Context

Play still boots on `WebGLRenderer` with many `ShaderMaterial` and `onBeforeCompile` paths. Cold load pays a long shader-compile stall (~5.5s / ~112 programs on the documented topology), and draw-call headroom forced shadows off and CRT opt-in.

Three.js r185 exposes `three/webgpu` (`WebGPURenderer`, `RenderPipeline`) and `three/tsl` (638 nodes). Classic `ShaderMaterial` / `onBeforeCompile` do not run on the WebGPU path. Node materials run on WebGPU and on the WebGL2 fallback of `WebGPURenderer`.

## Decision

- One renderer factory (`PlayRendererFactory`) selects WebGPU or WebGL from launch preference. Default remains WebGL until a staged flip (WGP-23).
- Custom look is authored in TSL. New code must not add `ShaderMaterial` or `onBeforeCompile`.
- Migration is expand-contract: each VFX keeps a GLSL path and adds a TSL path behind `ShaderProgramMode` (`glsl` | `tsl`), then GLSL is deleted after the flip.
- Post-processing moves to `RenderPipeline` (not `EffectComposer`, not deprecated `PostProcessing`).
- `WebGPURenderer` with `forceWebGL` is the supported fallback for machines without a WebGPU adapter; both backends share TSL materials.

## Consequences

- Agents and humans port VFX incrementally without a long-lived parallel renderer branch.
- Linux / Firefox Android stay on the WebGL2 backend until their browsers support WebGPU.
- Debugging shaders means inspecting TSL graphs (for example `webgpu_tsl_editor`), not string-matching GLSL.
- Related: ADR 0001 (Play runtime owns order), ADR 0007 (resident four-floor stack budget), ADR 0008 (Forge boundary unchanged).
