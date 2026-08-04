/**
 * Pure projection from timed curse/power remaining values into controller mods.
 * The shell applies this once per phase instead of inlining spin/mirror constants.
 */

import { SPIN_CURSE_SENSITIVITY_SCALE, SPIN_CURSE_YAW_BIAS } from "../game/SpinCurse";
import { isTimedSecondsActive } from "../game/TimedSeconds";

export interface ControlModsSource {
  mirrorCurseRemaining: number;
  spinCurseRemaining: number;
  slowCurseRemaining?: number;
  mobilityBoostRemaining?: number;
}

export interface ProjectedLocomotionMods {
  invertLook: boolean;
  invertMove: boolean;
  yawBias: number;
  sensitivityScale: number;
  slowActive: boolean;
  mobilityActive: boolean;
}

/** Map remaining curse/power windows into absolute locomotion modifiers. */
export function projectLocomotionMods(source: ControlModsSource): ProjectedLocomotionMods {
  const mirror = isTimedSecondsActive(source.mirrorCurseRemaining);
  const spin = isTimedSecondsActive(source.spinCurseRemaining);
  return {
    invertLook: mirror,
    invertMove: mirror,
    yawBias: spin ? SPIN_CURSE_YAW_BIAS : 0,
    sensitivityScale: spin ? SPIN_CURSE_SENSITIVITY_SCALE : 1,
    slowActive: isTimedSecondsActive(source.slowCurseRemaining ?? 0),
    mobilityActive: isTimedSecondsActive(source.mobilityBoostRemaining ?? 0),
  };
}
