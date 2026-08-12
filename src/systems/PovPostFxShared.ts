/** Shared POV post-FX constants (GLSL + TSL paths). */

export const POV_VIGNETTE_STRENGTH = 0.1;
export const POV_VIGNETTE_INNER_RADIUS = 0.62;
export const POV_CRT_HISTORY_WEIGHT = 0.16;
export const POV_CRT_HALATION_STRENGTH = 0.16;
/** Heavy CRT composite runs below scene resolution, then uses one cheap upscale. */
export const POV_CRT_RENDER_SCALE = 0.8;
