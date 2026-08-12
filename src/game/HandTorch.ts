/** Equipped wall-torch fuel clock. Pure for save/resume and gameplay tests. */

import { isTimedSecondsActive, replaceTimedSeconds, tickTimedSeconds } from "./TimedSeconds";

/** Held torch burns out after this many gameplay seconds. */
export const HAND_TORCH_DURATION_SECONDS = 15;
/** Player lantern while unarmed — just enough to read adjacent masonry. */
export const HAND_TORCH_UNLIT_LANTERN_MUL = 0.16;
/** Player lantern + forward beam while the held torch is burning. */
export const HAND_TORCH_LIT_LANTERN_MUL = 1.38;
/** Fade the last seconds of fuel into the unlit floor. */
export const HAND_TORCH_LIGHT_FADE_SECONDS = 1.2;
/** Held torch also thins fog so the corridor ahead reads. */
export const HAND_TORCH_LIT_FOG_MUL = 0.72;

/** Grabbing a wall torch always refreshes a full fuel window. */
export function activateHandTorch(durationSeconds = HAND_TORCH_DURATION_SECONDS): number {
  return replaceTimedSeconds(durationSeconds);
}

export function tickHandTorch(remainingSeconds: number, deltaSeconds: number): number {
  return tickTimedSeconds(remainingSeconds, deltaSeconds, {
    maxSeconds: HAND_TORCH_DURATION_SECONDS,
  });
}

export function isHandTorchActive(remainingSeconds: number): boolean {
  return isTimedSecondsActive(remainingSeconds);
}

/** 0..1 burn strength used for lantern/fog (1 while the window is healthy). */
export function handTorchBurnFactor(remainingSeconds: number): number {
  if (!isHandTorchActive(remainingSeconds)) return 0;
  return Math.min(1, remainingSeconds / HAND_TORCH_LIGHT_FADE_SECONDS);
}

export function handTorchLanternMultiplier(remainingSeconds: number): number {
  const burn = handTorchBurnFactor(remainingSeconds);
  return (
    HAND_TORCH_UNLIT_LANTERN_MUL +
    (HAND_TORCH_LIT_LANTERN_MUL - HAND_TORCH_UNLIT_LANTERN_MUL) * burn
  );
}

export function handTorchFogMultiplier(remainingSeconds: number): number {
  const burn = handTorchBurnFactor(remainingSeconds);
  return 1 + (HAND_TORCH_LIT_FOG_MUL - 1) * burn;
}
