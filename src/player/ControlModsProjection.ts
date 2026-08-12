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
export function projectLocomotionMods(
  source: ControlModsSource,
  target: ProjectedLocomotionMods = {
    invertLook: false,
    invertMove: false,
    yawBias: 0,
    sensitivityScale: 1,
    slowActive: false,
    mobilityActive: false,
  },
): ProjectedLocomotionMods {
  const mirror = isTimedSecondsActive(source.mirrorCurseRemaining);
  const spin = isTimedSecondsActive(source.spinCurseRemaining);
  target.invertLook = mirror;
  target.invertMove = mirror;
  target.yawBias = spin ? SPIN_CURSE_YAW_BIAS : 0;
  target.sensitivityScale = spin ? SPIN_CURSE_SENSITIVITY_SCALE : 1;
  target.slowActive = isTimedSecondsActive(source.slowCurseRemaining ?? 0);
  target.mobilityActive = isTimedSecondsActive(source.mobilityBoostRemaining ?? 0);
  return target;
}
