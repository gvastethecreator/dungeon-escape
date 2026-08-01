import { MOBILITY_BOOST_CAMERA_BOB_SCALE, MOBILITY_BOOST_FOV_KICK } from "../game/MobilityBoost";

/** Peak camera bank while fully strafing (radians). */
export const STRAFE_LEAN_MAX = 0.052;
/** How quickly lean eases toward the current strafe. */
export const STRAFE_LEAN_RESPONSE = 8.2;

export interface CameraMotionInput {
  delta: number;
  moved: boolean;
  sprinting: boolean;
  reducedMotion: boolean;
  motionScale: number;
  velocityX: number;
  velocityZ: number;
  rightX: number;
  rightZ: number;
  maxSpeed: number;
  stridePhase: number;
  elapsed: number;
  landingDip: number;
  strafeLean: number;
  currentFov: number;
  baseFov: number;
  mobilityBoost: boolean;
}

export interface CameraMotionProjection {
  rightOffset: number;
  verticalOffset: number;
  landingDip: number;
  roll: number;
  fov: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function damp(current: number, target: number, response: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-response * Math.max(0, delta)));
}

/** Map world-space walk velocity onto camera roll. */
export function computeStrafeLeanTarget(
  velocityX: number,
  velocityZ: number,
  rightX: number,
  rightZ: number,
  referenceSpeed: number,
  maxLean = STRAFE_LEAN_MAX,
): number {
  const speed = Math.max(0.001, referenceSpeed);
  const rightLength = Math.hypot(rightX, rightZ);
  if (rightLength < 1e-6 || Math.abs(maxLean) < 1e-8) return 0;
  const lateral = velocityX * (rightX / rightLength) + velocityZ * (rightZ / rightLength);
  return -clamp(lateral / speed, -1, 1) * maxLean;
}

/** Pure camera-motion step; callers may reuse `output` on the render path. */
export function stepCameraMotion(
  input: CameraMotionInput,
  output: CameraMotionProjection = {
    rightOffset: 0,
    verticalOffset: 0,
    landingDip: 0,
    roll: 0,
    fov: input.baseFov,
  },
): CameraMotionProjection {
  if (input.reducedMotion) {
    output.rightOffset = 0;
    output.verticalOffset = 0;
    output.landingDip = 0;
    output.roll = 0;
    output.fov = input.baseFov;
    return output;
  }

  const motionScale = clamp(input.motionScale, 0, 1);
  const speedRatio = clamp(
    Math.hypot(input.velocityX, input.velocityZ) / Math.max(0.001, input.maxSpeed),
    0,
    1,
  );
  const stride = input.moved ? speedRatio : 0;
  const bobScale = input.mobilityBoost ? MOBILITY_BOOST_CAMERA_BOB_SCALE : 1;
  output.rightOffset = Math.sin(input.stridePhase) * 0.024 * stride * motionScale * bobScale;
  const bobY =
    (Math.abs(Math.sin(input.stridePhase)) * 0.05 - 0.009) * stride * motionScale * bobScale;
  const breath = Math.sin(input.elapsed * 1.65) * 0.0035 * (1 - stride) * motionScale;
  output.landingDip = damp(input.landingDip, 0, 13, input.delta);
  output.verticalOffset = bobY + breath + output.landingDip * motionScale;

  const leanTarget = computeStrafeLeanTarget(
    input.velocityX,
    input.velocityZ,
    input.rightX,
    input.rightZ,
    input.maxSpeed,
    STRAFE_LEAN_MAX * motionScale,
  );
  output.roll = damp(input.strafeLean, leanTarget, STRAFE_LEAN_RESPONSE, input.delta);

  const boostFovKick = input.mobilityBoost ? MOBILITY_BOOST_FOV_KICK * stride : 0;
  const targetFov =
    input.baseFov + ((input.sprinting ? 3.2 : stride * 0.8) + boostFovKick) * motionScale;
  output.fov = damp(input.currentFov, targetFov, 7.5, input.delta);
  return output;
}
